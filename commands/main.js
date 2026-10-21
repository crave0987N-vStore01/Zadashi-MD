'use strict';
// Zadashi - MD · 🏠 MAIN (4) — menu, alive, ping, owner  (+ the reply-a-number menu)
const os = require('os');
const { reg, list, CATEGORIES } = require('../lib/registry');
const ui = require('../lib/ui');
const pending = require('../lib/pending');
const assets = require('../lib/assets');
const store = require('../lib/store');
const { BOT_NAME, OWNER_NAME, OWNER_NUMBER, PREFIX, VERSION, CHANNEL_LINK } = require('../lib/config');

const { card, row } = ui;

async function sendMainMenu(ctx) {
    const text = ui.mainMenu(ctx.pushName, ctx.session);
    let pic = null;
    try {
        const cfg = store.bot(ctx.session.id), { time } = ui.nowParts();
        pic = await require('../lib/menuimg').menuImage({ name: ui.trunc(ctx.pushName || 'Friend', 18), greeting: ui.greeting().split(' ').slice(1).join(' ') || 'Hello', mode: cfg.mode === 'private' ? 'Private' : 'Public', commands: list.length, uptime: ui.upShort(process.uptime()), time, prefix: PREFIX });
    } catch (e) { console.log('menu picture skipped:', String(e.message).slice(0, 100)); }
    pic = pic || assets.logo();
    const sent = pic ? await ctx.send({ image: pic, caption: text }) : await ctx.reply(text);
    pending.remember(ctx.session, sent, { type: 'menu', level: 'main' });
    return sent;
}
reg({ name: 'menu', aliases: ['help', 'list', 'commands', 'start'], category: 'main', emoji: '📖', desc: 'open the menu (reply with a number)', usage: '',
    run: async (ctx) => { await ctx.react('📖'); await sendMainMenu(ctx); } });

// reply 1-8 to the menu → category page · 0 → back to the main menu
pending.on('menu', async (ctx, d, text) => {
    const t = String(text).trim();
    if (!/^\d{1,2}$/.test(t)) return;
    const n = parseInt(t, 10);
    if (n === 0) return void await sendMainMenu(ctx);
    let page = null;
    if (n >= 1 && n <= CATEGORIES.length) page = ui.categoryMenu(CATEGORIES[n - 1].id);
    else if (n === CATEGORIES.length + 1) page = ui.allMenu();
    if (!page) return void await ctx.reply(card('🤔', 'Menu', [`Please reply with a number from 0 to ${CATEGORIES.length + 1}.`]));
    await ctx.react(n <= CATEGORIES.length ? CATEGORIES[n - 1].emoji : '🗂️');
    const sent = await ctx.send({ text: page });
    pending.remember(ctx.session, sent, { type: 'menu', level: 'page' });
});

reg({ name: 'alive', aliases: ['bot', 'status', 'online'], category: 'main', emoji: '💚', desc: 'check that the bot is online', usage: '',
    run: async (ctx) => {
        const cfg = store.bot(ctx.session.id);
        const mem = Math.round(process.memoryUsage().rss / 1048576);
        const text = card('💚', 'Bot Online', [
            `${ui.greeting()}, *${ui.trunc(ctx.pushName || 'Friend', 20)}* 👋`, '',
            row('🤖', 'Bot', BOT_NAME), row('✅', 'Status', 'Online 24/7'), row('⚙️', 'Mode', ui.modeLabel(cfg)),
            row('⏱️', 'Uptime', ui.upShort(process.uptime())), row('💾', 'Memory', mem + ' MB'), row('🧮', 'Commands', list.length),
            row('👑', 'Owner', '+' + OWNER_NUMBER), row('🚀', 'Version', 'V' + VERSION)
        ], `💡 _Type *${PREFIX}menu* to see all commands_\n${ui.foot()}`);
        const logo = assets.logo();
        if (logo) await ctx.send({ image: logo, caption: text }); else await ctx.reply(text);
    } });

reg({ name: 'ping', aliases: ['speed', 'latency', 'p'], category: 'main', emoji: '🏓', desc: 'bot speed', usage: '',
    run: async (ctx) => {
        const t0 = Date.now();
        const sent = await ctx.reply('🏓 _Pinging..._');
        const ms = Date.now() - t0;
        const level = ms < 400 ? ['⚡', 'Excellent'] : ms < 1000 ? ['🟢', 'Good'] : ['🟡', 'Slow'];
        const text = card('🏓', 'Pong!', [row('⚡', 'Speed', ms + ' ms'), row(level[0], 'Signal', level[1]), row('⏱️', 'Uptime', ui.upShort(process.uptime())), row('💾', 'Memory', Math.round(process.memoryUsage().rss / 1048576) + ' MB'), row('🖥️', 'Host', os.platform())]);
        try { await ctx.sock.sendMessage(ctx.from, { text, edit: sent.key }); } catch (e) { await ctx.reply(text); }
    } });

reg({ name: 'owner', aliases: ['creator', 'dev', 'developer'], category: 'main', emoji: '👑', desc: 'contact the bot owner', usage: '',
    run: async (ctx) => {
        const vcard = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${OWNER_NAME} (Owner)`, `ORG:${BOT_NAME};`, `TEL;type=CELL;type=VOICE;waid=${OWNER_NUMBER}:+${OWNER_NUMBER}`, 'END:VCARD'].join('\n');
        await ctx.reply(card('👑', 'Bot Owner', [row('👤', 'Name', OWNER_NAME), row('📞', 'Number', '+' + OWNER_NUMBER), row('💬', 'Chat', 'wa.me/' + OWNER_NUMBER), row('📢', 'Channel', CHANNEL_LINK)]));
        await ctx.send({ contacts: { displayName: OWNER_NAME + ' (Owner)', contacts: [{ vcard }] } });
    } });
