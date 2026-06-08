const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const os = require('os');

const LOCAL_APPDATA = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

const SHADER_CACHES = [
    { name: 'NVIDIA DXCache',       path: path.join(LOCAL_APPDATA, 'NVIDIA', 'DXCache') },
    { name: 'NVIDIA GLCache',       path: path.join(LOCAL_APPDATA, 'NVIDIA', 'GLCache') },
    { name: 'DirectX Shader Cache', path: path.join(LOCAL_APPDATA, 'D3DSCache') },
    { name: 'AMD Shader Cache',     path: path.join(LOCAL_APPDATA, 'AMD', 'DxCache') },
];

async function getDirSizeBytes(dirPath) {
    try {
        const safe = dirPath.replace(/'/g, "''");
        const r = await execAsync(
            `powershell -NoProfile -NonInteractive -Command "(Get-ChildItem -Path '${safe}' -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum"`,
            { timeout: 12000 }
        );
        return parseInt(r.stdout.trim()) || 0;
    } catch (e) {
        return 0;
    }
}

async function getShaderCacheInfo() {
    const results = [];
    for (const cache of SHADER_CACHES) {
        if (!fs.existsSync(cache.path)) continue;
        const sizeBytes = await getDirSizeBytes(cache.path);
        results.push({ name: cache.name, path: cache.path, sizeBytes });
    }
    return results;
}

async function cleanShaderCaches(selectedPaths) {
    const KNOWN_PATHS = new Set(SHADER_CACHES.map(c => c.path));
    let totalFreed = 0;
    const cleaned = [];

    for (const cachePath of selectedPaths) {
        // Safety: only allow known safe paths
        if (!KNOWN_PATHS.has(cachePath)) continue;
        if (!fs.existsSync(cachePath)) continue;

        const sizeBefore = await getDirSizeBytes(cachePath);
        let filesDeleted = 0;

        try {
            const entries = fs.readdirSync(cachePath);
            for (const entry of entries) {
                const full = path.join(cachePath, entry);
                try {
                    const stat = fs.lstatSync(full);
                    if (stat.isDirectory()) {
                        fs.rmSync(full, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(full);
                    }
                    filesDeleted++;
                } catch (e) {
                    // skip locked files silently
                }
            }
        } catch (e) {
            console.error('[SHADER_CACHE] Error cleaning', cachePath, e.message);
        }

        const name = SHADER_CACHES.find(c => c.path === cachePath)?.name || path.basename(cachePath);
        cleaned.push({ name, path: cachePath, freedBytes: sizeBefore, filesDeleted });
        totalFreed += sizeBefore;
    }

    return { success: true, freedBytes: totalFreed, cleaned };
}

module.exports = { getShaderCacheInfo, cleanShaderCaches };
