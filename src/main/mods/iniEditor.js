const fs = require('fs');
const path = require('path');

/**
 * Klasör içinde derinlemesine dosya araması yapar (sembolik linkler ve gereksiz klasörler elenir)
 */
function findFileRecursive(dir, fileName, visited = new Set()) {
    try {
        const absPath = path.resolve(dir);
        if (visited.has(absPath)) return null;
        visited.add(absPath);

        console.log(`[INI EDITOR] findFileRecursive: checking directory "${dir}" for "${fileName}"`);

        if (!fs.existsSync(dir)) {
            console.log(`[INI EDITOR] findFileRecursive: directory "${dir}" does not exist`);
            return null;
        }
        const stats = fs.statSync(dir);
        if (stats.isFile()) {
            dir = path.dirname(dir);
        }

        const targetPath = path.join(dir, fileName);
        if (fs.existsSync(targetPath)) {
            console.log(`[INI EDITOR] findFileRecursive: FOUND EXACT MATCH at "${targetPath}"`);
            return targetPath;
        }

        const files = fs.readdirSync(dir, { withFileTypes: true });
        const priorityDirs = ['bin', 'binaries', 'x64', 'win64', 'dx12', 'plugins', 'b1', 'mafiatheoldcountry', 'runtime', 'retail'];
        const ignoreFolders = ['data', 'shader', 'resource', 'asset', 'sound', 'audio', 'video', 'movie', 'ui', 'localization', 'language', '_redist', '__commonredist', 'docs'];

        const subDirs = [];
        for (const file of files) {
            if (file.isSymbolicLink()) continue;
            if (file.isDirectory()) {
                const nameLow = file.name.toLowerCase();
                if (!ignoreFolders.includes(nameLow)) {
                    subDirs.push(path.join(dir, file.name));
                }
            }
        }

        // Öncelikli klasörleri öne al
        subDirs.sort((a, b) => {
            const baseA = path.basename(a).toLowerCase();
            const baseB = path.basename(b).toLowerCase();
            const aPriority = priorityDirs.includes(baseA);
            const bPriority = priorityDirs.includes(baseB);
            return (bPriority ? 1 : 0) - (aPriority ? 1 : 0);
        });

        for (const subDir of subDirs) {
            console.log(`[INI EDITOR] findFileRecursive: descending into "${subDir}"`);
            const found = findFileRecursive(subDir, fileName, visited);
            if (found) return found;
        }
    } catch (e) {
        console.error(`[INI EDITOR] findFileRecursive: error at "${dir}":`, e.message);
    }
    return null;
}

/**
 * Oyun nesnesinden ve mod adından ilgili INI dosyasının konumunu bulur.
 * Öncelikle kayıtlı yolları, ardından exe yanını kontrol eder.
 * Bulamazsa oyunun ana klasöründe (gameRoot) arama yapar.
 */
function findIniPath(game, mod) {
    console.log(`[INI EDITOR] findIniPath: start. Game name: "${game ? game.name : 'undefined'}", mod: "${mod}"`);
    console.log(`[INI EDITOR] findIniPath: game object payload:`, JSON.stringify(game, null, 2));

    // 1. Oyun nesnesinde önceden bulunmuş/kaydedilmiş mod klasörleri varsa kontrol et
    if (mod === 'dlss-enabler' && game.dlssEnablerPath) {
        const targetPath = path.join(game.dlssEnablerPath, 'dlss-enabler.ini');
        const exists = fs.existsSync(targetPath);
        console.log(`[INI EDITOR] findIniPath: Step 1 checking game.dlssEnablerPath "${targetPath}" - exists: ${exists}`);
        if (exists) return targetPath;
    }
    if (mod === 'optiscaler') {
        if (game.optiscalerPath) {
            const opti1 = path.join(game.optiscalerPath, 'OptiScaler.ini');
            const opti2 = path.join(game.optiscalerPath, 'optiscaler.ini');
            const exists2 = fs.existsSync(opti2);
            const exists1 = fs.existsSync(opti1);
            console.log(`[INI EDITOR] findIniPath: Step 1 checking game.optiscalerPath. optiscaler.ini exists: ${exists2}, OptiScaler.ini exists: ${exists1}`);
            if (exists2) return opti2;
            if (exists1) return opti1;
        }
        if (game.dlssEnablerPath) {
            const opti1 = path.join(game.dlssEnablerPath, 'OptiScaler.ini');
            const opti2 = path.join(game.dlssEnablerPath, 'optiscaler.ini');
            const exists2 = fs.existsSync(opti2);
            const exists1 = fs.existsSync(opti1);
            console.log(`[INI EDITOR] findIniPath: Step 1 checking game.dlssEnablerPath for OptiScaler. optiscaler.ini exists: ${exists2}, OptiScaler.ini exists: ${exists1}`);
            if (exists2) return opti2;
            if (exists1) return opti1;
        }
    }

    // 2. Standart konum: EXE'nin bulunduğu klasör
    if (!game.exePath) {
        console.log(`[INI EDITOR] findIniPath: Step 2 failed, game.exePath is empty`);
        return null;
    }
    let baseDir = game.exePath;
    try {
        if (fs.existsSync(game.exePath)) {
            const stats = fs.statSync(game.exePath);
            if (stats.isFile()) {
                baseDir = path.dirname(game.exePath);
            }
        }
    } catch (e) {
        console.error(`[INI EDITOR] findIniPath: error stats for game.exePath "${game.exePath}":`, e.message);
    }
    console.log(`[INI EDITOR] findIniPath: Step 2 derived baseDir is "${baseDir}"`);

    if (mod === 'dlss-enabler') {
        const stdPath = path.join(baseDir, 'dlss-enabler.ini');
        const exists = fs.existsSync(stdPath);
        console.log(`[INI EDITOR] findIniPath: Step 2 checking baseDir "${stdPath}" - exists: ${exists}`);
        if (exists) return stdPath;
    } else if (mod === 'optiscaler') {
        const opti1 = path.join(baseDir, 'OptiScaler.ini');
        const opti2 = path.join(baseDir, 'optiscaler.ini');
        const exists2 = fs.existsSync(opti2);
        const exists1 = fs.existsSync(opti1);
        console.log(`[INI EDITOR] findIniPath: Step 2 checking baseDir. optiscaler.ini exists: ${exists2}, OptiScaler.ini exists: ${exists1}`);
        if (exists2) return opti2;
        if (exists1) return opti1;
    }

    // 3. Fallback: Oyun ana klasöründe (gameRoot) veya exe klasöründe recursive ara
    const searchRoot = game.gameRoot || baseDir;
    console.log(`[INI EDITOR] findIniPath: Step 3 starting recursive search in searchRoot "${searchRoot}"`);
    if (mod === 'dlss-enabler') {
        const found = findFileRecursive(searchRoot, 'dlss-enabler.ini');
        console.log(`[INI EDITOR] findIniPath: Step 3 found for dlss-enabler: "${found}"`);
        if (found) return found;
    } else if (mod === 'optiscaler') {
        const found1 = findFileRecursive(searchRoot, 'OptiScaler.ini');
        console.log(`[INI EDITOR] findIniPath: Step 3 found1 for OptiScaler: "${found1}"`);
        if (found1) return found1;
        const found2 = findFileRecursive(searchRoot, 'optiscaler.ini');
        console.log(`[INI EDITOR] findIniPath: Step 3 found2 for optiscaler: "${found2}"`);
        if (found2) return found2;
    }

    // 4. Bulunamazsa varsayılan olarak exe yanını döndür (yeni oluşturulacaksa)
    if (mod === 'dlss-enabler') {
        const fallback = path.join(baseDir, 'dlss-enabler.ini');
        console.log(`[INI EDITOR] findIniPath: Step 4 fallback path for dlss-enabler: "${fallback}"`);
        return fallback;
    } else if (mod === 'optiscaler') {
        const fallback = path.join(baseDir, 'OptiScaler.ini');
        console.log(`[INI EDITOR] findIniPath: Step 4 fallback path for optiscaler: "${fallback}"`);
        return fallback;
    }
    console.log(`[INI EDITOR] findIniPath: returning null`);
    return null;
}

/**
 * INI dosyasını okur ve section-key hiyerarşisinde JSON objesi döner.
 */
function readIni(filePath) {
    console.log(`[INI EDITOR] readIni: start reading path "${filePath}"`);
    if (!fs.existsSync(filePath)) {
        console.log(`[INI EDITOR] readIni: path "${filePath}" does not exist on disk.`);
        return { exists: false, data: {} };
    }

    try {
        const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
        console.log(`[INI EDITOR] readIni: successfully read content length: ${content.length}`);
        // CRLF veya LF tespiti
        const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
        const lines = content.split(/\r?\n/);
        console.log(`[INI EDITOR] readIni: split into ${lines.length} lines`);
        
        const data = {};
        let currentSection = null;
        
        for (const rawLine of lines) {
            const line = rawLine.trim();
            // Yorum satırlarını ve boşlukları atla
            if (!line || line.startsWith(';') || line.startsWith('#')) {
                continue;
            }
            
            // Section algılama
            if (line.startsWith('[') && line.endsWith(']')) {
                currentSection = line.substring(1, line.length - 1).trim();
                if (!data[currentSection]) {
                    data[currentSection] = {};
                }
                continue;
            }
            
            // Key=Value algılama
            if (currentSection) {
                const eqIndex = line.indexOf('=');
                if (eqIndex !== -1) {
                    const key = line.substring(0, eqIndex).trim();
                    let val = line.substring(eqIndex + 1).trim();
                    
                    // Basit dönüşümler
                    if (val.toLowerCase() === 'true') val = true;
                    else if (val.toLowerCase() === 'false') val = false;
                    else if (!isNaN(Number(val)) && val !== '') val = Number(val);
                    
                    data[currentSection][key] = val;
                }
            }
        }
        
        console.log(`[INI EDITOR] readIni: parse success. Sections parsed:`, Object.keys(data));
        return { exists: true, data };
    } catch (e) {
        console.error(`[INI EDITOR] readIni: ERROR while reading/parsing:`, e.message);
        return { exists: false, error: e.message };
    }
}

/**
 * INI dosyasına, mevcut yorumları ve yapıyı koruyarak newData içindeki değerleri yazar.
 * Windows sistemlerindeki \r\n vs \n satır sonu formatını tespit eder ve bozmaz.
 */
function writeIni(filePath, newData) {
    let content = '';
    let lineEnding = '\r\n'; // Windows için varsayılan
    
    if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, 'utf8');
        lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
    } else {
        // Dosya hiç yoksa, temiz bir şekilde newData'dan oluşturalım
        let newContent = '';
        for (const [section, keys] of Object.entries(newData)) {
            newContent += `[${section}]${lineEnding}`;
            for (const [key, val] of Object.entries(keys)) {
                newContent += `${key}=${val}${lineEnding}`;
            }
            newContent += lineEnding;
        }
        fs.writeFileSync(filePath, newContent, 'utf8');
        return true;
    }
    
    const lines = content.split(lineEnding);
    let currentSection = null;
    const writtenKeys = {};
    const outputLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();
        
        // Yeni bir section'a geçmeden önce veya dosya sonuna gelmeden önce
        // önceki section'da şemada olup da dosyada olmayan yeni eklenmiş key'leri yaz.
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            if (currentSection && newData[currentSection]) {
                for (const [k, v] of Object.entries(newData[currentSection])) {
                    if (!writtenKeys[currentSection].has(k)) {
                        outputLines.push(`${k}=${v}`);
                        writtenKeys[currentSection].add(k);
                    }
                }
            }
            
            currentSection = trimmed.substring(1, trimmed.length - 1).trim();
            outputLines.push(rawLine); // Section başlığını aynen ekle
            if (!writtenKeys[currentSection]) {
                writtenKeys[currentSection] = new Set();
            }
            continue;
        }
        
        // Key=Value satırı yakalama
        if (currentSection && newData[currentSection] !== undefined) {
            if (trimmed && !trimmed.startsWith(';') && !trimmed.startsWith('#')) {
                const eqIndex = trimmed.indexOf('=');
                if (eqIndex !== -1) {
                    const key = trimmed.substring(0, eqIndex).trim();
                    if (newData[currentSection].hasOwnProperty(key)) {
                        const newVal = newData[currentSection][key];
                        // Mevcut satırdaki boşlukları vb. korumak için indent bul
                        const indent = rawLine.substring(0, rawLine.indexOf(key));
                        outputLines.push(`${indent}${key}=${newVal}`);
                        writtenKeys[currentSection].add(key);
                        continue; // Eski satırı atlayıp yeni modifiye satırı ekledik
                    }
                }
            }
        }
        
        // Değişmeyen satırları aynen kopyala (yorumlar, boş satırlar, vs.)
        outputLines.push(rawLine);
    }
    
    // Döngü bittiğinde en son açık kalan section'a yeni key'leri ekle
    if (currentSection && newData[currentSection]) {
        for (const [k, v] of Object.entries(newData[currentSection])) {
            if (!writtenKeys[currentSection].has(k)) {
                outputLines.push(`${k}=${v}`);
                writtenKeys[currentSection].add(k);
            }
        }
    }
    
    // Dosyada hiç bulunmayan tamamen yeni section'lar ve içindeki key'ler
    for (const [section, keys] of Object.entries(newData)) {
        if (!writtenKeys[section]) {
            if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
                outputLines.push('');
            }
            outputLines.push(`[${section}]`);
            for (const [k, v] of Object.entries(keys)) {
                outputLines.push(`${k}=${v}`);
            }
        }
    }
    
    fs.writeFileSync(filePath, outputLines.join(lineEnding), 'utf8');
    return true;
}

module.exports = {
    findIniPath,
    readIni,
    writeIni
};
