const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const config = require('./config');
const ipc = require('./ipc');
const windowManager = require('./window');
const { initAutoUpdater } = require('./updater');

const gotTheLock = app.requestSingleInstanceLock();
let tray = null;

function createTray(mainWindow) {
    try {
        const iconPath = path.resolve(__dirname, '..', '..', 'icons', 'program_logo.ico');
        const icon = nativeImage.createFromPath(iconPath);
        tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
        tray.setToolTip('Onyx Mods');

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Göster',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            },
            { type: 'separator' },
            {
                label: 'Çıkış',
                click: () => app.quit()
            }
        ]);

        tray.setContextMenu(contextMenu);
        tray.on('double-click', () => {
            if (mainWindow) {
                if (mainWindow.isVisible()) {
                    mainWindow.focus();
                } else {
                    mainWindow.show();
                }
            }
        });
    } catch (e) {
        console.error('[TRAY] Error creating tray:', e.message);
    }
}

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        const myWindow = BrowserWindow.getAllWindows()[0];
        if (myWindow) {
            if (myWindow.isMinimized()) myWindow.restore();
            myWindow.show();
            myWindow.focus();
        }
    });

    app.whenReady().then(() => {
        config.cleanOldModsFolder();
        config.loadExistingGames();
        config.loadBlacklist();

        ipc.registerIpcHandlers();

        const mainWindow = windowManager.createWindow();
        createTray(mainWindow);
        initAutoUpdater();

        app.on('activate', function () {
            if (BrowserWindow.getAllWindows().length === 0) {
                windowManager.createWindow();
            }
        });
    });
}

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
