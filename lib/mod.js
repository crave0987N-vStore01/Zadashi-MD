'use strict';
// Zadashi - MD · moderation engine (warns, anti-link, anti-badword, anti-spam)
const store = require('./store');
const wa = require('./wa');
const ui = require('./ui');
const { OWNER_NUMBERS } = require('./config');

const MAX_WARN = 3;
const WA_INVITE = /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i;
const ANY_LINK = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(com|net|org|lk|io|me|xyz|info|co|link|ly|gg|app|site|online)\b/i;
const SPAM_COUNT = 6, SPAM_WINDOW = 8000;
const spam = new Map();

const idsOf = (p) => [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(wa.jidDigits);
const matches = (p, jid) => { const d = wa.jidDigits(jid); return !!d && idsOf(p).includes(d); };
const partOf = (meta, jid) => (meta.participants || []).find((p) => matches(p, jid));
const numOf = (p) => wa.jidDigits(p.phoneNumber || p.jid || p.id);
const nameOf = (p) => '@' + numOf(p);
const isBot = (ctx, p) => matches(p, ctx.sock.user.id) || (ctx.sock.user.lid && matches(p, ctx.sock.user.lid));
const botIsAdmin = (sock, meta) => { const p = (meta.participants || []).find((x) => matches(x, sock.user.id) || (sock.user.lid && matches(x, sock.user.lid))); return !!(p && p.admin); };

function targetsOf(ctx) {
    const q = wa.quotedOf(ctx.msg, ctx.from);
    const raw = wa.mentionsOf(ctx.msg).slice();
    if (q && q.sender) raw.push(q.sender);
    const out = [];
    for (const j of raw) { const p = partOf(ctx.meta, j); if (p && !out.includes(p)) out.push(p); }
    return out;
}
const isProtected = (ctx, p) => !!p.admin || idsOf(p).some((d) => OWNER_NUMBERS.has(d)) || isBot(ctx, p);

// ---- warns
function warnsOf(group, key) { return (store.group(group).warns || {})[key] || 0; }
function setWarns(group, key, n) {
    const g = store.group(group); const w = Object.assign({}, g.warns || {});
    if (n <= 0) delete w[key]; else w[key] = n;
    store.setGroup(group, { warns: w });
    return n;
}

// ---- called for every group message. returns true when the message was handled (deleted)
async function inspect(c) {
    const g = store.group(c.from);
    if (!(g.antilink || g.antilinkAll || g.antibadword || g.antispam)) return false;
    const meta = await c.getMeta(c.from);
    if (!botIsAdmin(c.sock, meta)) return false;
    const sp = partOf(meta, c.sender);
    if (sp && sp.admin) return false;
    const body = c.body; let reason = '';
    if (g.antilink && WA_INVITE.test(body)) reason = 'group link';
    else if (g.antilinkAll && ANY_LINK.test(body)) reason = 'link';
    else if (g.antibadword && g.badwords.length) {
        const t = ' ' + body.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ') + ' ';
        if (g.badwords.some((w) => t.includes(' ' + w + ' ') || t.includes(w))) reason = 'bad word';
    }
    if (!reason && g.antispam) {
        const k = c.from + '|' + wa.jidDigits(c.sender); const now = Date.now();
        const a = (spam.get(k) || []).filter((x) => now - x < SPAM_WINDOW); a.push(now); spam.set(k, a);
        if (spam.size > 3000) spam.delete(spam.keys().next().value);
        if (a.length >= SPAM_COUNT) { reason = 'spam'; spam.delete(k); }
    }
    if (!reason) return false;
    try { await c.sock.sendMessage(c.from, { delete: c.msg.key }); } catch (e) { /* ignore */ }
    const key = sp ? numOf(sp) : wa.jidDigits(c.sender);
    const n = setWarns(c.from, key, warnsOf(c.from, key) + 1);
    const jid = sp ? sp.id : c.sender;
    if (n >= MAX_WARN) {
        try { await c.sock.groupParticipantsUpdate(c.from, [jid], 'remove'); setWarns(c.from, key, 0); } catch (e) { /* ignore */ }
        await c.s.queueSend(c.from, { text: ui.card('🚷', 'Removed', [`⛔ @${key} reached ${MAX_WARN}/${MAX_WARN} warnings (${reason}) and was removed.`]), mentions: [jid] });
    } else {
        await c.s.queueSend(c.from, { text: ui.card('⚠️', 'Warning', [`🚫 @${key}, ${reason === 'spam' ? 'please do not spam' : reason + 's are not allowed here'}.`, ui.row('📊', 'Warns', `${n}/${MAX_WARN}`)]), mentions: [jid] });
    }
    return true;
}

module.exports = { MAX_WARN, inspect, targetsOf, isProtected, partOf, numOf, nameOf, botIsAdmin, warnsOf, setWarns, matches };
