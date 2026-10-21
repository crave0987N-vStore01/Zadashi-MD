'use strict';
// Zadashi - MD · 🎨 STICKER STUDIO — ttp, attp, qc, take, circle (+ sticker / toimg live in tools.js)
const { reg } = require('../lib/registry');
const { card, row, usage, trunc } = require('../lib/ui');
const M = require('../lib/media');
const wa = require('../lib/wa');
const ST = new Proxy({}, { get: (_, k) => require('../lib/sticker')[k] }); // sharp loads only when a sticker is made
const { PREFIX, BOT_NAME } = require('../lib/config');

const guard = (emoji, title, fn) => async (ctx) => {
    try { await fn(ctx); }
    catch (e) { console.log(`.${ctx.command} failed:`, String((e && e.message) || e).slice(0, 200)); await ctx.reply(card(emoji, title, ['❌ ' + (e && e.code ? M.friendlyError(e) : 'Could not make the sticker. Try shorter text.')])); }
};
const quotedText = (ctx) => { const q = wa.quotedOf(ctx.msg, ctx.from); return q ? q.text : ''; };
const authorOf = (ctx) => trunc(ctx.pushName || 'Nimah Dev', 24);
// ".ttp 3 hello" → style 3.  ".ttp hello" → random pretty style
function parse(ctx) {
    let args = ctx.args.slice(), style = 0;
    if (args.length && /^\d{1,2}$/.test(args[0]) && ST.STYLES.some((s) => s.id === +args[0])) style = +args.shift();
    const text = (args.join(' ') || quotedText(ctx)).trim().slice(0, 120);
    return { style, text };
}
const gallery = (cmd) => card('🎨', 'Text Sticker Styles', ST.STYLES.map((s) => row('🔹', String(s.id).padStart(2, '0') + ' · ' + s.name, `${PREFIX}${cmd} ${s.id} Hello`)), `💡 _${PREFIX}${cmd} <text>  ·  ${PREFIX}${cmd} <style> <text>_`);

reg({ name: 'ttp', aliases: ['texttosticker', 'textsticker', 'tsticker'], category: 'sticker', emoji: '🔤', desc: 'text to sticker — 10 pro styles, Sinhala works too', usage: '[style 1-10] <text>',
    run: guard('🔤', 'Text Sticker', async (ctx) => {
        const { style, text } = parse(ctx);
        if (!text) return ctx.reply(gallery('ttp'));
        await ctx.react('🔤');
        const id = style || 1 + Math.floor(Math.random() * ST.STYLES.length);
        await ctx.send({ sticker: await ST.toWebp(await ST.renderPng(text, id), BOT_NAME, authorOf(ctx)) });
    }) });
reg({ name: 'attp', aliases: ['animtext', 'rainbow', 'blinktext'], category: 'sticker', emoji: '🌈', desc: 'animated rainbow text sticker', usage: '[style 1-10] <text>',
    run: guard('🌈', 'Animated Text', async (ctx) => {
        const { style, text } = parse(ctx);
        if (!text) return ctx.reply(usage('🌈', 'Animated Text', 'Type the text. A blinking rainbow sticker is made.', `${PREFIX}attp Zadashi MD   ·   ${PREFIX}attp 4 Hello`));
        await ctx.react('🌈');
        await ctx.send({ sticker: await ST.renderAnimated(text.slice(0, 60), style || 4, BOT_NAME, authorOf(ctx)) });
    }) });
reg({ name: 'qc', aliases: ['quotly', 'quotesticker', 'qs'], category: 'sticker', emoji: '💬', desc: 'turn a replied message into a quote sticker', usage: '(reply) [name]',
    run: guard('💬', 'Quote Sticker', async (ctx) => {
        const q = wa.quotedOf(ctx.msg, ctx.from);
        const text = (q && q.text) || ctx.q.trim();
        if (!text) return ctx.reply(usage('💬', 'Quote Sticker', 'Reply to a text message with the command.', `${PREFIX}qc`));
        await ctx.react('💬');
        const name = (q && q.text && ctx.q.trim()) || (q && q.sender ? '+' + wa.jidDigits(q.sender) : ctx.pushName || 'Zadashi MD');
        await ctx.send({ sticker: await ST.toWebp(await ST.renderQuote(trunc(name, 28), text), BOT_NAME, authorOf(ctx)) });
    }) });
reg({ name: 'take', aliases: ['steal', 'wm', 'rename'], category: 'sticker', emoji: '🏷️', desc: 'change the pack name & author of a sticker', usage: '(reply) <pack> | <author>',
    run: guard('🏷️', 'Sticker Pack', async (ctx) => {
        const found = wa.findMedia(ctx.msg, ctx.from, ['stickerMessage']);
        if (!found) return ctx.reply(usage('🏷️', 'Sticker Pack', 'Reply to a sticker. Optional: pack | author.', `${PREFIX}take My Pack | Kasun`));
        const [pack, author] = ctx.q.split('|').map((x) => x.trim());
        await ctx.react('🏷️');
        await ctx.send({ sticker: ST.withExif(await wa.download(ctx.sock, found.msg), trunc(pack || BOT_NAME, 30), trunc(author || authorOf(ctx), 30)) });
    }) });
reg({ name: 'circle', aliases: ['round', 'roundsticker'], category: 'sticker', emoji: '⭕', desc: 'round (circle) sticker from a picture', usage: '(reply)',
    run: guard('⭕', 'Round Sticker', async (ctx) => {
        const found = wa.findMedia(ctx.msg, ctx.from, ['imageMessage']);
        if (!found) return ctx.reply(usage('⭕', 'Round Sticker', 'Reply to a picture with the command.', `${PREFIX}circle`));
        await ctx.react('⭕');
        await ctx.send({ sticker: await ST.toWebp(await ST.circle(await wa.download(ctx.sock, found.msg)), BOT_NAME, authorOf(ctx)) });
    }) });
