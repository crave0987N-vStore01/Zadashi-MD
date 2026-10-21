'use strict';
// Zadashi - MD · 🛡️ MODERATION — warns, filters, group info, rules (all inside the Group menu)
const { reg } = require('../lib/registry');
const { card, row, usage, fail, trunc } = require('../lib/ui');
const wa = require('../lib/wa');
const store = require('../lib/store');
const mod = require('../lib/mod');
const { PREFIX } = require('../lib/config');

const G = { group: true, category: 'group' };
const A = Object.assign({ admin: true }, G);
const AB = Object.assign({ admin: true, botAdmin: true }, G);
const onOff = (b) => (b ? '✅ ON' : '❌ OFF');
const stripMentions = (t) => t.replace(/@\d+/g, '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- warn system
reg(Object.assign({ name: 'warn', aliases: ['addwarn'], emoji: '⚠️', desc: `warn a member (${mod.MAX_WARN} warns = removed)`, usage: '@user [reason]' }, A, {
    run: async (ctx) => {
        const t = mod.targetsOf(ctx).filter((p) => !mod.isProtected(ctx, p));
        if (!t.length) return ctx.reply(usage('⚠️', 'Warn', 'Reply to a member or @mention them. Admins cannot be warned.', `${PREFIX}warn @user spamming`));
        const reason = trunc(stripMentions(ctx.q), 80) || 'no reason';
        const botAdmin = mod.botIsAdmin(ctx.sock, ctx.meta);
        for (const p of t) {
            const key = mod.numOf(p), n = mod.setWarns(ctx.from, key, mod.warnsOf(ctx.from, key) + 1);
            if (n >= mod.MAX_WARN && botAdmin) {
                await ctx.sock.groupParticipantsUpdate(ctx.from, [p.id], 'remove').catch(() => {});
                mod.setWarns(ctx.from, key, 0);
                await ctx.send({ text: card('🚷', 'Removed', [`⛔ ${mod.nameOf(p)} reached ${mod.MAX_WARN}/${mod.MAX_WARN} warnings and was removed.`, row('📝', 'Reason', reason)]), mentions: [p.id] });
            } else {
                await ctx.send({ text: card('⚠️', 'Warning', [row('👤', 'Member', mod.nameOf(p)), row('📝', 'Reason', reason), row('📊', 'Warns', `${n}/${mod.MAX_WARN}`)], n >= mod.MAX_WARN ? '⚠️ _Make me admin so I can remove members at the limit._' : undefined), mentions: [p.id] });
            }
        }
    } }));
reg(Object.assign({ name: 'warns', aliases: ['warnlist', 'checkwarn'], emoji: '📊', desc: 'see warnings of a member (or everyone)', usage: '[@user]' }, G, {
    run: async (ctx) => {
        const t = mod.targetsOf(ctx);
        if (t.length) return ctx.send({ text: card('📊', 'Warnings', t.map((p) => row('👤', mod.nameOf(p), `${mod.warnsOf(ctx.from, mod.numOf(p))}/${mod.MAX_WARN}`))), mentions: t.map((p) => p.id) });
        const w = store.group(ctx.from).warns || {}, keys = Object.keys(w);
        if (!keys.length) return ctx.reply(card('📊', 'Warnings', ['✅ Nobody has warnings in this group.']));
        await ctx.send({ text: card('📊', 'Warnings', keys.map((k) => row('👤', '@' + k, `${w[k]}/${mod.MAX_WARN}`))), mentions: keys.map((k) => k + '@s.whatsapp.net') });
    } }));
reg(Object.assign({ name: 'resetwarn', aliases: ['clearwarn', 'unwarn'], emoji: '♻️', desc: 'clear warnings of a member', usage: '@user' }, A, {
    run: async (ctx) => {
        const t = mod.targetsOf(ctx);
        if (!t.length) return ctx.reply(usage('♻️', 'Reset Warns', 'Reply to a member or @mention them.', `${PREFIX}resetwarn @user`));
        t.forEach((p) => mod.setWarns(ctx.from, mod.numOf(p), 0));
        await ctx.send({ text: card('♻️', 'Warnings Cleared', [`✅ ${t.map(mod.nameOf).join(', ')} now has 0 warnings.`]), mentions: t.map((p) => p.id) });
    } }));

// ---------------------------------------------------------------- delete a message
reg(Object.assign({ name: 'del', aliases: ['delete', 'rm'], emoji: '🗑️', desc: 'delete a message (reply to it)', usage: '(reply)' }, AB, {
    run: async (ctx) => {
        const q = wa.quotedOf(ctx.msg, ctx.from);
        if (!q) return ctx.reply(usage('🗑️', 'Delete', 'Reply to the message you want removed.', `${PREFIX}del`));
        await ctx.sock.sendMessage(ctx.from, { delete: { remoteJid: ctx.from, id: q.id, participant: q.sender, fromMe: false } });
        await ctx.sock.sendMessage(ctx.from, { delete: ctx.msg.key }).catch(() => {});
    } }));

// ---------------------------------------------------------------- protections (on / off)
function protect(name, emoji, title, key, desc, onMsg, offMsg) {
    reg(Object.assign({ name, emoji, desc, usage: 'on | off' }, AB, {
        run: async (ctx) => {
            const v = (ctx.args[0] || '').toLowerCase();
            if (v !== 'on' && v !== 'off') return ctx.reply(card(emoji, title, [row('📊', 'Status', onOff(store.group(ctx.from)[key]))], `💡 _${PREFIX}${name} on  ·  ${PREFIX}${name} off_`));
            store.setGroup(ctx.from, { [key]: v === 'on' });
            await ctx.reply(card(emoji, title, [v === 'on' ? onMsg : offMsg]));
        } }));
}
protect('antilinkall', '🔗', 'Anti Link (all)', 'antilinkAll', 'delete every link sent by members', '✅ ON — every link from members is deleted + warned (admins are free).', '❌ OFF — normal links are allowed.');
protect('antibadword', '🤬', 'Anti Bad Word', 'antibadword', 'delete messages with banned words', `✅ ON — banned words are deleted + warned. Add words with ${PREFIX}addbad`, '❌ OFF — word filter is off.');
protect('antispam', '🚦', 'Anti Spam', 'antispam', 'stop members who flood the chat', '✅ ON — fast flooding is deleted + warned.', '❌ OFF — spam filter is off.');

reg(Object.assign({ name: 'addbad', aliases: ['addbadword'], emoji: '➕', desc: 'add a banned word', usage: '<word>' }, A, {
    run: async (ctx) => {
        const w = ctx.q.trim().toLowerCase().slice(0, 30);
        if (!w) return ctx.reply(usage('➕', 'Add Bad Word', 'Type the word to ban.', `${PREFIX}addbad word`));
        const g = store.group(ctx.from); const list = g.badwords.slice();
        if (!list.includes(w) && list.length < 100) list.push(w);
        store.setGroup(ctx.from, { badwords: list });
        await ctx.reply(card('➕', 'Bad Words', [`✅ Added. Total: ${list.length}`], `💡 _${PREFIX}antibadword on  to start filtering_`));
    } }));
reg(Object.assign({ name: 'delbad', aliases: ['delbadword', 'rmbad'], emoji: '➖', desc: 'remove a banned word', usage: '<word>' }, A, {
    run: async (ctx) => {
        const w = ctx.q.trim().toLowerCase();
        const list = store.group(ctx.from).badwords.filter((x) => x !== w);
        store.setGroup(ctx.from, { badwords: list });
        await ctx.reply(card('➖', 'Bad Words', [`✅ Removed. Total: ${list.length}`]));
    } }));
reg(Object.assign({ name: 'badwords', aliases: ['badlist'], emoji: '📃', desc: 'list the banned words', usage: '' }, A, {
    run: async (ctx) => {
        const l = store.group(ctx.from).badwords;
        await ctx.reply(card('📃', 'Bad Words', l.length ? [l.map((x) => '• ' + x).join('\n')] : ['No banned words yet.'], `💡 _${PREFIX}addbad <word>_`));
    } }));

// ---------------------------------------------------------------- goodbye, rules, info, admin tools
reg(Object.assign({ name: 'goodbye', aliases: ['bye'], emoji: '👋', desc: 'goodbye message when someone leaves', usage: 'on | off' }, A, {
    run: async (ctx) => {
        const v = (ctx.args[0] || '').toLowerCase();
        if (v === 'on' || v === 'off') store.setGroup(ctx.from, { goodbye: v === 'on' });
        await ctx.reply(card('👋', 'Goodbye', [row('📊', 'Status', onOff(store.group(ctx.from).goodbye))], `💡 _${PREFIX}goodbye on  ·  ${PREFIX}goodbye off_`));
    } }));
reg(Object.assign({ name: 'setrules', aliases: ['addrules'], emoji: '📜', desc: 'save the group rules', usage: '<rules text>' }, A, {
    run: async (ctx) => {
        const t = ctx.q.trim().slice(0, 1200);
        if (!t) return ctx.reply(usage('📜', 'Set Rules', 'Type the rules text.', `${PREFIX}setrules 1. Be kind 2. No spam`));
        store.setGroup(ctx.from, { rules: t });
        await ctx.reply(card('📜', 'Rules Saved', ['✅ Members can read them with ' + PREFIX + 'rules']));
    } }));
reg(Object.assign({ name: 'rules', aliases: ['grouprules'], emoji: '📋', desc: 'show the group rules', usage: '' }, G, {
    run: async (ctx) => {
        const r = store.group(ctx.from).rules;
        await ctx.reply(card('📋', 'Group Rules', [r || 'No rules saved yet.'], r ? undefined : `💡 _Admins: ${PREFIX}setrules <text>_`));
    } }));
reg(Object.assign({ name: 'groupinfo', aliases: ['ginfo', 'gcinfo'], emoji: 'ℹ️', desc: 'details of this group', usage: '' }, G, {
    run: async (ctx) => {
        const m = ctx.meta, admins = m.participants.filter((p) => p.admin), g = store.group(ctx.from);
        const created = m.creation ? new Date(m.creation * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        await ctx.reply(card('ℹ️', 'Group Info', [
            row('🏠', 'Name', trunc(m.subject, 40)), row('👥', 'Members', m.participants.length), row('🛡️', 'Admins', admins.length), row('📅', 'Created', created),
            row('🔒', 'Chat', m.announce ? 'Admins only' : 'Everyone'), '',
            row('🔗', 'Anti link', onOff(g.antilink || g.antilinkAll)), row('🤬', 'Bad words', onOff(g.antibadword)), row('🚦', 'Anti spam', onOff(g.antispam)), row('👋', 'Welcome', onOff(g.welcome)),
            m.desc ? '' : null, m.desc ? trunc(m.desc, 200) : null
        ]));
    } }));
reg(Object.assign({ name: 'modpanel', aliases: ['mod', 'protection', 'security'], emoji: '🛡️', desc: 'all protections of this group', usage: '' }, A, {
    run: async (ctx) => {
        const g = store.group(ctx.from);
        await ctx.reply(card('🛡️', 'Mod Panel', [
            row('🔗', 'Invite links', onOff(g.antilink)), row('🌐', 'All links', onOff(g.antilinkAll)), row('🤬', 'Bad words', onOff(g.antibadword) + ` (${g.badwords.length})`),
            row('🚦', 'Anti spam', onOff(g.antispam)), row('👋', 'Welcome', onOff(g.welcome)), row('🚪', 'Goodbye', onOff(g.goodbye)), row('⚠️', 'Warn limit', mod.MAX_WARN), '',
            mod.botIsAdmin(ctx.sock, ctx.meta) ? '🤖 Bot is admin ✅' : '🤖 Bot is NOT admin ❌ (filters need admin)'
        ], `💡 _${PREFIX}antilink · ${PREFIX}antilinkall · ${PREFIX}antibadword · ${PREFIX}antispam_`));
    } }));
reg(Object.assign({ name: 'tagadmins', aliases: ['admins', 'staff'], emoji: '🛡️', desc: 'mention all admins', usage: '[message]' }, G, {
    run: async (ctx) => {
        const a = ctx.meta.participants.filter((p) => p.admin);
        await ctx.send({ text: card('🛡️', 'Admins', [ctx.q.trim() ? '💬 ' + ctx.q.trim() : null].concat(a.map((p) => '🔹 ' + mod.nameOf(p)))), mentions: a.map((p) => p.id) });
    } }));
reg(Object.assign({ name: 'setname', aliases: ['setsubject', 'gname'], emoji: '✏️', desc: 'change the group name', usage: '<new name>' }, AB, {
    run: async (ctx) => {
        const t = ctx.q.trim().slice(0, 60);
        if (!t) return ctx.reply(usage('✏️', 'Group Name', 'Type the new name.', `${PREFIX}setname My Group`));
        await ctx.sock.groupUpdateSubject(ctx.from, t);
        await ctx.reply(card('✏️', 'Group Name', [`✅ Changed to *${t}*`]));
    } }));
reg(Object.assign({ name: 'setdesc', aliases: ['setdescription', 'gdesc'], emoji: '📝', desc: 'change the group description', usage: '<text>' }, AB, {
    run: async (ctx) => {
        const t = ctx.q.trim().slice(0, 500);
        if (!t) return ctx.reply(usage('📝', 'Group Description', 'Type the new description.', `${PREFIX}setdesc Welcome to our group`));
        await ctx.sock.groupUpdateDescription(ctx.from, t);
        await ctx.reply(card('📝', 'Group Description', ['✅ Updated']));
    } }));
