'use strict';
// Zadashi - MD · 👑 OWNER (6) — bot owner only
const { reg } = require('../lib/registry');
const { card, row, usage, fail, modeLabel } = require('../lib/ui');
const wa = require('../lib/wa');
const store = require('../lib/store');
const { PREFIX, digits } = require('../lib/config');

const O = { category: 'owner', owner: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const onOff = (b) => (b ? '✅ ON' : '❌ OFF');

reg(Object.assign({ name: 'mode', aliases: ['setmode', 'workmode'], emoji: '⚙️', desc: 'public (everyone) or private (owner only)', usage: 'public | private' }, O, {
    run: async (ctx) => {
        const v = (ctx.args[0] || '').toLowerCase();
        if (v === 'public' || v === 'private') store.setBot(ctx.session.id, { mode: v });
        const cfg = store.bot(ctx.session.id);
        await ctx.reply(card('⚙️', 'Bot Mode', [row('📊', 'Mode', modeLabel(cfg)), '', '🌍 *public* — everyone can use the bot', '🔒 *private* — only the owner can'], `💡 _${PREFIX}mode public  ·  ${PREFIX}mode private_`));
    } }));
reg(Object.assign({ name: 'anticall', aliases: ['rejectcall'], emoji: '📵', desc: 'auto-reject incoming calls', usage: 'on | off' }, O, {
    run: async (ctx) => {
        const v = (ctx.args[0] || '').toLowerCase();
        if (v === 'on' || v === 'off') store.setBot(ctx.session.id, { anticall: v === 'on' });
        await ctx.reply(card('📵', 'Anti Call', [row('📊', 'Status', onOff(store.bot(ctx.session.id).anticall))], `💡 _${PREFIX}anticall on  ·  ${PREFIX}anticall off_`));
    } }));
reg(Object.assign({ name: 'block', aliases: ['blockuser'], emoji: '🚫', desc: 'block a number (reply / @mention / number)', usage: '<number>' }, O, {
    run: async (ctx) => {
        const q = wa.quotedOf(ctx.msg, ctx.from);
        const t = wa.mentionsOf(ctx.msg)[0] || (q && q.sender) || (digits(ctx.q).length >= 8 ? digits(ctx.q) + '@s.whatsapp.net' : (ctx.isGroup ? '' : ctx.from));
        if (!t) return ctx.reply(usage('⛔', 'Block', 'Reply to the user, @mention, or type the number.', `${PREFIX}block 94771234567`));
        await ctx.sock.updateBlockStatus(t, 'block');
        await ctx.reply(card('⛔', 'Blocked', [`✅ +${wa.jidDigits(t)} is blocked.`]));
    } }));
reg(Object.assign({ name: 'unblock', aliases: ['unblockuser'], emoji: '🔓', desc: 'unblock a number', usage: '<number>' }, O, {
    run: async (ctx) => {
        const q = wa.quotedOf(ctx.msg, ctx.from);
        const t = wa.mentionsOf(ctx.msg)[0] || (q && q.sender) || (digits(ctx.q).length >= 8 ? digits(ctx.q) + '@s.whatsapp.net' : (ctx.isGroup ? '' : ctx.from));
        if (!t) return ctx.reply(usage('✅', 'Unblock', 'Reply to the user, @mention, or type the number.', `${PREFIX}unblock 94771234567`));
        await ctx.sock.updateBlockStatus(t, 'unblock');
        await ctx.reply(card('✅', 'Unblocked', [`✅ +${wa.jidDigits(t)} is unblocked.`]));
    } }));
reg(Object.assign({ name: 'bc', aliases: ['broadcast', 'bcgroups'], emoji: '📣', desc: 'send a message to all groups', usage: '<message>' }, O, {
    run: async (ctx) => {
        const text = ctx.q.trim();
        if (!text) return ctx.reply(usage('📣', 'Broadcast', 'Type the message to send to every group the bot is in.', `${PREFIX}bc Hello everyone!`));
        const groups = Object.keys(await ctx.sock.groupFetchAllParticipating()).slice(0, 60);
        if (!groups.length) return ctx.reply(fail('The bot is not in any group.'));
        await ctx.reply(card('📣', 'Broadcast', [`📤 Sending to ${groups.length} group(s) slowly to protect the number...`]));
        let ok = 0;
        for (const g of groups) {
            try { await ctx.session.queueSend(g, { text: card('📣', 'Broadcast', [text]) }); ok++; } catch (e) { /* skip */ }
            await sleep(3500 + Math.random() * 3500);
        }
        await ctx.reply(card('📣', 'Broadcast', [`✅ Done: ${ok}/${groups.length} groups`]));
    } }));
reg(Object.assign({ name: 'restart', aliases: ['reboot', 'reconnect'], emoji: '🔄', desc: 'reconnect this bot', usage: '' }, O, {
    run: async (ctx) => {
        await ctx.reply(card('🔄', 'Restart', ['♻️ Reconnecting the bot... it will be back in a few seconds.']));
        setTimeout(() => ctx.session.restart(), 1500);
    } }));
