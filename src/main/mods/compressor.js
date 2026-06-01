const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Native Windows Compression Wrapper
 * Interfaces with compact.exe to provide transparent file-system compression
 */
class WindowsCompressor {
    constructor() {
        this.activeProcesses = new Map();
    }

    /**
     * Compresses a folder using specified algorithm
     * @param {string} folderPath - Target folder
     * @param {string} algorithm - XPRESS4K, XPRESS8K, XPRESS16K, LZX
     * @param {Object} options - Additional options (recursion, etc)
     * @returns {Promise<Object>} - Results and logs
     */
    async compress(folderPath, algorithm = 'XPRESS4K', options = {}, onProgress = null) {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(folderPath)) {
                return reject(new Error('Klasör bulunamadı: ' + folderPath));
            }

            // Map UI algorithm names to compact.exe flags
            const algoFlag = `/EXE:${algorithm.toUpperCase()}`;
            
            // Basic flags: /C (compress), /S (recurse), /A (hidden/system files), /I (ignore errors), /EXE (WOF)
            const args = ['/C', '/S', '/A', '/I', algoFlag, '*'];

            const proc = spawn('compact.exe', args, {
                cwd: folderPath,
                shell: true
            });

            this.activeProcesses.set(folderPath, proc);

            let output = '';
            let errorOutput = '';

            proc.stdout.on('data', (data) => {
                const chunk = data.toString();
                output += chunk;
                
                if (onProgress) {
                    // Try to parse percentage or file info from compact.exe output
                    // "123 / 456 files [OK]" etc.
                    this._parseProgress(chunk, onProgress);
                }
            });

            proc.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            proc.on('close', (code) => {
                this.activeProcesses.delete(folderPath);
                if (code === 0 || code === 1) { // 1 often indicates some files couldn't be compressed which is fine
                    resolve({
                        success: true,
                        log: output,
                        code: code
                    });
                } else {
                    reject(new Error(`Sıkıştırma hatası (Kod: ${code}): ${errorOutput}`));
                }
            });
        });
    }

    /**
     * Uncompresses a folder
     */
    async uncompress(folderPath, onProgress = null) {
        return new Promise(async (resolve, reject) => {
            if (!fs.existsSync(folderPath)) {
                return reject(new Error('Klasör bulunamadı: ' + folderPath));
            }

            try {
                // We need to run two passes to be thorough:
                // 1. Uncompress WOF (EXE) compressed files
                // 2. Uncompress standard NTFS compressed files

                if (onProgress) onProgress('WOF sıkıştırması geri alınıyor...');
                await this._runCompact(folderPath, ['/U', '/S', '/A', '/I', '/EXE', '*'], onProgress);

                if (onProgress) onProgress('NTFS sıkıştırması geri alınıyor...');
                const finalResult = await this._runCompact(folderPath, ['/U', '/S', '/A', '/I', '*'], onProgress);

                resolve(finalResult);
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Helper to run compact.exe and handle its lifecycle
     */
    async _runCompact(folderPath, args, onProgress) {
        return new Promise((resolve, reject) => {
            const proc = spawn('compact.exe', args, {
                cwd: folderPath,
                shell: true
            });

            this.activeProcesses.set(folderPath, proc);

            let output = '';
            let errorOutput = '';

            proc.stdout.on('data', (data) => {
                const chunk = data.toString();
                output += chunk;
                if (onProgress) this._parseProgress(chunk, onProgress);
            });

            proc.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            proc.on('close', (code) => {
                this.activeProcesses.delete(folderPath);
                if (code === 0 || code === 1) {
                    resolve({ success: true, log: output, code: code });
                } else {
                    reject(new Error(`Compact hatası (Kod: ${code}): ${errorOutput}`));
                }
            });
        });
    }


    _parseProgress(text, callback) {
        // Simple heuristic for compact.exe output
        // It usually prints file names and then a summary.
        // We can emit the last few lines to UI
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        if (lines.length > 0) {
            callback(lines[lines.length - 1].trim());
        }
    }

    cancel(folderPath) {
        const proc = this.activeProcesses.get(folderPath);
        if (proc) {
            proc.kill();
            return true;
        }
        return false;
    }

    /**
     * Checks the compression state of a folder
     * @param {string} folderPath 
     * @returns {Promise<Object>}
     */
    async getCompressionState(folderPath) {
        return new Promise((resolve) => {
            if (!fs.existsSync(folderPath)) return resolve({ isCompressed: false, ratio: '1.0' });

            // Run compact /S to see current state recursively
            // We use /A and /I to be thorough but fast
            const proc = spawn('compact.exe', ['/S', '/A', '/I'], {
                cwd: folderPath,
                shell: true
            });

            let output = '';
            proc.stdout.on('data', (data) => output += data.toString());
            
            // We only care about the last 500 characters for the summary
            proc.on('close', () => {
                const summary = output.slice(-1000); // Get end of output
                
                // Regex to find "XXXX files within YYYY directories are compressed."
                // Since this is localized, we look for numbers followed by "files within" or similar
                // But better: Look for the ratio line which is more standard: "123 : 456 = 1.2 to 1"
                
                // Match pattern: [Number] : [Number] = [Number] to/unto 1
                // We use [\d.,\s]+ to account for thousands separators (dot or comma or space)
                const ratioMatch = summary.match(/([\d.,\s]+)\s?:\s?([\d.,\s]+)\s?=\s?([\d.,]+)\s?(?:to|\/|unto|:)\s?1/i);
                
                let isCompressed = false;
                let ratioValue = 1.0;

                if (ratioMatch) {
                    const beforeStr = ratioMatch[1].replace(/[.,\s]/g, '');
                    const afterStr = ratioMatch[2].replace(/[.,\s]/g, '');
                    const ratioStr = ratioMatch[3].replace(',', '.');

                    const before = parseInt(beforeStr);
                    const after = parseInt(afterStr);
                    ratioValue = parseFloat(ratioStr);

                    if (after < before || ratioValue > 1.0) {
                        isCompressed = true;
                    }
                } else {
                    // Fallback to searching for any compressed files mention
                    const filesCompressedMatch = summary.match(/(\d+)\s+(?:files|dosya|fichiers|dateien)/i);
                    if (filesCompressedMatch && parseInt(filesCompressedMatch[1]) > 0) {
                        isCompressed = true;
                    }
                }

                resolve({
                    isCompressed: isCompressed,
                    ratio: ratioValue.toFixed(1),
                    raw: summary
                });
            });
        });
    }
}

module.exports = new WindowsCompressor();
