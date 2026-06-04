const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const extract = require('extract-zip');
const { execFile } = require('child_process');
const { path7za } = require('7zip-bin');

const config = require('../config');

let releasesCache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function extractArchive(archivePath, targetDir) {
    const lower = archivePath.toLowerCase();
    if (lower.endsWith('.7z')) {
        return new Promise((resolve, reject) => {
            execFile(path7za, ['x', archivePath, `-o${targetDir}`, '-y'], (err, stdout, stderr) => {
                if (err) {
                    console.error('7za extract error:', err, stderr);
                    return reject(new Error(`7z extraction failed: ${err.message || stderr}`));
                }
                resolve();
            });
        });
    } else {
        await extract(archivePath, { dir: targetDir });
    }
}

async function getFsr4Releases() {
    const now = Date.now();
    if (releasesCache && (now - cacheTime < CACHE_TTL)) {
        console.log("[FSR4] Returning cached releases.");
        return releasesCache.map(r => {
            const targetDir = path.join(config.modsPath, 'fsr4files', r.name);
            let installed = false;
            if (fs.existsSync(targetDir)) {
                try {
                    const files = fs.readdirSync(targetDir);
                    if (files.length > 0) {
                        installed = true;
                    }
                } catch (e) {}
            }
            return { ...r, installed };
        });
    }

    try {
        const response = await fetch('https://api.github.com/repos/vuenxx/extra_policebosstr/releases', {
            headers: { 'User-Agent': 'vuenxxFG' }
        });

        if (response.status === 403) {
            const rateLimitReset = response.headers.get('X-RateLimit-Reset');
            let errorMsg = "GitHub API limitine ulaşıldı. Lütfen daha sonra tekrar deneyin.";
            if (rateLimitReset) {
                const resetDate = new Date(parseInt(rateLimitReset) * 1000);
                errorMsg += ` (Sıfırlanma zamanı: ${resetDate.toLocaleTimeString()})`;
            }
            throw new Error(errorMsg);
        }

        if (!response.ok) throw new Error(`GitHub API HTTP error: ${response.status}`);
        const releases = await response.json();

        if (!Array.isArray(releases)) {
            throw new Error("Invalid response format from GitHub API.");
        }

        const mappedReleases = [];
        for (const r of releases) {
            const asset = r.assets && r.assets.find(a => {
                const nameLow = a.name.toLowerCase();
                return nameLow.startsWith('fsr') && (nameLow.endsWith('.zip') || nameLow.endsWith('.7z'));
            });
            if (!asset) continue;

            const tag = r.tag_name;
            const name = r.name || r.tag_name;

            mappedReleases.push({
                name: name,
                tag: tag,
                downloadUrl: asset.browser_download_url
            });
        }

        releasesCache = mappedReleases;
        cacheTime = now;

        return mappedReleases.map(r => {
            const targetDir = path.join(config.modsPath, 'fsr4files', r.name);
            let installed = false;
            if (fs.existsSync(targetDir)) {
                try {
                    const files = fs.readdirSync(targetDir);
                    if (files.length > 0) {
                        installed = true;
                    }
                } catch (e) {}
            }
            return { ...r, installed };
        });
    } catch (e) {
        console.error("Failed to fetch FSR4 releases:", e);
        if (releasesCache) {
            console.log("[FSR4] Fetch failed, returning stale cache as fallback.");
            return releasesCache.map(r => {
                const targetDir = path.join(config.modsPath, 'fsr4files', r.name);
                let installed = false;
                if (fs.existsSync(targetDir)) {
                    try {
                        const files = fs.readdirSync(targetDir);
                        if (files.length > 0) {
                            installed = true;
                        }
                    } catch (err) {}
                }
                return { ...r, installed };
            });
        }
        return { error: e.message };
    }
}

async function downloadFsr4Release(event, { name, downloadUrl }) {
    const is7z = downloadUrl.toLowerCase().endsWith('.7z');
    const ext = is7z ? '.7z' : '.zip';
    const tempZipPath = path.join(app.getPath('temp'), `fsr4_${name.replace(/[^a-z0-9.-]/gi, '_')}${ext}`);
    const targetDir = path.join(config.modsPath, 'fsr4files', name);

    try {
        if (!downloadUrl) throw new Error("İndirme linki bulunamadı.");

        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);

        const contentLength = +response.headers.get('Content-Length') || 0;
        const reader = response.body.getReader();
        let receivedLength = 0;
        let chunks = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            receivedLength += value.length;
            if (contentLength && event && event.sender && !event.sender.isDestroyed()) {
                const percent = Math.round((receivedLength / contentLength) * 100);
                event.sender.send('fsr4-download-progress', { percent });
            }
        }

        const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
        fs.writeFileSync(tempZipPath, buffer);

        if (fs.existsSync(targetDir)) {
            try {
                fs.rmSync(targetDir, { recursive: true, force: true });
            } catch (e) {
                console.error("Failed to clean targetDir:", e);
            }
        }
        fs.mkdirSync(targetDir, { recursive: true });

        if (event && event.sender && !event.sender.isDestroyed()) {
            event.sender.send('fsr4-download-progress', { percent: 100, stage: 'extracting' });
        }

        await extractArchive(tempZipPath, targetDir);

        try {
            fs.unlinkSync(tempZipPath);
        } catch (e) {
            console.error("Failed to clean up temp zip:", e);
        }

        return { success: true, targetDir };
    } catch (e) {
        console.error("FSR4 download error:", e);
        
        try {
            if (fs.existsSync(tempZipPath)) {
                fs.unlinkSync(tempZipPath);
            }
        } catch (unlinkErr) {
            console.error("Failed to clean up temp zip on error:", unlinkErr);
        }

        try {
            if (fs.existsSync(targetDir)) {
                fs.rmSync(targetDir, { recursive: true, force: true });
            }
        } catch (rmErr) {
            console.error("Failed to clean up target directory on error:", rmErr);
        }

        return { success: false, error: e.message };
    }
}

module.exports = {
    getFsr4Releases,
    downloadFsr4Release
};
