const { ipcMain, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

const config = require('./config');
const scanner = require('./scanner');
const utils = require('./utils');
const dlssEnabler = require('./mods/dlssEnabler');
const optiScaler = require('./mods/optiScaler');
const optiPatcher = require('./mods/optiPatcher');
const fsr4Files = require('./mods/fsr4Files');
const streamline = require('./mods/streamline');
const uninstaller = require('./mods/uninstaller');
const compressor = require('./mods/compressor');
const analyser = require('./mods/analyser');
const steamScanner = require('./mods/steamScanner');
const iniEditor = require('./mods/iniEditor');
const updater = require('./updater');

let isScanning = false;
// C-06: Prevent duplicate IPC handler registration
let ipcRegistered = false;

function monitorGameProcess(event, gameName, pid) {
    const startTime = Date.now();
    const interval = setInterval(() => {
        try {
            process.kill(pid, 0); // throws if PID no longer exists
        } catch (e) {
            clearInterval(interval);
            const durationSeconds = Math.round((Date.now() - startTime) / 1000);
            if (durationSeconds < 5) return; // ignore very short sessions (launch fail)
            if (!event.sender.isDestroyed()) {
                event.sender.send('game-session-ended', { gameName, durationSeconds });
            }
        }
    }, 5000);
}

function registerIpcHandlers() {
    if (ipcRegistered) return;
    ipcRegistered = true;

    // Window controls
    ipcMain.on('window-minimize', () => BrowserWindow.getFocusedWindow()?.minimize());
    ipcMain.on('window-maximize', () => {
        const win = BrowserWindow.getFocusedWindow();
        if (!win) return;
        if (win.isMaximized()) { win.unmaximize(); } else { win.maximize(); }
    });
    ipcMain.on('window-close', () => BrowserWindow.getFocusedWindow()?.close());

    ipcMain.on('log-to-main', (event, msg) => {
        console.log(`[RENDERER] ${msg}`);
    });

    ipcMain.handle('get-app-version', () => {
        return require('electron').app.getVersion();
    });

    // Game retrieval
    ipcMain.handle('get-games', async () => {
        return config.getExistingGamesState();
    });

    ipcMain.handle('launch-game', async (event, game) => {
        const result = await require('./mods/launcher').launchGame(game);
        if (result.success && result.pid) {
            monitorGameProcess(event, game.name, result.pid);
        }
        return result;
    });

    // Scanner
    ipcMain.on('start-scan', async (event, scanSettings) => {
        if (isScanning) return; // Prevent multiple scans
        isScanning = true;

        try {
            await scanner.runScan(event, scanSettings);
        } catch(e) {
            console.error('Scan error', e);
            if (!event.sender.isDestroyed()) {
                event.sender.send('scan-error', e.message || 'Bilinmeyen tarama hatası');
            }
        } finally {
            isScanning = false;
            // M-18: Guard against sending to a destroyed window
            if (!event.sender.isDestroyed()) {
                event.sender.send('scan-complete');
            }
        }
    });

    // System Drives
    ipcMain.handle('get-system-drives', async () => {
        return await utils.getSystemDrives();
    });

    // System Hardware Info
    ipcMain.handle('get-system-info', async () => {
        const os = require('os');
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        const cpu = (os.cpus()[0]?.model || '').replace(/\s+/g, ' ').trim() || 'Bilinmiyor';
        const ramGB = Math.round(os.totalmem() / (1024 ** 3));

        let gpu = 'Bilinmiyor';
        let motherboard = 'Bilinmiyor';
        let windowsVersion = os.release();

        try {
            const r = await execAsync('powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name"', { timeout: 5000 });
            if (r.stdout.trim()) gpu = r.stdout.trim();
        } catch (e) {}

        try {
            const r = await execAsync('powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_BaseBoard).Product"', { timeout: 5000 });
            if (r.stdout.trim()) motherboard = r.stdout.trim();
        } catch (e) {}

        try {
            const r = await execAsync('powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_OperatingSystem).Caption"', { timeout: 5000 });
            if (r.stdout.trim()) windowsVersion = r.stdout.trim().replace('Microsoft ', '');
        } catch (e) {}

        return { cpu, ramGB, gpu, motherboard, windowsVersion };
    });

    // Manual Game adds — now opens a FOLDER dialog (game_root), not a file dialog
    ipcMain.handle('add-manual-game', async (event) => {
        console.log('[IPC] add-manual-game triggered');
        const window = BrowserWindow.fromWebContents(event.sender);
        const { canceled, filePaths } = await dialog.showOpenDialog(window, {
            title: 'Oyun Ana Klasörünü Seçin',
            properties: ['openDirectory']
        });

        if (canceled || filePaths.length === 0) {
            console.log('[IPC] add-manual-game: Selection canceled');
            return null;
        }
        const gameRoot = filePaths[0];
        const defaultName = path.basename(gameRoot); // Use folder name as default game name
        console.log(`[IPC] add-manual-game: Folder selected: ${gameRoot}, defaultName: ${defaultName}`);
        return { gameRoot, defaultName };
    });

    ipcMain.handle('save-manual-game', async (event, { name, gameRoot, exePath }) => {
        console.log(`[IPC] save-manual-game: Saving -> name="${name}", gameRoot="${gameRoot}", exePath="${exePath}"`);
        try {
            // Fallback: if gameRoot not provided but exePath is, derive gameRoot from exe
            const resolvedGameRoot = gameRoot || (exePath ? path.dirname(exePath) : null);
            const finalExePath = exePath || resolvedGameRoot;

            if (!resolvedGameRoot) {
                console.error('[IPC] save-manual-game: No gameRoot or exePath provided!');
                throw new Error('Oyun klasörü veya EXE yolu belirtilmedi.');
            }

            const normKey = config.normalizeGameKey(name);

            // 1. Save to user-games.json
            const userGames = config.getUserGames();
            userGames[normKey] = {
                game_root: resolvedGameRoot,
                exe_path: finalExePath,
                display_name: name
            };
            config.saveUserGames(userGames);
            console.log(`[IPC] save-manual-game: user-games.json updated -> key="${normKey}", game_root="${resolvedGameRoot}", exe_path="${finalExePath}"`);

            // 2. Process and stream to UI
            await scanner.processAndStreamGame({
                name: name,
                exePath: finalExePath,
                gameRoot: resolvedGameRoot,
                source: 'manual',
                coverUrl: null
            }, event);

            console.log('[IPC] save-manual-game: Completed successfully');
            return config.getExistingGamesState();
        } catch (e) {
            console.error("[IPC] save-manual-game ERROR:", e);
            throw e;
        }
    });

    // Blacklist
    ipcMain.handle('get-blacklist', async () => {
        return config.getBlacklistState();
    });

    ipcMain.handle('add-to-blacklist', async (event, gameName) => {
        const blacklistState = config.getBlacklistState();
        if (!blacklistState.includes(gameName)) {
            blacklistState.push(gameName);
            config.saveBlacklist();
        }

        // Disable custom subfolder checkbox state if it came from one
        const game = config.getExistingGamesState().find(g => g.name === gameName);
        if (game && game.gameRoot) {
            const parentDir = path.dirname(game.gameRoot);
            const customFolders = config.getCustomFolders();
            if (customFolders.includes(parentDir)) {
                const subfolderState = config.getCustomSubfoldersState();
                subfolderState[game.gameRoot] = false;
                config.saveCustomSubfoldersState(subfolderState);
                console.log(`[IPC] Automatically disabled custom subfolder state on blacklist for: ${game.gameRoot}`);
            }
        }

        const filteredGames = config.getExistingGamesState().filter(g => g.name !== gameName);
        config.setExistingGamesState(filteredGames);
        config.saveGamesState();

        const normKey = config.normalizeGameKey(gameName);
        const userGames = config.getUserGames();
        if (userGames[normKey]) {
            delete userGames[normKey];
            config.saveUserGames(userGames);
        }
        return true;
    });

    ipcMain.handle('remove-game', async (event, gameName) => {
        const game = config.getExistingGamesState().find(g => g.name === gameName);
        if (game && game.gameRoot) {
            const parentDir = path.dirname(game.gameRoot);
            const customFolders = config.getCustomFolders();
            if (customFolders.includes(parentDir)) {
                const subfolderState = config.getCustomSubfoldersState();
                subfolderState[game.gameRoot] = false;
                config.saveCustomSubfoldersState(subfolderState);
                console.log(`[IPC] Automatically disabled custom subfolder state on remove for: ${game.gameRoot}`);
            }
        }

        const filteredGames = config.getExistingGamesState().filter(g => g.name !== gameName);
        config.setExistingGamesState(filteredGames);
        config.saveGamesState();

        const normKey = config.normalizeGameKey(gameName);
        const userGames = config.getUserGames();
        if (userGames[normKey]) {
            delete userGames[normKey];
            config.saveUserGames(userGames);
        }
        return true;
    });

    ipcMain.handle('remove-from-blacklist', async (event, gameName) => {
        const filteredBlacklist = config.getBlacklistState().filter(name => name !== gameName);
        config.setBlacklistState(filteredBlacklist);
        config.saveBlacklist();
        return true;
    });

    ipcMain.handle('compare-versions', async (event, v1, v2) => {
        return utils.compareVersions(v1, v2);
    });

    ipcMain.handle('toggle-favorite', async (event, gameName) => {
        return config.toggleFavorite(gameName);
    });

    // Mod uninstallations
    ipcMain.handle('uninstall-mod', async (event, data) => {
        return await uninstaller.uninstallMod(data);
    });

    // DLSS Enabler
    ipcMain.handle('get-dlss-versions', async () => {
        return await dlssEnabler.getDlssVersions();
    });

    ipcMain.handle('select-exe', async (event) => {
        return await dlssEnabler.selectExe(event);
    });

    ipcMain.handle('execute-dlss-install', async (event, { game, exePath, version, dllName, downloadUrl }) => {
        return await dlssEnabler.executeDlssInstall(event, game, exePath, version, dllName, downloadUrl);
    });

    ipcMain.handle('auto-install-dlss', async (event, { game, version, dllName, downloadUrl }) => {
        return await dlssEnabler.autoInstallDlss(event, game, version, dllName, downloadUrl);
    });

    // DLSS Sürüm Yöneticisi
    ipcMain.handle('dlss-parse-zip', async (event, { filePath, fileName }) => {
        console.log(`[IPC] dlss-parse-zip: "${fileName}" @ "${filePath}"`);
        return await dlssEnabler.parseZipForDlss(filePath);
    });

    ipcMain.handle('dlss-install-from-zip', async (event, { filePath, version }) => {
        console.log(`[IPC] dlss-install-from-zip: sürüm="${version}" @ "${filePath}"`);
        return await dlssEnabler.installDlssFromZip(filePath, version);
    });

    ipcMain.handle('get-dlss-enabler-releases', async () => {
        return await dlssEnabler.getDlssEnablerReleases();
    });

    ipcMain.handle('download-dlss-enabler-release', async (event, { name, downloadUrl }) => {
        return await dlssEnabler.downloadDlssEnablerRelease(event, { name, downloadUrl });
    });

    // ── Dual-layer Game Path System IPCs ──────────────────────────────────────

    /** Returns the full user-games.json map */
    ipcMain.handle('get-user-games', async () => {
        return config.getUserGames();
    });

    /** Save or update a user game entry */
    ipcMain.handle('save-user-game', async (event, { gameName, gameRoot, exePath }) => {
        console.log(`[IPC] save-user-game: gameName="${gameName}", gameRoot="${gameRoot}", exePath="${exePath}"`);
        const normKey = config.normalizeGameKey(gameName);
        const userGames = config.getUserGames();
        userGames[normKey] = {
            game_root: gameRoot,
            exe_path: exePath || gameRoot,
            display_name: gameName
        };
        config.saveUserGames(userGames);

        // Also try to scan this game now so it appears in the UI immediately
        const finalExePath = exePath || gameRoot;
        if (finalExePath && fs.existsSync(finalExePath)) {
            await scanner.processAndStreamGame({
                name: gameName,
                exePath: finalExePath,
                gameRoot: gameRoot,
                source: 'manual',
                coverUrl: null
            }, event);
        }

        return config.getUserGames();
    });

    /** Delete a user game entry by normalized key */
    ipcMain.handle('delete-user-game', async (event, normKey) => {
        const userGames = config.getUserGames();
        if (userGames[normKey]) {
            delete userGames[normKey];
            config.saveUserGames(userGames);
        }
        return config.getUserGames();
    });

    /** Returns developer-games.json (read-only, for UI display) */
    ipcMain.handle('get-developer-games', async () => {
        return config.getDeveloperGames();
    });

    /**
     * Resolves paths for a game using the dual-layer priority system.
     * Returns { game_root, exe_path, source } or null.
     */
    ipcMain.handle('resolve-game-paths', async (event, gameName, exePath) => {
        return config.getGamePaths(gameName, exePath);
    });

    // Streamline
    ipcMain.handle('get-streamline-versions', async () => {
        return await streamline.getStreamlineVersions();
    });

    ipcMain.handle('check-streamline-backup', async (event, { game, isAuto, manualExePath }) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        return await streamline.checkStreamlineBackup(game, isAuto, manualExePath, window);
    });

    ipcMain.handle('install-streamline', async (event, { game, version, targetDir, overwriteBackup, skipBackup }) => {
        return await streamline.installStreamline(game, version, targetDir, overwriteBackup, skipBackup);       
    });

    ipcMain.handle('restore-streamline', async (event, { gameName }) => {
        return await streamline.restoreStreamline(gameName);
    });

    ipcMain.handle('get-streamline-releases', async () => {
        return await streamline.getStreamlineReleases();
    });

    ipcMain.handle('download-streamline-release', async (event, { tag, downloadUrl }) => {
        return await streamline.downloadStreamlineRelease(event, { tag, downloadUrl });
    });

    // OptiScaler
    ipcMain.handle('get-optiscaler-releases', async () => {
        return await optiScaler.getOptiScalerReleases();
    });

    ipcMain.handle('download-optiscaler-release', async (event, { tag, downloadUrl }) => {
        return await optiScaler.downloadOptiScalerRelease(event, { tag, downloadUrl });
    });

    ipcMain.handle('install-optiscaler', async (event, data) => {
        return await optiScaler.installOptiScaler(event, data);
    });

    // OptiPatcher
    ipcMain.handle('get-optipatcher-releases', async () => {
        return await optiPatcher.getOptiPatcherReleases();
    });

    ipcMain.handle('download-optipatcher-release', async (event, { tag, downloadUrl }) => {
        return await optiPatcher.downloadOptiPatcherRelease(event, { tag, downloadUrl });
    });

    // FSR4 Files
    ipcMain.handle('get-fsr4-releases', async () => {
        return await fsr4Files.getFsr4Releases();
    });

    ipcMain.handle('download-fsr4-release', async (event, { name, downloadUrl }) => {
        return await fsr4Files.downloadFsr4Release(event, { name, downloadUrl });
    });

    // Folder selection
    ipcMain.handle('select-folder', async (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        const { canceled, filePaths } = await dialog.showOpenDialog(window, {
            title: 'Klasör Seç',
            properties: ['openDirectory']
        });

        if (canceled || filePaths.length === 0) return null;
        return filePaths[0];
    });

    ipcMain.handle('analyze-folder', async (event, folderPath) => {
        return await analyser.analyze(folderPath);
    });

    ipcMain.handle('get-folder-game-info', async (event, folderPath) => {
        // Compression DB disabled per user request — only return Steam identity info
        const steamInfo = await steamScanner.getAppIdForFolder(folderPath);
        if (steamInfo && steamInfo.appId) {
            return {
                isGame: true,
                steamId: steamInfo.appId,
                name: steamInfo.name,
                dbEntry: null
            };
        }
        return { isGame: false };
    });

    // Compression Core
    ipcMain.handle('run-compression', async (event, { folderPath, algorithm }) => {
        return await compressor.compress(folderPath, algorithm, {}, (progress) => {
            // M-18: Guard against sending to destroyed window
            if (!event.sender.isDestroyed()) {
                event.sender.send('compression-progress', { folderPath, progress });
            }
        });
    });

    ipcMain.handle('run-uncompression', async (event, { folderPath }) => {
        return await compressor.uncompress(folderPath, (progress) => {
            // M-18: Guard against sending to destroyed window
            if (!event.sender.isDestroyed()) {
                event.sender.send('compression-progress', { folderPath, progress });
            }
        });
    });


    // INI Editor
    ipcMain.handle('read-mod-ini', async (event, { game, mod }) => {
        console.log(`[IPC] read-mod-ini: requested for mod "${mod}", game Name: "${game ? game.name : 'undefined'}"`);
        console.log(`[IPC] read-mod-ini: game data:`, JSON.stringify(game, null, 2));
        const filePath = iniEditor.findIniPath(game, mod);
        console.log(`[IPC] read-mod-ini: resolved filePath is "${filePath}"`);
        if (!filePath) {
            console.log(`[IPC] read-mod-ini: returning EXE not found error`);
            return { exists: false, error: 'Oyun EXE yolu bulunamadı.' };
        }
        try {
            const res = iniEditor.readIni(filePath);
            console.log(`[IPC] read-mod-ini: readIni returned:`, JSON.stringify(res, null, 2));
            return res;
        } catch (err) {
            console.error('[IPC] read-mod-ini: Error reading INI:', err);
            return { exists: false, error: err.message };
        }
    });

    ipcMain.handle('write-mod-ini', async (event, { game, mod, data }) => {
        console.log(`[IPC] write-mod-ini: requested for mod "${mod}", game Name: "${game ? game.name : 'undefined'}"`);
        console.log(`[IPC] write-mod-ini: game data:`, JSON.stringify(game, null, 2));
        console.log(`[IPC] write-mod-ini: data payload:`, JSON.stringify(data, null, 2));
        const filePath = iniEditor.findIniPath(game, mod);
        console.log(`[IPC] write-mod-ini: resolved filePath is "${filePath}"`);
        if (!filePath) {
            console.log(`[IPC] write-mod-ini: returning EXE not found error`);
            return { success: false, error: 'Oyun EXE yolu bulunamadı.' };
        }
        try {
            iniEditor.writeIni(filePath, data);
            console.log(`[IPC] write-mod-ini: successfully wrote INI to "${filePath}"`);
            return { success: true };
        } catch (err) {
            console.error('[IPC] write-mod-ini: Error writing INI:', err);
            // Catching Windows EBUSY specifically
            if (err.code === 'EBUSY') {
                return { success: false, error: 'Dosya kullanılıyor. Oyun açık olabilir, oyunu kapatıp tekrar deneyin.' };
            }
            return { success: false, error: err.message };
        }
    });

    // Mod Presets
    ipcMain.handle('mod-presets:read', async (event, { mod }) => {
        console.log(`[IPC] mod-presets:read for mod="${mod}"`);
        try {
            return { success: true, presets: config.getModPresets(mod) };
        } catch (e) {
            console.error('[IPC] mod-presets:read error:', e.message);
            return { success: false, presets: [], error: e.message };
        }
    });

    ipcMain.handle('mod-presets:write', async (event, { mod, presets }) => {
        console.log(`[IPC] mod-presets:write for mod="${mod}", count=${presets ? presets.length : 0}`);
        try {
            config.saveModPresets(mod, presets);
            return { success: true };
        } catch (e) {
            console.error('[IPC] mod-presets:write error:', e.message);
            return { success: false, error: e.message };
        }
    });

    // GamerPower Free Games Fetcher using modern fetch API
    ipcMain.handle('fetch-free-games', async () => {
        try {
            const response = await fetch('https://www.gamerpower.com/api/giveaways', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('[IPC] fetch-free-games error:', error);
            throw error;
        }
    });

    // GitHub Releases API — tüm sürümleri çek
    ipcMain.handle('fetch-all-releases', async () => {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                path: '/repos/swaffX/onyx-mods/releases',
                method: 'GET',
                headers: {
                    'User-Agent': 'Onyx-Mods-App',
                    'Accept': 'application/vnd.github.v3+json'
                }
            };
            const req = https.get(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const releases = JSON.parse(data);
                        if (!Array.isArray(releases)) {
                            console.error('[IPC] fetch-all-releases: Beklenmedik yanıt:', data.slice(0, 200));
                            resolve([]);
                            return;
                        }
                        // Sadece gerekli alanları gönder
                        const filtered = releases.map(r => ({
                            tag_name:    r.tag_name,
                            name:        r.name,
                            body:        r.body,
                            published_at: r.published_at,
                            prerelease:  r.prerelease,
                            draft:       r.draft,
                            html_url:    r.html_url
                        }));
                        resolve(filtered);
                    } catch (e) {
                        console.error('[IPC] fetch-all-releases parse hatası:', e.message);
                        reject(e);
                    }
                });
            });
            req.on('error', (err) => {
                console.error('[IPC] fetch-all-releases request hatası:', err.message);
                reject(err);
            });
        });
    });

    // Custom scan folders
    ipcMain.handle('get-custom-folders', async () => {
        return config.getCustomFolders();
    });

    ipcMain.handle('save-custom-folders', async (event, folders) => {
        config.saveCustomFolders(folders);
        return true;
    });

    ipcMain.handle('get-custom-subfolders-list', async (event) => {
        console.log('[IPC] get-custom-subfolders-list triggered');
        const folders = config.getCustomFolders();
        const savedState = config.getCustomSubfoldersState();
        const result = [];

        for (const folder of folders) {
            try {
                if (!fs.existsSync(folder)) {
                    console.log(`[IPC] custom folder does not exist: ${folder}`);
                    continue;
                }
                const dirents = await fs.promises.readdir(folder, { withFileTypes: true });
                for (const dirent of dirents) {
                    if (dirent.isDirectory()) {
                        if (scanner.isIgnoredGame({ name: dirent.name, exePath: '' })) {
                            console.log(`[IPC] Ignoring blacklisted launcher/redist subfolder: ${dirent.name}`);
                            continue;
                        }
                        const subfolderPath = path.join(folder, dirent.name);
                        const checked = savedState[subfolderPath] !== false;
                        result.push({
                            parentFolder: folder,
                            name: dirent.name,
                            path: subfolderPath,
                            checked: checked
                        });
                    }
                }
            } catch (e) {
                console.error(`[IPC] Error scanning custom folder ${folder}:`, e.message);
            }
        }
        return result;
    });

    ipcMain.handle('save-custom-subfolders-list', async (event, subfolders) => {
        console.log('[IPC] save-custom-subfolders-list triggered');
        const window = BrowserWindow.fromWebContents(event.sender);
        const savedState = config.getCustomSubfoldersState();
        const existingGames = config.getExistingGamesState();

        // 1. Save all states first (remember checkboxes for unchecked items too)
        for (const item of subfolders) {
            savedState[item.path] = item.checked;
        }
        config.saveCustomSubfoldersState(savedState);

        // 2. Filter out the checked ones to process
        const checkedItems = subfolders.filter(item => item.checked);
        const totalItems = checkedItems.length;
        let processedCount = 0;

        if (totalItems > 0) {
            event.sender.send('scan-progress', 0);
            
            for (const item of checkedItems) {
                const gameName = item.name;
                const gameRoot = item.path;
                const normKey = config.normalizeGameKey(gameName);

                const existingGame = existingGames.find(g => g.name.toLowerCase() === gameName.toLowerCase() || g.gameRoot === gameRoot);
                if (existingGame) {
                    const response = await dialog.showMessageBox(window, {
                        type: 'question',
                        buttons: ['Evet', 'Hayır'],
                        title: 'Çakışma Tespit Edildi',
                        message: `"${gameName}" zaten listenizde mevcut. Mevcut oyunun verilerini üzerine yazmak istiyor musunuz?`
                    });

                    if (response.response !== 0) {
                        processedCount++;
                        const percent = Math.round((processedCount / totalItems) * 100);
                        event.sender.send('scan-progress', percent);
                        continue;
                    }
                    const updatedGamesList = existingGames.filter(g => g !== existingGame);
                    config.setExistingGamesState(updatedGamesList);
                }

                const devGames = config.getDeveloperGames();
                let exePath = gameRoot;
                if (devGames[normKey] && devGames[normKey].exe_relative_path) {
                    const relPath = devGames[normKey].exe_relative_path.replace(/\//g, '\\');
                    exePath = path.join(gameRoot, relPath);
                }

                try {
                    await scanner.processAndStreamGame({
                        name: gameName,
                        exePath: exePath,
                        gameRoot: gameRoot,
                        source: 'manual',
                        coverUrl: null
                    }, event);
                } catch (e) {
                    console.error(`[IPC] Error processing custom game ${gameName}:`, e.message);
                }

                processedCount++;
                const percent = Math.round((processedCount / totalItems) * 100);
                event.sender.send('scan-progress', percent);
            }
            // Tüm oyunlar işlendikten sonra son bir kayıt (her oyun için ayrı kayıt yerine daha verimli)
            config.saveGamesState();
        }

        return config.getExistingGamesState();
    });

    // ── Shader Cache ──────────────────────────────────────────────────────────
    const shaderCache = require('./mods/shaderCache');

    ipcMain.handle('get-shader-cache-info', async () => {
        return await shaderCache.getShaderCacheInfo();
    });

    ipcMain.handle('clean-shader-cache', async (event, selectedPaths) => {
        return await shaderCache.cleanShaderCaches(selectedPaths);
    });

    // ── Mod Update Check ─────────────────────────────────────────────────────
    ipcMain.handle('check-mod-updates', async () => {
        const results = {};
        const checks = [
            { key: 'dlssEnabler',  fetch: () => dlssEnabler.getDlssEnablerReleases() },
            { key: 'optiScaler',   fetch: () => optiScaler.getOptiScalerReleases() },
            { key: 'streamline',   fetch: () => streamline.getStreamlineReleases() },
            { key: 'optiPatcher',  fetch: () => optiPatcher.getOptiPatcherReleases() },
        ];
        await Promise.all(checks.map(async ({ key, fetch }) => {
            try {
                const releases = await fetch();
                const latest = Array.isArray(releases) && releases.length > 0 ? releases[0].tag_name || releases[0].name || '' : '';
                results[key] = latest.replace(/^v/i, '');
            } catch (e) {
                results[key] = null;
            }
        }));
        return results;
    });

    // ── Disk Usage ───────────────────────────────────────────────────────────
    ipcMain.handle('get-games-disk-usage', async (event) => {
        const games = config.getExistingGamesState();
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        const results = [];

        for (const game of games) {
            const gameRoot = game.gameRoot;
            if (!gameRoot || !fs.existsSync(gameRoot)) continue;
            try {
                const safe = gameRoot.replace(/'/g, "''");
                const r = await execAsync(
                    `powershell -NoProfile -NonInteractive -Command "(Get-ChildItem -Path '${safe}' -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum"`,
                    { timeout: 15000 }
                );
                const sizeBytes = parseInt(r.stdout.trim()) || 0;
                results.push({ name: game.name, sizeBytes, gameRoot });

                if (!event.sender.isDestroyed()) {
                    event.sender.send('disk-usage-progress', { name: game.name, sizeBytes, done: false });
                }
            } catch (e) {
                results.push({ name: game.name, sizeBytes: 0, gameRoot });
            }
        }

        if (!event.sender.isDestroyed()) {
            event.sender.send('disk-usage-progress', { done: true });
        }
        return results;
    });

    // ── Game Mover ───────────────────────────────────────────────────────────
    const gameMover = require('./mods/gameMover');

    ipcMain.handle('move-game', async (event, { gameRoot, destFolder }) => {
        return await gameMover.moveGame(gameRoot, destFolder, (progress) => {
            if (!event.sender.isDestroyed()) {
                event.sender.send('game-move-progress', progress);
            }
        });
    });

    // ── Notification ─────────────────────────────────────────────────────────
    ipcMain.on('show-notification', (event, { title, body }) => {
        try {
            const { Notification } = require('electron');
            if (Notification.isSupported()) {
                new Notification({ title, body }).show();
            }
        } catch (e) {
            console.error('[IPC] show-notification error:', e.message);
        }
    });

    // C-05: Secure Link Opener via IPC — only allow http/https URLs
    ipcMain.on('open-external-link', (event, url) => {
        if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
            shell.openExternal(url);
        } else {
            console.warn('[IPC] open-external-link: blocked non-http URL:', url);
        }
    });

    // ── Auto-Updater IPCs ──────────────────────────────────────────────────────

    // Kullanıcı "Güncelleme Kontrol Et" butonuna bastığında
    ipcMain.handle('check-for-updates-manual', async () => {
        try {
            const result = await updater.checkForUpdates();
            return { success: true, result };
        } catch (e) {
            console.error('[IPC] check-for-updates-manual ERROR:', e.message);
            return { success: false, error: e.message };
        }
    });

    // Kullanıcı "İndir" butonuna bastığında
    ipcMain.on('start-update-download', () => {
        updater.startDownload();
    });

    // Kullanıcı "Kur ve Yeniden Başlat" butonuna bastığında
    ipcMain.on('quit-and-install', () => {
        updater.quitAndInstall();
    });
}

module.exports = {
    registerIpcHandlers
};
