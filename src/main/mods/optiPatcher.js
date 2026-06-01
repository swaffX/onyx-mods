const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const config = require('../config');

async function getOptiPatcherReleases() {
    try {
        const response = await fetch('https://api.github.com/repos/optiscaler/OptiPatcher/releases', {
            headers: { 'User-Agent': 'vuenxxFG' }
        });
        if (!response.ok) throw new Error(`GitHub API HTTP error: ${response.status}`);
        const releases = await response.json();

        return releases.slice(0, 10).map(r => {
            const tag = r.tag_name;
            const targetDir = path.join(config.modsPath, 'OptiPatcher', tag);
            const targetFile = path.join(targetDir, 'OptiPatcher.asi');
            let installed = false;

            if (fs.existsSync(targetFile)) {
                installed = true;
            }

            return {
                name: r.name || r.tag_name,
                tag: tag,
                downloadUrl: r.assets.find(a => a.name.toLowerCase().endsWith('.asi'))?.browser_download_url,
                installed: installed
            };
        });
    } catch (e) {
        console.error("Failed to fetch OptiPatcher releases:", e);
        return { error: e.message };
    }
}

async function downloadOptiPatcherRelease(event, { tag, downloadUrl }) {
    const tempAsiPath = path.join(app.getPath('temp'), `optipatcher_${tag.replace(/[^a-z0-9.-]/gi, '_')}.asi`);
    const targetDir = path.join(config.modsPath, 'OptiPatcher', tag);
    const targetFile = path.join(targetDir, 'OptiPatcher.asi');

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
                event.sender.send('optipatcher-download-progress', { percent });
            }
        }

        const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
        fs.writeFileSync(tempAsiPath, buffer);

        // Create target directory if it doesn't exist
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Copy from temp to target location
        fs.copyFileSync(tempAsiPath, targetFile);

        return { success: true, targetDir };
    } catch (e) {
        console.error("OptiPatcher download error:", e);
        return { success: false, error: e.message };
    } finally {
        // Always clean up the temp file regardless of success or failure
        try {
            if (fs.existsSync(tempAsiPath)) {
                fs.unlinkSync(tempAsiPath);
            }
        } catch (unlinkErr) {
            console.error("Failed to clean up temp file:", unlinkErr);
        }
    }
}


module.exports = {
    getOptiPatcherReleases,
    downloadOptiPatcherRelease
};
