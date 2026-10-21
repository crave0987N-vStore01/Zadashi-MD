'use strict';
// Zadashi - MD · 👥 GROUP (10) — admin tools
const { reg } = require('../lib/registry');
const { card, row, usage, fail, trunc } = require('../lib/ui');
const wa = require('../lib/wa');
const store = require('../lib/store');
const { PREFIX, OWNER_NUMBERS } = require('../lib/config');

const G = { group: true, category: 'group' };
const cooldown = new Map();
function coolOk(jid, ms) { const left = ms - (Date.now() - (cooldown.get(jid) || 0)); if (left > 0) return Math.ceil(left / 1000); cooldown.set(jid, Date.now()); if (cooldown.size > 200) cooldown.delete(cooldown.keys().next().value); return 0; }

// participant <-> jid matching (works with phone numbers and hidden LIDs)
const idsOf = (p) => [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(wa.jidDigits);
const matches = (p, jid) => { const d = wa.jidDigits(jid); return !!d && idsOf(p).includes(d); };
function targetsOf(ctx) {
    const q = wa.quotedOf(ctx.msg, ctx.from);
    const raw = wa.mentionsOf(ctx.msg).slice();
    if (q && q.sender) raw.push(q.sender);
    const out = [];
    for (const j of raw) { const p = ctx.meta.participants.find((x) => matches(x, j)); if (p && !out.includes(p)) out.push(p); }
    return out;
}
const isProtected = (ctx, p) => idsOf(p).some((d) => OWNER_NUMBERS.has(d)) || matches(p, ctx.sock.user.id) || (ctx.sock.user.lid && matches(p, ctx.sock.user.lid));
const nameOf = (p) => '@' + wa.jidDigits(p.phoneNumber || p.jid || p.id);

reg(Object.assign({ name: 'tagall', aliases: ['everyone', 'all'], emoji: '📢', desc: 'mention every member', usage: '[message]', admin: true }, G, {
    run: async (ctx) => {
        const wait = coolOk('tag:' + ctx.from, 60000); if (wait) return ctx.reply(fail(`Please wait ${wait}s before tagging everyone again (protects the number from spam flags).`));
        const mentions = ctx.meta.participants.map((p) => p.id);
        const lines = ctx.meta.participants.map((p) => `🔹 @${wa.jidDigits(p.phoneNumber || p.jid || p.id)}`);
        await ctx.send({ text: `╭━━━〔 📢 *ATTENTION* 〕━━━╮\n┃ 💬 ${ctx.q.trim() || 'Everyone, please check this!'}\n┃\n${lines.map((l) => '┃ ' + l).join('\n')}\n╰━━━━━━━━━━━━━━━━━━╯`, mentions });
    } }));
reg(Object.assign({ name: 'hidetag', aliases: ['ht', 'notify'], emoji: '👻', desc: 'message that silently mentions everyone', usage: '<message>', admin: true }, G, {
    run: async (ctx) => {
        const wait = coolOk('tag:' + ctx.from, 60000); if (wait) return ctx.reply(fail(`Please wait ${wait}s before tagging again.`));
        const q = wa.quotedOf(ctx.msg, ctx.from);
        const text = ctx.q.trim() || (q && q.text) || '📢';
        await ctx.send({ text, mentions: ctx.meta.participants.map((p) => p.id) });
    } }));
reg(Object.assign({ name: 'kick', aliases: ['remove', 'ban'], emoji: '🚷', desc: 'remove a member (reply / @mention)', usage: '@user', admin: true, botAdmin: true }, G, {
    run: async (ctx) => {
        const t = targetsOf(ctx).filter((p) => !isProtected(ctx, p));
        if (!t.length) return ctx.reply(usage('🚪', 'Kick', 'Reply to a member or @mention them.', `${PREFIX}kick @user`));
        await ctx.sock.groupParticipantsUpdate(ctx.from, t.map((p) => p.id), 'remove');
        await ctx.send({ text: card('🚪', 'Removed', [`✅ ${t.map(nameOf).join(', ')} removed from the group.`]), mentions: t.map((p) => p.id) });
    } }));
reg(Object.assign({ name: 'promote', aliases: ['admin', 'makeadmin'], emoji: '⬆️', desc: 'make a member admin (reply / @mention)', usage: '@user', admin: true, botAdmin: true }, G, {
    run: async (ctx) => {
        const t = targetsOf(ctx).filter((p) => !p.admin);
        if (!t.length) return ctx.reply(usage('⬆️', 'Promote', 'Reply to a member or @mention them (they must not be admin yet).', `${PREFIX}promote @user`));
        await ctx.sock.groupParticipantsUpdate(ctx.from, t.map((p) => p.id), 'promote');
        await ctx.send({ text: card('⬆️', 'Promoted', [`👑 ${t.map(nameOf).join(', ')} is now an admin.`]), mentions: t.map((p) => p.id) });
    } }));
reg(Object.assign({ name: 'demote', aliases: ['unadmin', 'removeadmin'], emoji: '⬇️', desc: 'remove admin rights (reply / @mention)', usage: '@user', admin: true, botAdmin: true }, G, {
    run: async (ctx) => {
        const t = targetsOf(ctx).filter((p) => p.admin && !isProtected(ctx, p));
        if (!t.length) return ctx.reply(usage('⬇️', 'Demote', 'Reply to an admin or @mention them.', `${PREFIX}demote @user`));
        await ctx.sock.groupParticipantsUpdate(ctx.from, t.map((p) => p.id), 'demote');
        await ctx.send({ text: card('⬇️', 'Demoted', [`📉 ${t.map(nameOf).join(', ')} is no longer an admin.`]), mentions: t.map((p) => p.id) });
    } }));
reg(Object.assign({ name: 'mute', aliases: ['close', 'lock'], emoji: '🔇', desc: 'only admins can send messages', usage: '', admin: true, botAdmin: true }, G, {
    run: async (ctx) => { await ctx.sock.groupSettingUpdate(ctx.from, 'announcement'); await ctx.reply(card('🔇', 'Group Muted', ['🔒 Only admins can send messages now.'], `🔓 _Use ${PREFIX}unmute to open it again_`)); } }));
reg(Object.assign({ name: 'unmute', aliases: ['open', 'unlock'], emoji: '🔊', desc: 'everyone can send messages', usage: '', admin: true, botAdmin: true }, G, {
    run: async (ctx) => { await ctx.sock.groupSettingUpdate(ctx.from, 'not_announcement'); await ctx.reply(card('🔊', 'Group Opened', ['🔓 Everyone can send messages now.'])); } }));
reg(Object.assign({ name: 'link', aliases: ['grouplink', 'invite'], emoji: '🔗', desc: 'group invite link', usage: '', admin: true, botAdmin: true }, G, {
    run: async (ctx) => { const code = await ctx.sock.groupInviteCode(ctx.from); await ctx.reply(card('🔗', 'Group Link', [row('👥', 'Group', trunc(ctx.meta.subject, 40)), row('🔗', 'Link', 'https://chat.whatsapp.com/' + code)])); } }));

function toggle(name, emoji, title, key, onMsg, offMsg, desc, needBot) {
    reg(Object.assign({ name, emoji, desc, usage: 'on | off', admin: true, botAdmin: !!needBot }, G, {
        run: async (ctx) => {
            const v = (ctx.args[0] || '').toLowerCase();
            if (v !== 'on' && v !== 'off') return ctx.reply(card(emoji, title, [row('📊', 'Status', store.group(ctx.from)[key] ? '✅ ON' : '❌ OFF')], `💡 _${PREFIX}${name} on  ·  ${PREFIX}${name} off_`));
            store.setGroup(ctx.from, { [key]: v === 'on' });
            await ctx.reply(card(emoji, title, [v === 'on' ? onMsg : offMsg]));
        } }));
}
toggle('antilink', '🛡️', 'Anti Link', 'antilink', '✅ ON — group invite links are deleted (admins are allowed).', '❌ OFF — links are allowed.', 'delete WhatsApp group links', true);
toggle('welcome', '👋', 'Welcome', 'welcome', '✅ ON — new members get a welcome message.', '❌ OFF — no welcome messages.', 'welcome new members', false);
