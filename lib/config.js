'use strict';
// Zadashi - MD · Powered By Bozz squad
const fs = require('fs');
const path = require('path');

// --- tiny .env loader (real environment variables always win) ---
try {
    const f = path.join(__dirname, '..', '.env');
    if (fs.existsSync(f)) {
        for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
            if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
                process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
            }
        }
    }
} catch (e) { /* ignore */ }

const digits = (v) => String(v || '').replace(/\D/g, '');
const OWNER_NUMBERS = new Set(String(process.env.OWNER_NUMBER || '94776017681').split(',').map(digits).filter((x) => x.length >= 8));
if (!OWNER_NUMBERS.size) OWNER_NUMBERS.add('94776017681');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

module.exports = {
    BOT_NAME: 'Zadashi - MD',
    FOOTER: 'Bot Developed & Powered by Nimah Dev',
    OWNER_NAME: 'Bozz squad',
    CHANNEL_NAME: 'BOZZ SQUAD',
    CHANNEL_LINK: process.env.CHANNEL_LINK || 'https://whatsapp.com/channel/0029Vb92I7p8aKvNNoPQt71C',
    OWNER_NUMBER: [...OWNER_NUMBERS][0],
    OWNER_NUMBERS,
    PREFIX: (process.env.PREFIX || '.').trim().slice(0, 2) || '.',
    VERSION: '02',
    TZ: process.env.BOT_TZ || 'Asia/Colombo',
    PORT: parseInt(process.env.PORT || '3000', 10),
    ROOT,
    PUBLIC_DIR: path.join(ROOT, 'public'),
    DATA_DIR,
    SESSION_ROOT: path.join(DATA_DIR, 'sessions'),
    DL_MAX_MB: parseInt(process.env.DL_MAX_MB || '60', 10),
    MAX_BOTS: parseInt(process.env.MAX_BOTS || '30', 10),
    PAIR_CODE: String(process.env.PAIR_CODE || 'ZADASHI1').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    digits
};
