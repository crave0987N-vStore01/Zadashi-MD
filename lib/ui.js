'use strict';
// Zadashi - MD · message design (cards, menu, footer)
const { BOT_NAME, FOOTER, OWNER_NUMBER, PREFIX, TZ, VERSION } = require('./config');
const { list, CATEGORIES, NUM } = require('./registry');
const store = require('./store');


// ---- fancy fonts (Unicode): bold sans for titles/labels, small caps for descriptions
const _up = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', _lo = 'abcdefghijklmnopqrstuvwxyz', _dg = '0123456789';
const _SC = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ';
const bd = (str) => Array.from(String(str)).map((ch) => {
    let i = _up.indexOf(ch); if (i >= 0) return String.fromCodePoint(0x1D63C + i);
    i = _lo.indexOf(ch); if (i >= 0) return String.fromCodePoint(0x1D656 + i);
    i = _dg.indexOf(ch); if (i >= 0) return String.fromCodePoint(0x1D7EC + i);
    return ch;
}).join('');
const bi = (str) => Array.from(String(str)).map((ch) => {
    let i = _up.indexOf(ch); if (i >= 0) return String.fromCodePoint(0x1D63C + i);
    i = _lo.indexOf(ch); if (i >= 0) return String.fromCodePoint(0x1D656 + i);
    i = _dg.indexOf(ch); if (i >= 0) return String.fromCodePoint(0x1D7EC + i);
    return ch;
}).join('');
const sc = (str) => require('./font').mono(String(str));

// bot messages carry no footer line any more
const foot = () => `🧑‍💻 _${FOOTER}_`;

// ╭━━〔 🎵 TITLE 〕  / ┃ rows / ╰━━
function card(emoji, title, rows, hint) {
    const out = [`┏━━━〔 ${emoji} ${bi(String(title).toUpperCase())} 〕━━━┓`];
    for (const r of rows || []) {
        if (r === null || r === undefined || r === false) continue;
        const s = String(r);
        if (s === '') out.push('┃');
        else for (const ln of s.split('\n')) out.push('┃ ' + ln);
    }
    out.push('┗━━━━━━━━━━━━━━━━━━━━━━┛');
    if (hint) out.push(String(hint));
    return out.join('\n').trim();
}
const row = (emoji, label, value) => `${emoji} ${bd(label)} : ${value}`;
const usage = (emoji, title, text, example) => card(emoji, title, ['📖 ' + text, example ? '✨ ' + bd('Example') + ' : ' + example : null]);
const fail = (text) => card('❌', 'Oops', [text]);
const trunc = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function upShort(sec) {
    sec = Math.floor(sec);
    const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (d ? d + 'd ' : '') + (h ? h + 'h ' : '') + (m ? m + 'm ' : '') + (!d && !h ? s + 's' : '');
}
function nowParts() {
    const d = new Date();
    const date = d.toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    const hour = parseInt(d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }), 10) || 0;
    return { date, time, hour };
}
function greeting() {
    const h = nowParts().hour;
    return h < 5 ? '🌙 Good night' : h < 12 ? '🌅 Good morning' : h < 17 ? '☀️ Good afternoon' : h < 21 ? '🌆 Good evening' : '🌙 Good night';
}
const modeLabel = (s) => (s && s.mode === 'private' ? '🔒 ' + bd('Private') : '🌍 ' + bd('Public'));

// commands of one category, in registration order
const byCat = (id) => list.filter((c) => c.category === id);

// ---------------------------------------------------------------- SUPER MENU
const W = '═══════════════════════';
const BANNER = (t) => `╔${W}╗\n║ ${t}\n╚${W}╝`;
const OPEN = (t) => `╭━━━❮ ${t} ❯━━━⬣`;
const SHUT = '╰━━━━━━━━━━━━━━━━━⬣';
const dot = '✦';

function mainMenu(name, session) {
    const cfg = session ? store.bot(session.id) : {};
    const { date, time } = nowParts();
    const g = greeting().split(' ');
    const out = [
        BANNER(`🐉 ${bi(BOT_NAME.toUpperCase())}  ·  ${bd('V' + VERSION)}`),
        `👋 ${bi('Hello')} *${trunc(name || 'Friend', 20)}*`,
        `${g[0]} ${bd(g.slice(1).join(' '))}`,
        '',
        OPEN(`🤖 ${bi('BOT INFO')}`),
        `┃ ${dot} ${bd('Owner')}    ➜ +${OWNER_NUMBER}`,
        `┃ ${dot} ${bd('Mode')}     ➜ ${modeLabel(cfg)}`,
        `┃ ${dot} ${bd('Prefix')}   ➜ ${bd(PREFIX)}`,
        `┃ ${dot} ${bd('Commands')} ➜ ${bd(String(list.length))}`,
        `┃ ${dot} ${bd('Uptime')}   ➜ ${bd(upShort(process.uptime()))}`,
        `┃ ${dot} ${bd('Time')}     ➜ ${bd(time)} · ${bd(date)}`,
        SHUT,
        '',
        OPEN(`📖 ${bi('COMMAND MENU')}`)
    ];
    CATEGORIES.forEach((c, i) => out.push(`┃ ${NUM[i + 1]} ${c.emoji} ${bi(c.title.toUpperCase())} ⟶ ${bd(String(byCat(c.id).length))}`));
    out.push(`┃ ${NUM[CATEGORIES.length + 1]} 🗂️ ${bi('ALL COMMANDS')} ⟶ ${bd(String(list.length))}`);
    out.push(SHUT, '');
    out.push(OPEN(`⚡ ${bi('QUICK START')}`));
    out.push(`┃ 🎵 ${bi(PREFIX + 'song')} ${sc('name')}`, `┃ 🎬 ${bi(PREFIX + 'video')} ${sc('name')}`, `┃ 🔤 ${bi(PREFIX + 'ttp')} ${sc('text → sticker')}`, `┃ 🪄 ${bi(PREFIX + 'sticker')} ${sc('(reply to a picture)')}`, `┃ 🆓 ${bi(PREFIX + 'free')} ${sc('vpn · learn · design · dev')}`);
    out.push(SHUT, '');
    out.push(`💬 ${sc('reply with a number')} ${bd('1-' + (CATEGORIES.length + 1))} ${sc('to open a menu')}`);
    out.push('', foot());
    return out.join('\n').trim();
}

function catLine(c) {
    const u = c.usage ? ` ${sc(c.usage)}` : '';
    const al = (c.aliases || []).slice(0, 3);
    return `┃ ${c.emoji || '✨'} ${bi(PREFIX + c.name)}${u}\n┃   ╰➜ ${sc(c.desc)}${al.length ? '\n┃   ⌁ ' + sc(al.join(' · ')) : ''}`;
}
function categoryMenu(id) {
    const cat = CATEGORIES.find((c) => c.id === id);
    if (!cat) return null;
    const cmds = byCat(id);
    const lines = [BANNER(`${cat.emoji} ${bi(cat.title.toUpperCase() + ' MENU')}  ·  ${bd(String(cmds.length))}`), '', OPEN(`${cat.emoji} ${bi(cat.title.toUpperCase())}`)];
    cmds.forEach((c, i) => { lines.push(catLine(c)); if (i < cmds.length - 1) lines.push('┃'); });
    lines.push(SHUT, '', `↩️ ${sc('reply')} ${bd('0')} ${sc('for the main menu')}`);
    return lines.join('\n').trim();
}
function allMenu() {
    const lines = [BANNER(`🗂️ ${bi('ALL COMMANDS')}  ·  ${bd(String(list.length))}`), ''];
    for (const cat of CATEGORIES) {
        const cmds = byCat(cat.id);
        lines.push(OPEN(`${cat.emoji} ${bi(cat.title.toUpperCase())} · ${bd(String(cmds.length))}`));
        for (const c of cmds) lines.push(`┃ ${c.emoji || '✨'} ${bi(PREFIX + c.name)}`);
        lines.push(SHUT, '');
    }
    lines.push(`↩️ ${sc('reply')} ${bd('0')} ${sc('for the main menu')}`);
    return lines.join('\n').trim();
}

module.exports = { card, row, usage, fail, trunc, upShort, nowParts, greeting, modeLabel, mainMenu, categoryMenu, allMenu, foot, byCat };
