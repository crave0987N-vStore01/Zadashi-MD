process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '16';
// =========================================================================
// Zadashi - MD  ·  WhatsApp multi-device bot
// Powered By Bozz squad
// =========================================================================
const cfg = require('./lib/config');
const FONT = require('./lib/font');
const nodeCrypto = require('crypto');
if (!globalThis.crypto) globalThis.crypto = nodeCrypto.webcrypto; // Baileys needs Web Crypto (Node 18)

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const express = require('express');
const QRCode = require('qrcode');
const {
    default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers
} = require('@whiskeysockets/baileys');

const store = require('./lib/store');
const ui = require('./lib/ui');
const wa = require('./lib/wa');
const pending = require('./lib/pending');
const { commands, list } = require('./lib/registry');
require('./commands');

const { BOT_NAME, FOOTER, OWNER_NUMBERS, PREFIX, PORT, PUBLIC_DIR, SESSION_ROOT, MAX_BOTS, PAIR_CODE, digits, VERSION, CHANNEL_LINK } = cfg;
const { jidDigits } = wa;
const SELF_URL = process.env.SELF_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : '') || process.env.RENDER_EXTERNAL_URL || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);

// =========================================================================
// Sessions (every paired WhatsApp number is one session)
// =========================================================================
const sessions = new Map();
const MAX_RECONNECT_DELAY_MS = 30000;
const sessionIdOk = (id) => /^[a-f0-9]{10,32}$/.test(String(id || ''));
const newSessionId = () => nodeCrypto.randomBytes(8).toString('hex');
const getSession = (id) => (sessionIdOk(id) ? sessions.get(id) : undefined);
const isPaired = (s) => !!(s && s.sock && s.sock.authState && s.sock.authState.creds && s.sock.authState.creds.registered);
const activeBotCount = () => [...sessions.values()].filter((s) => s.isConnected).length;
const serverFull = () => sessions.size >= MAX_BOTS + 5 || [...sessions.values()].filter((s) => isPaired(s) || fs.existsSync(path.join(s.sessionDir, 'creds.json'))).length >= MAX_BOTS;

// creds safety copy (a half-written file never loses a linked bot)
const credsFile = (dir) => path.join(dir, 'creds.json');
function repairCreds(dir) {
    const f = credsFile(dir), b = f + '.bak';
    try { if (fs.existsSync(f)) { JSON.parse(fs.readFileSync(f, 'utf8')); return; } else if (!fs.existsSync(b)) return; } catch (e) { console.log('⚠️ creds.json damaged in', path.basename(dir)); }
    try { JSON.parse(fs.readFileSync(b, 'utf8')); fs.copyFileSync(b, f); console.log('🛟 Restored creds.json from backup for', path.basename(dir)); } catch (e) { /* none */ }
}
function snapshotCreds(dir) { try { const raw = fs.readFileSync(credsFile(dir), 'utf8'); JSON.parse(raw); fs.writeFileSync(credsFile(dir) + '.bak', raw); } catch (e) { /* ignore */ } }

// hidden-id (LID) -> phone number
const lidPn = new Map();
function learnLid(lid, pn) {
    try { const a = jidDigits(lid), b = String(pn || ''); if (a && /@s\.whatsapp\.net$/.test(b)) { lidPn.set(a, jidDigits(b) + '@s.whatsapp.net'); if (lidPn.size > 5000) lidPn.delete(lidPn.keys().next().value); } } catch (e) { /* ignore */ }
}
async function resolveSender(sock, msg) {
    if (msg.key.fromMe) return jidDigits(sock.user.id) + '@s.whatsapp.net';
    let sender = msg.key.participant || msg.key.remoteJid;
    if (String(sender).endsWith('@lid')) {
        const alt = msg.key.participantPn || msg.key.senderPn || msg.key.participantAlt || msg.key.remoteJidAlt;
        if (alt) { learnLid(sender, alt); return alt; }
        const d = jidDigits(sender);
        if (lidPn.has(d)) return lidPn.get(d);
        try {
            const lm = sock.signalRepository && sock.signalRepository.lidMapping;
            const pn = lm && lm.getPNForLID ? await lm.getPNForLID(sender) : null;
            if (pn) { learnLid(sender, pn); return lidPn.get(d) || sender; }
        } catch (e) { /* keep the hidden id */ }
    }
    return sender;
}
const isOwnerJid = (s, sender, msg) => !!(msg && msg.key.fromMe) || OWNER_NUMBERS.has(jidDigits(sender)) || (!!s.number && jidDigits(sender) === s.number);

// =========================================================================
// Start / restart one bot session
// =========================================================================
async function startSession(id) {
    let s = sessions.get(id);
    if (!s) {
        s = { id, sessionDir: path.join(SESSION_ROOT, id), isConnected: false, currentQR: null, reconnectAttempts: 0, createdAt: Date.now(), pending: new Map(), number: '' };
        s.restart = () => startSession(id).catch((e) => console.log(`[${id}] restart failed:`, e.message));
        sessions.set(id, s);
    }
    if (s.starting) return s.sock;
    s.starting = true;
    try {
        fs.mkdirSync(s.sessionDir, { recursive: true });
        if (store.hasBot(id)) { const b = store.bot(id); if (b.number && !s.number) s.number = b.number; }
        s.currentQR = null; s.startedAt = Date.now();
        repairCreds(s.sessionDir);
        const { state, saveCreds } = await useMultiFileAuthState(s.sessionDir);
        let version;
        try { ({ version } = await Promise.race([fetchLatestBaileysVersion(), new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), 2500))])); }
        catch (e) { /* library default */ }
        if (s.sock) { try { s.sock.ev.removeAllListeners(); s.sock.end(undefined); } catch (e) { /* ignore */ } }

        const sentStore = new Map();   // recently sent messages (lets WhatsApp retry/decrypt)
        const groupCache = new Map();  // jid -> { t, meta }
        const sock = makeWASocket(Object.assign(version ? { version } : {}, {
            logger: pino({ level: 'silent' }),
            getMessage: async (key) => sentStore.get(key && key.id) || undefined,
            cachedGroupMetadata: async (jid) => { const c = groupCache.get(jid); return c && Date.now() - c.t < 5 * 60 * 1000 ? c.meta : undefined; },
            auth: state,
            browser: Browsers.ubuntu('Chrome'),
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,
            generateHighQualityLinkPreview: false,
            markOnlineOnConnect: true,
            keepAliveIntervalMs: 20000,
            connectTimeoutMs: 30000,
            defaultQueryTimeoutMs: 30000,
            retryRequestDelayMs: 250,
            maxMsgRetryCount: 3,
            transactionOpts: { maxCommitRetries: 5, delayBetweenTriesMs: 1000 },
            emitOwnEvents: true,
            fireInitQueries: false
        }));
        s.sock = sock;

        // ---- group info (cached 60s) ----
        const rawMeta = sock.groupMetadata.bind(sock);
        const getMeta = async (jid) => {
            const c = groupCache.get(jid);
            if (c && Date.now() - c.t < 60000) return c.meta;
            const meta = await rawMeta(jid);
            try { for (const p of meta.participants || []) { const pn = p.phoneNumber || p.jid || (/@s\.whatsapp\.net$/.test(p.id || '') ? p.id : ''); const lid = p.lid || (/@lid$/.test(p.id || '') ? p.id : ''); if (pn && lid) learnLid(lid, pn); } } catch (e) { /* ignore */ }
            groupCache.set(jid, { t: Date.now(), meta });
            if (groupCache.size > 300) groupCache.delete(groupCache.keys().next().value);
            return meta;
        };
        sock.groupMetadata = getMeta;
        sock.ev.on('groups.update', (u) => { for (const g of u || []) if (g && g.id) groupCache.delete(g.id); });
        sock.ev.on('group-participants.update', (u) => { if (u && u.id) groupCache.delete(u.id); });
        const rawSend = sock.sendMessage.bind(sock);
        sock.sendMessage = async (jid, content, options) => {
            const r = await rawSend(jid, FONT.stylizeContent(content), options);
            try { if (r && r.key && r.message) { sentStore.set(r.key.id, r.message); if (sentStore.size > 300) sentStore.delete(sentStore.keys().next().value); } } catch (e) { /* ignore */ }
            return r;
        };

        // ---- anti-ban send queue: ordered per chat, capped per minute, no duplicate spam, rate-limit cool-down ----
        const AB = s.ab || (s.ab = { sent: [], lastText: new Map(), coolUntil: 0 });
        const ZW = ['\u200b', '\u200c', '\u200d', '\u2060'];
        const chains = new Map();
        async function runJob(job) {
            const now0 = Date.now();
            if (AB.coolUntil > now0) await sleep(AB.coolUntil - now0);
            const txt = job.content && typeof job.content.text === 'string' ? job.content.text : '';
            if (txt) { // same text to the same chat within 3s is dropped
                const k = job.jid + '|' + txt.slice(0, 200), last = AB.lastText.get(k) || 0;
                if (now0 - last < 3000) return undefined;
                AB.lastText.set(k, now0); if (AB.lastText.size > 300) AB.lastText.delete(AB.lastText.keys().next().value);
            }
            let now = Date.now(); while (AB.sent.length && now - AB.sent[0] > 60000) AB.sent.shift();
            if (AB.sent.length >= 70) await sleep(Math.max(0, 60000 - (now - AB.sent[0])) + 300 + Math.random() * 900);
            AB.sent.push(Date.now());
            let content = job.content;
            if (txt && !content.edit) content = Object.assign({}, content, { text: txt + ZW[Math.floor(Math.random() * 4)] }); // invisible tail: no two replies have the same bytes
            if (store.bot(id).autoTyping && txt) { try { await sock.sendPresenceUpdate('composing', job.jid); await sleep(250 + Math.random() * 500); } catch (e) { /* ignore */ } }
            try { return await sock.sendMessage(job.jid, content, job.options); }
            catch (e) {
                const m = String((e && e.message) || e), code = (e && e.output && e.output.statusCode) || 0;
                if (/rate-overlimit|429|too many|spam/i.test(m) || code === 429) { AB.coolUntil = Date.now() + 90000; console.log(`🛡️ [${id}] WhatsApp rate-limit signal: pausing sends for 90s.`); }
                throw e;
            }
        }
        s.queueSend = (jid, content, options) => {
            const job = { jid, content, options };
            const prev = chains.get(jid) || Promise.resolve();
            const run = prev.then(() => runJob(job), () => runJob(job));
            const tail = run.catch(() => {});
            chains.set(jid, tail);
            tail.then(() => { if (chains.get(jid) === tail) chains.delete(jid); });
            return run;
        };

        // ---------------------------------------------------------- connection
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr, isNewLogin } = update;
            if (connection || qr) console.log(`📶 [${id}] ${connection || 'qr'}${lastDisconnect && lastDisconnect.error ? ' · ' + lastDisconnect.error.message : ''}`);
            if (isNewLogin) s.freshLogin = true;
            if (qr) s.currentQR = qr;
            if (connection === 'open') s.currentQR = null;

            if (connection === 'close') {
                if (s.removed) return;
                s.isConnected = false; s.offlineSince = s.offlineSince || Date.now();
                const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
                try { sock.ev.removeAllListeners(); } catch (e) { /* ignore */ }
                const later = (ms) => { clearTimeout(s.reconnectTimer); s.reconnectTimer = setTimeout(() => { s.reconnectTimer = null; startSession(id).catch(() => {}); }, ms); };

                if (code === DisconnectReason.loggedOut) {
                    if (!(state && state.creds && state.creds.registered)) { console.log(`⏰ [${id}] Pairing did not finish (code expired or rejected).`); }
                    else {
                        s.logoutStrikes = (Date.now() - (s.lastLogoutAt || 0) < 180000 ? (s.logoutStrikes || 0) : 0) + 1; s.lastLogoutAt = Date.now();
                        if (s.logoutStrikes < 2) { console.log(`🔌 [${id}] Logged out (strike 1). Retrying once in 20s.`); return later(20000); }
                        console.log(`🔌 [${id}] Logged out from WhatsApp. Clearing the session.`);
                    }
                    s.reconnectAttempts = 0; s.createdAt = Date.now(); s.number = '';
                    store.dropBot(id);
                    return void fs.rm(s.sessionDir, { recursive: true, force: true }, () => startSession(id).catch(() => {}));
                }
                if (code === DisconnectReason.badSession) {
                    s.badStrikes = (Date.now() - (s.lastBadAt || 0) < 300000 ? (s.badStrikes || 0) : 0) + 1; s.lastBadAt = Date.now();
                    if (s.badStrikes < 4) { repairCreds(s.sessionDir); return later(6000 * s.badStrikes); }
                    store.dropBot(id);
                    return void fs.rm(s.sessionDir, { recursive: true, force: true }, () => startSession(id).catch(() => {}));
                }
                if (code === 403 || code === DisconnectReason.forbidden) { console.log(`🚫 [${id}] WhatsApp refused this number (403). Trying again in 30 minutes.`); return later(30 * 60 * 1000); }
                if (code === DisconnectReason.connectionReplaced) { s.replacedStrikes = (Date.now() - (s.lastReplacedAt || 0) < 600000 ? (s.replacedStrikes || 0) : 0) + 1; s.lastReplacedAt = Date.now(); const wait = s.replacedStrikes < 3 ? 45000 : 10 * 60 * 1000; console.log(`⚠️ [${id}] Connection replaced by another login. Retrying in ${Math.round(wait / 1000)}s.`); return later(wait); }
                if (code === DisconnectReason.restartRequired) { return void startSession(id).catch(() => {}); } // normal step right after pairing
                s.reconnectAttempts++;
                const delay = Math.round(Math.min(2000 * (2 ** (s.reconnectAttempts - 1)), MAX_RECONNECT_DELAY_MS) * (0.8 + Math.random() * 0.5));
                console.log(`🔌 [${id}] Closed (${code || 'unknown'}). Reconnecting in ${Math.round(delay / 1000)}s...`);
                return later(delay);
            }

            if (connection === 'open') {
                s.isConnected = true; s.offlineSince = 0; s.stopped = false; s.lastActivity = Date.now(); s.reconnectAttempts = 0;
                clearTimeout(s.reconnectTimer);
                s.number = jidDigits(sock.user && sock.user.id);
                console.log(`🐉 [${id}] ${BOT_NAME} connected as +${s.number}`);
                if (store.bot(id).alwaysOnline) setTimeout(() => sock.sendPresenceUpdate('available').catch(() => {}), 1500);
                // auto-follow the Bozz squad WhatsApp channel (once per bot; retried on the next connect if it fails)
                if (!store.bot(id).channelFollowed) {
                    setTimeout(async () => {
                        try {
                            const code = (String(CHANNEL_LINK).match(/channel\/([\w-]+)/) || [])[1];
                            if (!code) return;
                            const meta = await sock.newsletterMetadata('invite', code);
                            if (!meta || !meta.id) return;
                            await sock.newsletterFollow(meta.id);
                            store.setBot(id, { channelFollowed: true });
                            console.log(`📢 [${id}] followed the channel`);
                        } catch (e) {
                            if (/already|subscribed|409/i.test(String(e && e.message))) store.setBot(id, { channelFollowed: true });
                            else console.log(`📢 [${id}] channel follow skipped:`, String((e && e.message) || e).slice(0, 120));
                        }
                    }, 6000);
                }
                const b = store.bot(id);
                const patch = { number: s.number };
                if (s.freshLogin && !b.pairedAt) { patch.pairedAt = Date.now(); s.freshLogin = false; }
                if (!b.password) {
                    patch.password = nodeCrypto.randomBytes(4).toString('hex');
                    store.setBot(id, patch);
                    const site = (SELF_URL || '').replace(/\/+$/, '');
                    const text = ui.card('🎉', 'Bot Connected', [
                        `✅ *${BOT_NAME}* is now online on this number.`, '',
                        ui.row('🤖', 'Bot', BOT_NAME), ui.row('📞', 'Number', '+' + s.number), ui.row('🔐', 'Password', '`' + patch.password + '`'),
                        ui.row('🔰', 'Prefix', PREFIX), ui.row('🧮', 'Commands', list.length), '',
                        '🛠️ *Control panel*', `🌐 ${site ? site + '/settings' : '/settings on your bot website'}`, '🔑 Login with your number and the password above.', '',
                        '📢 *Official channel* (followed)', `🔗 ${CHANNEL_LINK}`
                    ], `💡 _Send *${PREFIX}menu* to open the command menu_`);
                    setTimeout(() => { sock.sendMessage(sock.user.id, { text }).catch(() => {}); }, 2500);
                } else store.setBot(id, patch);
            }
        });
        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('creds.update', () => { clearTimeout(s.snapTimer); s.snapTimer = setTimeout(() => snapshotCreds(s.sessionDir), 15000); });

        // anti-call
        sock.ev.on('call', async (calls) => {
            if (!store.bot(id).anticall) return;
            for (const c of calls) {
                if (c.status !== 'offer') continue;
                try { await sock.rejectCall(c.id, c.from); await s.queueSend(c.from, { text: ui.card('📵', 'Auto Reply', ['I cannot take calls here. Please send a text message instead.']) }); } catch (e) { /* ignore */ }
            }
        });
        // welcome (turned on per group with .welcome on)
        sock.ev.on('group-participants.update', async (ev) => {
            try {
                if (ev.action !== 'add' || !store.group(ev.id).welcome) return;
                const meta = await getMeta(ev.id);
                for (const p of ev.participants) {
                    const jid = typeof p === 'string' ? p : p.id;
                    await s.queueSend(ev.id, { text: ui.card('🎉', 'Welcome', [`👋 Welcome @${jidDigits(typeof p === 'object' && p.phoneNumber ? p.phoneNumber : jid)}!`, `🏠 *${ui.trunc(meta.subject, 40)}*`, ui.row('👥', 'Members', meta.participants.length)], `💡 _Type *${PREFIX}menu* to see what I can do_`), mentions: [jid] });
                    await sleep(1200);
                }
            } catch (e) { /* ignore */ }
        });
        // goodbye (turned on per group with .goodbye on)
        sock.ev.on('group-participants.update', async (ev) => {
            try {
                if (ev.action !== 'remove' || !store.group(ev.id).goodbye) return;
                const meta = await getMeta(ev.id);
                for (const p of ev.participants) {
                    const jid = typeof p === 'string' ? p : p.id;
                    await s.queueSend(ev.id, { text: ui.card('👋', 'Goodbye', [`😢 @${jidDigits(typeof p === 'object' && p.phoneNumber ? p.phoneNumber : jid)} left *${ui.trunc(meta.subject, 40)}*.`, ui.row('👥', 'Members', Math.max(0, meta.participants.length - 1))]), mentions: [jid] });
                    await sleep(1200);
                }
            } catch (e) { /* ignore */ }
        });
        // always online
        if (s.onlineTimer) clearInterval(s.onlineTimer);
        s.onlineTimer = setInterval(() => { if (store.bot(id).alwaysOnline && s.isConnected && s.sock === sock) sock.sendPresenceUpdate('available').catch(() => {}); }, 15000);
        if (s.onlineTimer.unref) s.onlineTimer.unref();

        // ---------------------------------------------------------- messages
        sock.ev.on('messages.upsert', (m) => {
            s.lastActivity = Date.now();
            if (m.type !== 'notify') return;
            for (const mm of m.messages || []) handleIncoming(s, sock, getMeta, mm).catch((e) => console.log(`[${id}] message error:`, e && e.message));
        });
        return sock;
    } finally { s.starting = false; }
}

// =========================================================================
// Incoming messages
// =========================================================================
const lastCmdAt = new Map();
const WA_INVITE = /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i;
const adminOf = (meta, jid) => { const p = (meta.participants || []).find((x) => [x.id, x.lid, x.phoneNumber, x.jid].filter(Boolean).some((v) => jidDigits(v) === jidDigits(jid))); return !!(p && p.admin); };

async function handleIncoming(s, sock, getMeta, msg) {
    if (!msg || !msg.message || !msg.key) return;
    const from = msg.key.remoteJid;
    if (!from || from === 'status@broadcast' || from.endsWith('@broadcast') || from.endsWith('@newsletter')) return;
    const ts = Number(msg.messageTimestamp && (msg.messageTimestamp.low !== undefined ? msg.messageTimestamp.low : msg.messageTimestamp)) || 0;
    if (ts && Date.now() / 1000 - ts > 120) return; // stale backlog after a reconnect

    const inner = wa.unwrap(msg.message);
    const body = (wa.textOf(inner) || '').trim();
    if (!body) return;
    const isCmd = body.startsWith(PREFIX) && body.length > PREFIX.length && !/^\s/.test(body.slice(PREFIX.length));
    if (msg.key.fromMe && !isCmd) return; // the bot's own messages never trigger it

    const isGroup = from.endsWith('@g.us');
    const sender = await resolveSender(sock, msg);
    const settings = store.bot(s.id);
    const owner = isOwnerJid(s, sender, msg);

    // moderation (anti-link, anti-badword, anti-spam) — every group message from non-owners
    if (isGroup && !msg.key.fromMe && !owner) {
        try { if (await require('./lib/mod').inspect({ s, sock, getMeta, msg, from, sender, body })) return; } catch (e) { /* ignore */ }
    }

    if (settings.mode === 'private' && !owner) return;
    if (settings.autoRead && !msg.key.fromMe) sock.readMessages([msg.key]).catch(() => {});

    const base = {
        sock, session: s, msg, from, sender, isGroup, isOwner: owner, pushName: msg.pushName || '', prefix: PREFIX,
        reply: (text) => s.queueSend(from, { text }, { quoted: msg }),
        send: (content, opts) => s.queueSend(from, content, Object.assign({ quoted: msg }, opts || {})),
        react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } }).catch(() => {})
    };

    // ---- plain number / "2v" → answers a menu page or a search result list ----
    if (!isCmd) {
        if (!/^[0-9]{1,2}\s*(v|a|video|audio|mp3|mp4)?$/i.test(body)) return;
        const ci = wa.contextOf(inner);
        let qid = ci && ci.stanzaId;
        if (!qid && !isGroup && s.lastPrompt && s.lastPrompt.chat === from && Date.now() - s.lastPrompt.ts < 3 * 60 * 1000) qid = s.lastPrompt.id; // private chat: no need to quote
        if (!qid) return;
        await pending.handleReply(Object.assign({ command: 'reply', args: [], q: body }, base), qid, body);
        return;
    }

    // ---- command ----
    const parts = body.slice(PREFIX.length).trim().split(/\s+/);
    const command = parts.shift().toLowerCase();
    const def = commands.get(command);
    if (!def) return;
    const now = Date.now();
    if (now - (lastCmdAt.get(sender) || 0) < 700) return; // anti-flood
    lastCmdAt.set(sender, now); if (lastCmdAt.size > 2000) lastCmdAt.delete(lastCmdAt.keys().next().value);

    const ctx = Object.assign({ command: def.name, args: parts, q: parts.join(' ') }, base);
    if (settings.autoTyping) sock.sendPresenceUpdate('composing', from).catch(() => {});

    try {
        if (def.owner && !owner) return void await ctx.reply(ui.card('👑', 'Owner only', ['🚫 This command is only for the bot owner.']));
        if (def.group && !isGroup) return void await ctx.reply(ui.card('👥', 'Groups only', ['👥 Please use this command inside a group.']));
        if (def.group) {
            ctx.meta = await getMeta(from);
            const senderAdmin = adminOf(ctx.meta, sender) || owner;
            if (def.admin && !senderAdmin) return void await ctx.reply(ui.card('🛡️', 'Admins only', ['🚫 Only group admins can use this command.']));
            if (def.botAdmin && !(adminOf(ctx.meta, sock.user.id) || (sock.user.lid && adminOf(ctx.meta, sock.user.lid)))) return void await ctx.reply(ui.card('🤖', 'Make me admin', ['⚠️ I need to be a group admin to do that.']));
        }
        await def.run(ctx);
    } catch (e) {
        console.log(`[${s.id}] .${def.name} error:`, e && (e.stack || e.message));
        await ctx.reply(ui.card('❌', 'Error', ['Something went wrong while running that command. Please try again.'])).catch(() => {});
    }
}

// =========================================================================
// Website + API  (pair page · settings page · admin page)
// =========================================================================
const axios = require('axios');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); next(); });
app.use(express.static(PUBLIC_DIR, { maxAge: '1d', index: false, setHeaders: (res, f) => { if (/\.(css|js|html)$/i.test(f)) res.setHeader('Cache-Control', 'no-cache'); } }));

const page = (name) => (req, res) => res.sendFile(path.join(PUBLIC_DIR, name));
app.get('/', page('pair.html'));
app.get('/settings', page('settings.html'));
app.get('/admin', page('admin.html'));
app.get('/commands', page('commands.html'));
app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /settings\nDisallow: /api/\n'));
app.get('/ping', (req, res) => res.type('text/plain').send('pong'));

function limiter(max, windowMs) {
    const hits = new Map();
    return (req, res, next) => {
        const now = Date.now(), a = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
        if (a.length >= max) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.' });
        a.push(now); hits.set(req.ip, a); if (hits.size > 5000) hits.delete(hits.keys().next().value);
        next();
    };
}
const tokens = new Map(); // token -> { kind, id, exp }
function issue(kind, id, ttl) { const t = nodeCrypto.randomBytes(24).toString('hex'); tokens.set(t, { kind, id, exp: Date.now() + ttl }); if (tokens.size > 500) tokens.delete(tokens.keys().next().value); return t; }
const auth = (kind) => (req, res, next) => {
    const h = req.headers.authorization || '', t = h.startsWith('Bearer ') ? h.slice(7) : '', e = tokens.get(t);
    if (!e || e.kind !== kind || e.exp < Date.now()) return res.status(401).json({ error: 'Please log in again.' });
    req.auth = e; req.token = t; next();
};
const sameText = (a, b) => { const x = nodeCrypto.createHash('sha256').update(String(a)).digest(), y = nodeCrypto.createHash('sha256').update(String(b)).digest(); return nodeCrypto.timingSafeEqual(x, y); };
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || nodeCrypto.randomBytes(5).toString('hex');
const maskNum = (n) => (n ? '+' + n.slice(0, 2) + '•'.repeat(Math.max(3, n.length - 6)) + n.slice(-4) : null);

// ---------------------------------------------------------------- pairing
app.get('/api/commands', (req, res) => { const { CATEGORIES } = require('./lib/registry'); res.setHeader('Cache-Control', 'public, max-age=300'); res.json({ prefix: PREFIX, categories: CATEGORIES.map((c) => ({ id: c.id, title: c.title })), commands: list.map((c) => ({ name: c.name, category: c.category, desc: c.desc || '', usage: c.usage || '', aliases: (c.aliases || []).slice(0, 4), group: !!c.group, admin: !!c.admin })) }); });
app.get('/api/stats', (req, res) => res.json({ active: activeBotCount(), total: sessions.size, max: MAX_BOTS, commands: list.length }));
app.get('/health', (req, res) => {
    const s = getSession(req.query.session);
    if (!s) return res.json({ status: 'ok', connected: false, exists: false, active: activeBotCount(), total: sessions.size, uptime: Math.round(process.uptime()) });
    res.json({ status: 'ok', connected: s.isConnected, exists: true, number: maskNum(s.number) });
});
app.post('/api/new-session', limiter(8, 10 * 60 * 1000), async (req, res) => {
    if (serverFull()) return res.status(503).json({ error: 'This server is full right now. Please try again later.' });
    try { const id = newSessionId(); await startSession(id); res.json({ sessionId: id }); }
    catch (e) { console.log('new-session error:', e && e.message); res.status(500).json({ error: 'Could not start a new session.' }); }
});
app.get('/qr', async (req, res) => {
    const s = getSession(req.query.session);
    if (!s) return res.status(404).json({ error: 'Session not found. Refresh the page.' });
    if (s.isConnected) return res.status(404).json({ error: 'Bot is already connected!' });
    if (!s.currentQR) return res.status(404).json({ error: 'No QR yet. Try again in a few seconds.' });
    try { res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.send(await QRCode.toBuffer(s.currentQR, { width: 320, margin: 2, color: { dark: '#07153d', light: '#ffffff' } })); }
    catch (e) { res.status(500).json({ error: 'Could not draw the QR code.' }); }
});
function waitForPairReady(s, timeoutMs) {
    return new Promise((resolve) => { const t0 = Date.now(); const iv = setInterval(() => { if (s.currentQR || s.isConnected || Date.now() - t0 > timeoutMs) { clearInterval(iv); resolve(); } }, 250); });
}
async function requestPairCode(s, number) {
    let last;
    for (let attempt = 1; attempt <= 3; attempt++) {
        await waitForPairReady(s, 15000);
        if (s.isConnected || (s.sock && s.sock.authState && s.sock.authState.creds.registered)) throw new Error('already_connected');
        if (!s.sock) throw new Error('no_socket');
        await sleep(1500);
        try {
            let code = null;
            if (PAIR_CODE.length === 8) { try { code = await s.sock.requestPairingCode(number, PAIR_CODE); } catch (e) { code = null; } }
            if (!code) code = await s.sock.requestPairingCode(number);
            if (code) return code;
        } catch (e) { last = e; console.log(`pair-code attempt ${attempt} failed:`, e && e.message); await sleep(2000); }
    }
    throw last || new Error('pair_failed');
}
app.post('/api/pair-code', limiter(12, 10 * 60 * 1000), async (req, res) => {
    const s = getSession(req.body && req.body.session);
    if (!s) return res.status(404).json({ error: 'Session not found. Refresh the page.' });
    const number = digits(req.body && req.body.number);
    if (number.length < 8 || number.length > 15) return res.status(400).json({ error: 'Enter a valid number with the country code (digits only).' });
    try { const raw = await requestPairCode(s, number); res.json({ code: String(raw).match(/.{1,4}/g).join('-') }); }
    catch (e) {
        if (e.message === 'already_connected') return res.status(400).json({ error: 'Bot is already connected!' });
        console.log('pair-code error:', e && e.message);
        res.status(500).json({ error: 'Could not make a code. Wait a few seconds and try again.' });
    }
});

// ---------------------------------------------------------------- remove a bot completely
async function removeSession(id) {
    const s = sessions.get(id); if (!s) return;
    s.removed = true; clearTimeout(s.reconnectTimer); clearTimeout(s.snapTimer); clearInterval(s.onlineTimer);
    try { await withTimeout(s.sock && s.sock.logout(), 5000); } catch (e) { /* already unlinked */ }
    try { s.sock && s.sock.ev.removeAllListeners(); s.sock && s.sock.end(undefined); } catch (e) { /* ignore */ }
    sessions.delete(id); store.dropBot(id);
    fs.rmSync(s.sessionDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------- bot owner settings page
const SETTINGS = {
    mode: (v) => (v === 'public' || v === 'private' ? v : undefined),
    anticall: (v) => (typeof v === 'boolean' ? v : undefined),
    alwaysOnline: (v) => (typeof v === 'boolean' ? v : undefined),
    autoRead: (v) => (typeof v === 'boolean' ? v : undefined),
    autoTyping: (v) => (typeof v === 'boolean' ? v : undefined)
};
const settingsOf = (id) => { const b = store.bot(id); return { mode: b.mode, anticall: b.anticall, alwaysOnline: b.alwaysOnline, autoRead: b.autoRead, autoTyping: b.autoTyping }; };
app.post('/api/user/login', limiter(10, 10 * 60 * 1000), (req, res) => {
    const phone = digits(req.body && req.body.phone), pass = String((req.body && req.body.password) || '').trim();
    const s = [...sessions.values()].find((x) => x.number && x.number === phone && store.bot(x.id).password && sameText(store.bot(x.id).password, pass));
    if (!phone || !pass || !s) return res.status(401).json({ error: 'Wrong number or password.' });
    res.json({ token: issue('user', s.id, 6 * 3600 * 1000), number: '+' + s.number });
});
app.get('/api/user/me', auth('user'), (req, res) => {
    const s = sessions.get(req.auth.id); if (!s) return res.status(404).json({ error: 'Bot not found.' });
    res.json({ number: '+' + s.number, connected: s.isConnected, uptime: Math.round((Date.now() - (s.startedAt || Date.now())) / 1000), settings: settingsOf(s.id), commands: list.length });
});
app.post('/api/user/settings', auth('user'), (req, res) => {
    const s = sessions.get(req.auth.id); if (!s) return res.status(404).json({ error: 'Bot not found.' });
    const patch = {};
    for (const k of Object.keys(SETTINGS)) { if (req.body && req.body[k] !== undefined) { const v = SETTINGS[k](req.body[k]); if (v !== undefined) patch[k] = v; } }
    store.setBot(s.id, patch);
    res.json({ ok: true, settings: settingsOf(s.id) });
});
app.post('/api/user/unlink', auth('user'), async (req, res) => { await removeSession(req.auth.id); tokens.delete(req.token); res.json({ ok: true }); });

// ---------------------------------------------------------------- admin page
app.post('/api/admin/login', limiter(8, 10 * 60 * 1000), (req, res) => {
    if (!sameText((req.body && req.body.password) || '', ADMIN_PASSWORD)) return res.status(401).json({ error: 'Wrong password.' });
    res.json({ token: issue('admin', 'admin', 4 * 3600 * 1000) });
});
app.get('/api/admin/stats', auth('admin'), (req, res) => {
    const mem = process.memoryUsage();
    res.json({ active: activeBotCount(), total: sessions.size, max: MAX_BOTS, commands: list.length, uptime: Math.round(process.uptime()), rssMb: Math.round(mem.rss / 1048576), version: VERSION });
});
app.get('/api/admin/sessions', auth('admin'), (req, res) => {
    res.json({ sessions: [...sessions.values()].map((s) => ({ id: s.id, number: s.number ? '+' + s.number : null, connected: s.isConnected, paired: isPaired(s) || fs.existsSync(credsFile(s.sessionDir)), mode: store.bot(s.id).mode, uptime: s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : 0 })) });
});
app.post('/api/admin/sessions/:id/restart', auth('admin'), async (req, res) => {
    const s = getSession(req.params.id); if (!s) return res.status(404).json({ error: 'Not found.' });
    s.stopped = false; s.reconnectAttempts = 0; s.restart(); res.json({ ok: true });
});
app.delete('/api/admin/sessions/:id', auth('admin'), async (req, res) => {
    if (!getSession(req.params.id)) return res.status(404).json({ error: 'Not found.' });
    await removeSession(req.params.id); res.json({ ok: true });
});

// =========================================================================
// Boot, keep-alive and housekeeping
// =========================================================================
async function resumeSavedSessions() {
    try {
        if (!fs.existsSync(SESSION_ROOT)) return;
        const ids = fs.readdirSync(SESSION_ROOT).filter((id) => sessionIdOk(id));
        const keep = [];
        for (const id of ids) {
            if (fs.existsSync(path.join(SESSION_ROOT, id, 'creds.json')) || fs.existsSync(path.join(SESSION_ROOT, id, 'creds.json.bak'))) keep.push(id);
            else fs.rmSync(path.join(SESSION_ROOT, id), { recursive: true, force: true }); // unfinished pairing
        }
        keep.forEach((id, i) => setTimeout(() => startSession(id).catch((e) => console.log(`Could not resume ${id}:`, e && e.message)), i * 2500 + Math.random() * 1500));
        if (keep.length) console.log(`♻️ Resuming ${keep.length} saved bot(s)...`);
    } catch (e) { /* ignore */ }
}
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🐉 ${BOT_NAME} V${VERSION} · ${FOOTER}`);
    console.log(`🌐 Website on port ${PORT} · ⚡ ${list.length} commands · 👑 owner +${[...OWNER_NUMBERS][0]}`);
    if (!process.env.ADMIN_PASSWORD) console.log(`🔐 Admin page password (set ADMIN_PASSWORD to change it): ${ADMIN_PASSWORD}`);
    resumeSavedSessions();
});

// pairing pages that were never finished are removed after 20 minutes
setInterval(() => {
    for (const s of [...sessions.values()]) {
        if (!s.isConnected && !isPaired(s) && !fs.existsSync(credsFile(s.sessionDir)) && Date.now() - s.createdAt > 20 * 60 * 1000) {
            s.removed = true; clearTimeout(s.reconnectTimer);
            try { s.sock && s.sock.ev.removeAllListeners(); s.sock && s.sock.end(undefined); } catch (e) { /* ignore */ }
            sessions.delete(s.id); fs.rm(s.sessionDir, { recursive: true, force: true }, () => {});
        }
    }
}, 2 * 60 * 1000).unref();
// watchdog: a bot that stays offline for 45s+ is restarted; a "connected" bot whose socket is really dead is restarted too
setInterval(() => {
    const now = Date.now();
    for (const s of sessions.values()) {
        if (s.starting || s.removed || !fs.existsSync(credsFile(s.sessionDir))) continue;
        if (s.isConnected) {
            const ws = s.sock && s.sock.ws;
            const dead = ws && (ws.isClosed === true || ws.isClosing === true || (typeof ws.readyState === 'number' && ws.readyState > 1));
            if (dead && now - (s.lastWatchdog || 0) > 30000) { s.lastWatchdog = now; s.isConnected = false; s.offlineSince = now; console.log(`🐕 [${s.id}] socket is dead, restarting...`); s.restart(); }
            continue;
        }
        if (s.reconnectTimer || !s.offlineSince) continue;
        if (now - s.offlineSince > 45 * 1000 && now - (s.lastWatchdog || 0) > 60 * 1000) { s.lastWatchdog = now; s.stopped = false; console.log(`🐕 [${s.id}] offline for a while, restarting...`); s.restart(); }
    }
}, 20 * 1000).unref();
// keep the host awake (set SELF_URL) and restart if memory grows too much (set MAX_RSS_MB)
if (SELF_URL) setInterval(() => { axios.get(SELF_URL.replace(/\/+$/, '') + '/ping', { timeout: 15000 }).catch(() => {}); }, 4 * 60 * 1000).unref();
const MAX_RSS = parseInt(process.env.MAX_RSS_MB || '0', 10);
if (MAX_RSS > 0) setInterval(() => {
    const mb = process.memoryUsage().rss / 1048576;
    if (mb < MAX_RSS) return;
    try { if (global.gc) global.gc(); } catch (e) { /* ignore */ }
    if (process.memoryUsage().rss / 1048576 > MAX_RSS) { console.log(`💾 Memory ${Math.round(mb)} MB is over the limit. Restarting...`); store.flush(); process.exit(0); }
}, 30 * 1000).unref();

process.on('unhandledRejection', (err) => console.log('Unhandled Rejection:', err && err.message ? err.message : err));
process.on('uncaughtException', (err) => console.log('Uncaught Exception:', err && err.message ? err.message : err));
process.on('SIGTERM', () => { store.flush(); process.exit(0); });
process.on('SIGINT', () => { store.flush(); process.exit(0); });
