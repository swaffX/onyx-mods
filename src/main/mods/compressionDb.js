const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * Compression Database Manager
 * Fetches and parses community compression ratios
 */
class CompressionDb {
    constructor() {
        this.dbUrl = 'https://raw.githubusercontent.com/IridiumIO/CompactGUI/database/database.json';
        this.cachePath = path.join(process.env.APPDATA, 'V-Enabler', 'compression_db.json');
        this.data = null;
    }

    async getDb() {
        if (this.data) return this.data;

        try {
            let rawData;
            // Check cache first
            if (fs.existsSync(this.cachePath)) {
                const stats = fs.statSync(this.cachePath);
                const isOld = (Date.now() - stats.mtimeMs) > 1000 * 60 * 60 * 24; // 24h cache

                if (!isOld) {
                    rawData = fs.readFileSync(this.cachePath, 'utf8');
                }
            }

            if (!rawData) {
                // Fetch from GitHub
                rawData = await this._fetch();
                
                // Save to cache
                if (!fs.existsSync(path.dirname(this.cachePath))) {
                    fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
                }
                fs.writeFileSync(this.cachePath, rawData);
            }

            const parsed = JSON.parse(rawData);
            
            // Map the data to be UI-friendly (similar to how original CompactGUI does it)
            this.data = parsed.map(entry => {
                const results = entry.CompressionResults || [];
                return {
                    GameName: entry.GameName,
                    SteamID: entry.SteamID,
                    Result_X4K: results.find(r => r.CompType === 0),
                    Result_X8K: results.find(r => r.CompType === 1),
                    Result_X16K: results.find(r => r.CompType === 2),
                    Result_LZX: results.find(r => r.CompType === 3)
                };
            });

            return this.data;
        } catch (e) {
            console.error('Compression DB Fetch Error:', e);
            return [];
        }
    }

    async _fetch() {
        return new Promise((resolve, reject) => {
            https.get(this.dbUrl, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => resolve(body));
            }).on('error', (e) => reject(e));
        });
    }

    /**
     * Finds compression info for a specific game/app
     * @param {string} name - Game name or AppID
     */
    async findEntry(nameOrId) {
        const db = await this.getDb();
        return db.find(entry => 
            entry.GameName.toLowerCase().includes(nameOrId.toString().toLowerCase()) ||
            entry.SteamID.toString() === nameOrId.toString()
        );
    }
}

module.exports = new CompressionDb();
