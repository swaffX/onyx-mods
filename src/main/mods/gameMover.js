const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function moveGame(gameRoot, destFolder, onProgress) {
    if (!fs.existsSync(gameRoot)) {
        return { success: false, error: 'Kaynak klasör bulunamadı.' };
    }

    const folderName = path.basename(gameRoot);
    const destPath = path.join(destFolder, folderName);

    if (fs.existsSync(destPath)) {
        return { success: false, error: `Hedef klasör zaten mevcut: ${destPath}` };
    }

    onProgress({ stage: 'copying', percent: 5, message: 'Dosyalar kopyalanıyor...' });

    // robocopy exit codes: 0=no change, 1=files copied, 2=extra, 4=mismatched, 8+=errors
    try {
        await execAsync(
            `robocopy "${gameRoot}" "${destPath}" /E /MT:8 /NP /NFL /NDL /NJH /NJS`,
            { timeout: 7200000, maxBuffer: 1024 * 1024 * 10 }
        );
    } catch (e) {
        // robocopy returns exit code 1 for "files were copied successfully"
        const exitCode = e.code || (e.cmd ? 0 : 9);
        if (exitCode > 7) {
            return { success: false, error: `Kopyalama başarısız (kod ${exitCode}): ${e.stderr || e.message}` };
        }
    }

    onProgress({ stage: 'verifying', percent: 80, message: 'Dosyalar doğrulanıyor...' });

    if (!fs.existsSync(destPath)) {
        return { success: false, error: 'Kopyalama sonrasında hedef klasör bulunamadı.' };
    }

    onProgress({ stage: 'linking', percent: 90, message: 'Bağlantı oluşturuluyor...' });

    // Delete original
    try {
        fs.rmSync(gameRoot, { recursive: true, force: true });
    } catch (e) {
        return { success: false, error: `Eski klasör silinemedi: ${e.message}. Hedef klasör: ${destPath}` };
    }

    // Create NTFS junction (directory symlink — no admin required on Windows)
    try {
        await execAsync(`cmd /c mklink /J "${gameRoot}" "${destPath}"`);
    } catch (e) {
        return {
            success: false,
            error: `Junction oluşturulamadı: ${e.message}. Oyun taşındı ancak bağlantı yok. Yeni konum: ${destPath}`
        };
    }

    onProgress({ stage: 'done', percent: 100, message: 'Taşıma tamamlandı!' });
    return { success: true, newPath: destPath, junctionPath: gameRoot };
}

module.exports = { moveGame };
