'use strict';
// Zadashi - MD · 🛠️ TOOLS — qr, tts, shorten, calc, ss, topdf
const fs = require('fs');
const axios = require('axios');
const QRCode = require('qrcode');
const { reg } = require('../lib/registry');
const { card, row, usage, fail, trunc } = require('../lib/ui');
const M = require('../lib/media');
const wa = require('../lib/wa');
const { PREFIX, BOT_NAME } = require('../lib/config');

const enc = encodeURIComponent;
const tryRequire = (n) => { try { return require(n); } catch (e) { return null; } };
const guard = (emoji, title, fn) => async (ctx) => {
    try { await fn(ctx); }
    catch (e) { console.log(`.${ctx.command} failed:`, String((e && e.message) || e).slice(0, 200)); await ctx.reply(card(emoji, title, ['❌ ' + (e && e.code ? M.friendlyError(e) : 'Something went wrong. Please try again.')])); }
};
const quotedText = (ctx) => { const q = wa.quotedOf(ctx.msg, ctx.from); return q ? q.text : ''; };

// ================================================================= 🎨 sticker / toimg
reg({ name: 'sticker', aliases: ['s', 'stiker', 'st'], category: 'sticker', emoji: '🪄', desc: 'image / short video to sticker (reply or caption)', usage: '(reply) [pack | author]',
    run: guard('🎨', 'Sticker', async (ctx) => {
        const found = wa.findMedia(ctx.msg, ctx.from, ['imageMessage', 'videoMessage', 'stickerMessage']);
        if (!found) return ctx.reply(usage('🎨', 'Sticker', 'Reply to an image or a short video with the command.', `${PREFIX}sticker`));
        await ctx.react('🎨');
        const buf = await wa.download(ctx.sock, found.msg);
        const ST = require('../lib/sticker'); const [pk, au] = ctx.q.split('|').map((x) => x.trim());
        const pack = trunc(pk || BOT_NAME, 30), author = trunc(au || ctx.pushName || 'Nimah Dev', 30);
        if (found.type === 'stickerMessage') return void await ctx.send({ sticker: ST.withExif(buf, pack, author) });
        let webp;
        if (found.type === 'imageMessage') {
            const sharp = tryRequire('sharp');
            if (sharp) webp = await sharp(buf).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 80 }).toBuffer();
        }
        if (!webp) { // video / gif (or no sharp): ffmpeg makes the (animated) sticker
            if (!M.ffmpegPath()) throw new Error('no ffmpeg');
            const inF = M.tmpName(found.type === 'videoMessage' ? '.mp4' : '.img'), outF = M.tmpName('.webp');
            try {
                fs.writeFileSync(inF, buf);
                const r = await M.runFfmpeg(['-y', '-i', inF, '-t', '7', '-vf', 'fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', '-c:v', 'libwebp', '-lossless', '0', '-q:v', '45', '-loop', '0', '-an', '-vsync', '0', outF], 90000);
                if (!r.ok || !fs.existsSync(outF)) throw new Error('convert failed');
                webp = fs.readFileSync(outF);
            } finally { M.rm(inF, outF); }
        }
        await ctx.send({ sticker: ST.withExif(webp, pack, author) });
    }) });
reg({ name: 'toimg', aliases: ['toimage', 'stickertoimg'], category: 'sticker', emoji: '🖼️', desc: 'sticker to picture (reply)', usage: '(reply)',
    run: guard('🖼️', 'Sticker → Image', async (ctx) => {
        const found = wa.findMedia(ctx.msg, ctx.from, ['stickerMessage']);
        if (!found) return ctx.reply(usage('🖼️', 'Sticker → Image', 'Reply to a sticker with the command.', `${PREFIX}toimg`));
        const sharp = tryRequire('sharp');
        if (!sharp) throw new Error('no sharp');
        const png = await sharp(await wa.download(ctx.sock, found.msg)).png().toBuffer();
        await ctx.send({ image: png, mimetype: 'image/png', caption: card('🖼️', 'Sticker → Image', ['✅ Converted']) });
    }) });

// ================================================================= 🔳 QR
reg({ name: 'qr', aliases: ['qrcode', 'makeqr'], category: 'tools', emoji: '🔳', desc: 'make a QR code from any text / link', usage: '<text>',
    run: guard('🔳', 'QR Code', async (ctx) => {
        const text = ctx.q.trim() || quotedText(ctx);
        if (!text) return ctx.reply(usage('🔳', 'QR Code', 'Type the text or link to turn into a QR code.', `${PREFIX}qr https://wa.me/94776017681`));
        const png = await QRCode.toBuffer(text.slice(0, 900), { width: 600, margin: 2, color: { dark: '#07153d', light: '#ffffff' } });
        await ctx.send({ image: png, caption: card('🔳', 'QR Code', [row('📝', 'Text', trunc(text, 60))]) });
    }) });

// ================================================================= 🗣️ TTS
reg({ name: 'tts', aliases: ['say', 'speak'], category: 'tools', emoji: '🗣️', desc: 'text to speech (add a language code: en, si, ta, hi ...)', usage: '[lang] <text>',
    run: guard('🗣️', 'Text to Speech', async (ctx) => {
        let words = ctx.args.slice(), lang = '';
        if (words.length > 1 && /^(en|si|ta|hi|ar|bn|de|es|fr|id|it|ja|ko|ml|mr|ms|ne|pt|ru|te|th|tr|ur|zh|zh-CN|en-US|en-GB)$/.test(words[0])) lang = words.shift();
        const text = (words.join(' ') || quotedText(ctx)).trim().slice(0, 190);
        if (!text) return ctx.reply(usage('🗣️', 'Text to Speech', 'Type the text. Add a language code first if needed (default: English, Sinhala is detected).', `${PREFIX}tts si ආයුබෝවන්   ·   ${PREFIX}tts hello world`));
        if (!lang) lang = /[\u0D80-\u0DFF]/.test(text) ? 'si' : /[\u0B80-\u0BFF]/.test(text) ? 'ta' : 'en';
        await ctx.react('🗣️');
        const buf = await M.downloadBuffer(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${enc(lang)}&q=${enc(text)}`, 5 * 1048576);
        await ctx.send({ audio: buf, mimetype: 'audio/mpeg', ptt: false });
    }) });

// ================================================================= 🔗 shorten
reg({ name: 'shorten', aliases: ['short', 'tiny', 'shorturl'], category: 'tools', emoji: '✂️', desc: 'make a short link', usage: '<link>',
    run: guard('🔗', 'Short Link', async (ctx) => {
        const url = M.pickUrl(ctx.q, quotedText(ctx));
        if (!url) return ctx.reply(usage('🔗', 'Short Link', 'Send the long link.', `${PREFIX}shorten https://example.com/very/long/link`));
        let out = '';
        for (const api of [`https://tinyurl.com/api-create.php?url=${enc(url)}`, `https://is.gd/create.php?format=simple&url=${enc(url)}`, `https://v.gd/create.php?format=simple&url=${enc(url)}`]) {
            try { const t = String(await M.getText(api, { timeout: 15000 })).trim(); if (/^https?:\/\//.test(t)) { out = t; break; } } catch (e) { /* next service */ }
        }
        if (!out) throw new Error('all failed');
        await ctx.reply(card('🔗', 'Short Link', [row('📎', 'Original', trunc(url, 50)), row('✂️', 'Short', out)]));
    }) });

// ================================================================= 🧮 calc (own safe parser, no eval)
function calc(expr) {
    const s = String(expr).toLowerCase().replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '').replace(/\s+/g, '');
    if (!s || s.length > 120 || /[^0-9a-z+\-*/%^().]/.test(s)) throw new Error('bad');
    let i = 0;
    const fns = { sqrt: Math.sqrt, abs: Math.abs, sin: (x) => Math.sin(x * Math.PI / 180), cos: (x) => Math.cos(x * Math.PI / 180), tan: (x) => Math.tan(x * Math.PI / 180), log: Math.log10, ln: Math.log, round: Math.round, floor: Math.floor, ceil: Math.ceil };
    const consts = { pi: Math.PI, e: Math.E };
    const expect = (c) => { if (s[i] !== c) throw new Error('bad'); i++; };
    function primary() {
        if (s[i] === '(') { i++; const v = expr0(); expect(')'); return v; }
        let m = /^\d*\.?\d+(e[+-]?\d+)?/.exec(s.slice(i));
        if (m) { i += m[0].length; return parseFloat(m[0]); }
        m = /^[a-z]+/.exec(s.slice(i));
        if (m) {
            i += m[0].length;
            if (consts[m[0]] !== undefined && s[i] !== '(') return consts[m[0]];
            if (fns[m[0]] && s[i] === '(') { i++; const v = expr0(); expect(')'); return fns[m[0]](v); }
        }
        throw new Error('bad');
    }
    function unary() { if (s[i] === '-') { i++; return -unary(); } if (s[i] === '+') { i++; return unary(); } return power(); }
    function power() { const b = primary(); if (s[i] === '^') { i++; return Math.pow(b, unary()); } return b; }
    function term() {
        let v = unary();
        while (s[i] === '*' || s[i] === '/' || s[i] === '%') { const o = s[i++]; const r = unary(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; }
        return v;
    }
    function expr0() { let v = term(); while (s[i] === '+' || s[i] === '-') { const o = s[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
    const out = expr0();
    if (i !== s.length || !isFinite(out)) throw new Error('bad');
    return out;
}
reg({ name: 'calc', aliases: ['calculate', 'math', 'cal'], category: 'tools', emoji: '🧮', desc: 'calculator  (+ - * / % ^ sqrt sin cos ...)', usage: '<math>',
    run: async (ctx) => {
        const e = ctx.q.trim();
        if (!e) return ctx.reply(usage('🧮', 'Calculator', 'Type a calculation. Supports + - * / % ^ ( ) sqrt sin cos tan log ln pi.', `${PREFIX}calc (25+5)*4/2   ·   ${PREFIX}calc sqrt(144)`));
        try { const v = calc(e); await ctx.reply(card('🧮', 'Calculator', [row('📝', 'Input', trunc(e, 60)), row('✅', 'Answer', '*' + (Math.abs(v) < 1e15 ? String(Math.round(v * 1e10) / 1e10) : v.toExponential(6)) + '*')])); }
        catch (err) { await ctx.reply(fail('I could not read that calculation.')); }
    } });

// ================================================================= 📸 screenshot
reg({ name: 'ss', aliases: ['screenshot', 'webss'], category: 'tools', emoji: '📸', desc: 'screenshot of a website', usage: '<link>',
    run: guard('📸', 'Screenshot', async (ctx) => {
        let url = M.pickUrl(ctx.q, quotedText(ctx));
        if (!url && /^[\w-]+(\.[\w-]+)+/.test(ctx.q.trim())) url = 'https://' + ctx.q.trim();
        if (!url) return ctx.reply(usage('📸', 'Screenshot', 'Send a website link.', `${PREFIX}ss https://www.wikipedia.org`));
        M.checkUrl(url);
        await ctx.react('📸');
        let img;
        for (const api of [`https://image.thum.io/get/width/1280/crop/760/noanimate/${url}`, `https://s0.wp.com/mshots/v1/${enc(url)}?w=1280&h=760`]) {
            try { const b = await M.downloadBuffer(api, 8 * 1048576); if (b.length > 4000) { img = b; break; } } catch (e) { /* next service */ }
        }
        if (!img) throw new Error('no screenshot');
        await ctx.send({ image: img, caption: card('📸', 'Screenshot', [row('🌐', 'Site', trunc(url, 60))]) });
    }) });

// ================================================================= 📄 image → PDF
reg({ name: 'topdf', aliases: ['imgtopdf', 'pdf', 'img2pdf'], category: 'tools', emoji: '📄', desc: 'picture to PDF (reply to an image)', usage: '(reply)',
    run: guard('📄', 'Image → PDF', async (ctx) => {
        const found = wa.findMedia(ctx.msg, ctx.from, ['imageMessage']);
        if (!found) return ctx.reply(usage('📄', 'Image → PDF', 'Reply to a picture (or send a picture with this command as its caption).', `${PREFIX}topdf`));
        await ctx.react('📄');
        const { PDFDocument } = require('pdf-lib');
        let buf = await wa.download(ctx.sock, found.msg);
        const isJpg = buf[0] === 0xFF && buf[1] === 0xD8, isPng = buf[0] === 0x89 && buf[1] === 0x50;
        if (!isJpg && !isPng) { const sharp = tryRequire('sharp'); if (!sharp) throw new Error('format'); buf = await sharp(buf).jpeg({ quality: 90 }).toBuffer(); }
        const pdf = await PDFDocument.create();
        const img = (isPng) ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const page = pdf.addPage([img.width * k, img.height * k]);
        page.drawImage(img, { x: 0, y: 0, width: img.width * k, height: img.height * k });
        const bytes = Buffer.from(await pdf.save());
        await ctx.send({ document: bytes, mimetype: 'application/pdf', fileName: 'Zadashi-MD.pdf', caption: card('📄', 'Image → PDF', ['✅ Your PDF is ready']) });
    }) });
