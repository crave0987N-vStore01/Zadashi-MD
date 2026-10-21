'use strict';
// Zadashi - MD · tiny JSON database (settings of every bot + every group).
// Everything lives in DATA_DIR/db.json. Writes are batched and atomic.
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const FILE = path.join(DATA_DIR, 'db.json');
let db = { bots: {}, groups: {} };
try { const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); db = Object.assign(db, raw); } catch (e) { /* first run */ }

let timer = null;
function flush() {
    timer = null;
    try {
        fs.writeFileSync(FILE + '.tmp', JSON.stringify(db));
        fs.renameSync(FILE + '.tmp', FILE);
    } catch (e) { console.log('db save failed:', e.message); }
}
function save() { if (!timer) { timer = setTimeout(flush, 800); if (timer.unref) timer.unref(); } }
process.on('exit', () => { try { if (timer) flush(); } catch (e) { /* ignore */ } });

const BOT_DEFAULTS = { mode: 'public', anticall: false, alwaysOnline: true, autoRead: false, autoTyping: false, label: '', password: '', number: '', pairedAt: 0 };
const makeGroup = () => ({ antilink: false, antilinkAll: false, antibadword: false, antispam: false, welcome: false, goodbye: false, badwords: [], rules: '', warns: {} });

module.exports = {
    bot(id) {
        if (!db.bots[id]) db.bots[id] = Object.assign({}, BOT_DEFAULTS);
        const b = db.bots[id];
        if (!b.v10) { b.v10 = true; b.alwaysOnline = true; save(); } // V10: bots stay online
        return b;
    },
    hasBot(id) { return !!db.bots[id]; },
    setBot(id, patch) { db.bots[id] = Object.assign({}, BOT_DEFAULTS, db.bots[id], patch); save(); return db.bots[id]; },
    dropBot(id) { delete db.bots[id]; save(); },
    botIds() { return Object.keys(db.bots); },
    group(jid) { if (!db.groups[jid]) db.groups[jid] = makeGroup(); else { const d = makeGroup(); for (const k of Object.keys(d)) if (db.groups[jid][k] === undefined) db.groups[jid][k] = d[k]; } return db.groups[jid]; },
    setGroup(jid, patch) { db.groups[jid] = Object.assign(makeGroup(), db.groups[jid], patch); save(); return db.groups[jid]; },
    save,
    flush
};
