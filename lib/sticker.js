'use strict';
// Zadashi - MD · sticker studio engine (text stickers, animated text, quote cards, pack info)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const M = require('./media');
const { BOT_NAME } = require('./config');

const FD = path.join(__dirname, '..', 'fonts');
const f = (n) => path.join(FD, n);
const FONTS = {
    outfit: ['Outfit Bold', f('Outfit-Bold.ttf')], erica: ['Erica One', f('EricaOne-Regular.ttf')], big: ['Big Shoulders Display Bold', f('BigShoulders-Bold.ttf')],
    gloock: ['Gloock', f('Gloock-Regular.ttf')], pixel: ['Silkscreen', f('Silkscreen-Regular.ttf')], brico: ['Bricolage Grotesque Bold', f('BricolageGrotesque-Bold.ttf')],
    poiret: ['Poiret One', f('PoiretOne-Regular.ttf')], si: ['FreeSerif Bold', f('FreeSerifBold.ttf')]
};
const SI = /[\u0D80-\u0DFF]/;

// every style: font, fill (solid or gradient), optional outline / shadow / glow / background card
const STYLES = [
    { id: 1, name: 'Neon', font: 'outfit', fill: ['#5ee1ff', '#4d8dff'], glow: '#4d8dff', outline: ['#0a1b4d', 5] },
    { id: 2, name: 'Fire', font: 'erica', fill: ['#fff176', '#ff9100', '#ff1744'], outline: ['#3b0a00', 6], shadow: ['#000000', 6] },
    { id: 3, name: 'Candy Box', font: 'outfit', fill: ['#ffffff'], bg: ['#7b2ff7', '#f107a3'], shadow: ['#3a0a5c', 4] },
    { id: 4, name: 'Comic', font: 'big', fill: ['#ffffff'], outline: ['#000000', 8], shadow: ['#000000', 5] },
    { id: 5, name: 'Gold', font: 'gloock', fill: ['#fff3b0', '#e0a800', '#8a5a00'], outline: ['#3d2600', 4], shadow: ['#000000', 5] },
    { id: 6, name: 'Retro Pixel', font: 'pixel', fill: ['#39ff14'], bg: ['#0b1a0b', '#112a11'], glow: '#39ff14' },
    { id: 7, name: 'Ice', font: 'brico', fill: ['#ffffff', '#8be9ff'], outline: ['#0b4f8a', 5], glow: '#8be9ff' },
    { id: 8, name: 'Elegant', font: 'poiret', fill: ['#ffffff'], shadow: ['#000000', 4], outline: ['#000000', 2] },
    { id: 9, name: 'Sunset', font: 'brico', fill: ['#ffd166', '#ef476f'], bg: ['#240046', '#5a189a'], shadow: ['#10002b', 4] },
    { id: 10, name: 'Dark Mode', font: 'outfit', fill: ['#ffffff'], bg: ['#0f1220', '#1c2140'], glow: '#4d8dff' }
];
const RAINBOW = ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#00e5ff', '#2979ff', '#d500f9', '#ff4081'];
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const png = (b) => sharp(b).png().toBuffer();
const clear = { r: 0, g: 0, b: 0, alpha: 0 };

async function textMask(text, fontKey, size) {
    const [font, file] = SI.test(text) ? FONTS.si : FONTS[fontKey];
    const safe = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const t = await sharp({ text: { text: `<span foreground="#ffffff">${safe}</span>`, font: size ? `${font} ${size}` : font, fontfile: file, width: 430, height: size ? undefined : 430, align: 'centre', rgba: true, wrap: 'word' } }).png().toBuffer();
    return sharp(t).extend({ top: 24, bottom: 24, left: 24, right: 24, background: clear }).png().toBuffer();
}
async function recolor(mask, color) { const [r, g, b] = hex(color); return sharp(mask).ensureAlpha().linear([0, 0, 0, 1], [r, g, b, 0]).png().toBuffer(); }
async function gradientFill(mask, colors) {
    const { width, height } = await sharp(mask).metadata();
    if (colors.length === 1) return recolor(mask, colors[0]);
    const stops = colors.map((c, i) => `<stop offset="${Math.round((i / (colors.length - 1)) * 100)}%" stop-color="${c}"/>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    return sharp(Buffer.from(svg)).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}
async function strokeLayer(mask, color, r) {
    const col = await recolor(mask, color), { width, height } = await sharp(mask).metadata(), L = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; L.push({ input: col, left: Math.round(Math.cos(a) * r), top: Math.round(Math.sin(a) * r) }); }
    // shifted copies can hang over the edge: use a canvas that is bigger, then crop back
    const pad = r + 2;
    const big = await sharp({ create: { width: width + pad * 2, height: height + pad * 2, channels: 4, background: clear } }).composite(L.map((x) => ({ input: x.input, left: x.left + pad, top: x.top + pad }))).png().toBuffer();
    return sharp(big).extract({ left: pad, top: pad, width, height }).png().toBuffer();
}
async function cardBg(colors) {
    const stops = colors.map((c, i) => `<stop offset="${i * 100}%" stop-color="${c}"/>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs><rect x="8" y="8" width="496" height="496" rx="72" fill="url(#g)"/></svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
}

// the finished still picture of a text style (512x512 png with transparent background)
async function renderPng(text, styleId, fillOverride) {
    const st = STYLES.find((s) => s.id === styleId) || STYLES[0];
    const mask = await textMask(text, st.font);
    const { width, height } = await sharp(mask).metadata();
    const left = Math.round((512 - width) / 2), top = Math.round((512 - height) / 2);
    const layers = [];
    if (st.bg) layers.push({ input: await cardBg(st.bg), left: 0, top: 0 });
    if (st.glow) layers.push({ input: await sharp(await recolor(mask, st.glow)).blur(14).png().toBuffer(), left, top }, { input: await sharp(await recolor(mask, st.glow)).blur(5).png().toBuffer(), left, top });
    if (st.shadow) layers.push({ input: await sharp(await recolor(mask, st.shadow[0])).blur(2).png().toBuffer(), left: left + 4, top: top + st.shadow[1] });
    if (st.outline) layers.push({ input: await strokeLayer(mask, st.outline[0], st.outline[1]), left, top });
    layers.push({ input: await gradientFill(mask, fillOverride ? [fillOverride] : st.fill), left, top });
    return sharp({ create: { width: 512, height: 512, channels: 4, background: clear } }).composite(layers).png().toBuffer();
}

// ---------- WhatsApp sticker pack info (EXIF chunk inside the webp)
function withExif(webp, pack, author) {
    try {
        const json = Buffer.from(JSON.stringify({ 'sticker-pack-id': 'zadashi-md-' + Date.now().toString(36), 'sticker-pack-name': pack || BOT_NAME, 'sticker-pack-publisher': author || 'Nimah Dev', emojis: ['🐉'] }), 'utf8');
        const head = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
        head.writeUInt32LE(json.length, 14);
        const exif = Buffer.concat([head, json]);
        const chunk = Buffer.alloc(8); chunk.write('EXIF', 0, 'ascii'); chunk.writeUInt32LE(exif.length, 4);
        const pad = exif.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
        if (webp.toString('ascii', 0, 4) !== 'RIFF' || webp.toString('ascii', 8, 12) !== 'WEBP') return webp;
        // keep every chunk except an old EXIF one
        const keep = []; let o = 12;
        while (o + 8 <= webp.length) {
            const id = webp.toString('ascii', o, o + 4), size = webp.readUInt32LE(o + 4), end = o + 8 + size + (size % 2);
            if (id !== 'EXIF') keep.push(Buffer.from(webp.subarray(o, Math.min(end, webp.length))));
            o = end;
        }
        if (!keep.length) return webp;
        if (keep[0].toString('ascii', 0, 4) === 'VP8X') { keep[0][8] |= 0x08; }
        else {
            const first = keep[0].toString('ascii', 0, 4);
            const alpha = keep.some((k) => k.toString('ascii', 0, 4) === 'ALPH') || (first === 'VP8L' && (keep[0][8 + 4] & 0x10));
            const vp8x = Buffer.alloc(18); vp8x.write('VP8X', 0, 'ascii'); vp8x.writeUInt32LE(10, 4); vp8x[8] = 0x08 | (alpha ? 0x10 : 0);
            vp8x.writeUIntLE(511, 12, 3); vp8x.writeUIntLE(511, 15, 3);
            keep.unshift(vp8x);
        }
        const body = Buffer.concat(keep);
        const out = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), body, chunk, exif, pad]);
        out.writeUInt32LE(out.length - 8, 4);
        return out;
    } catch (e) { return webp; }
}
const toWebp = async (pngBuf, pack, author) => withExif(await sharp(pngBuf).resize(512, 512, { fit: 'contain', background: clear }).webp({ quality: 85, alphaQuality: 100 }).toBuffer(), pack, author);

// ---------- animated rainbow text (frames → ffmpeg → animated webp)
async function renderAnimated(text, styleId, pack, author) {
    const st = STYLES.find((s) => s.id === styleId) || STYLES[0];
    const mask = await textMask(text, st.font);
    const { width, height } = await sharp(mask).metadata();
    const left = Math.round((512 - width) / 2), top = Math.round((512 - height) / 2);
    const dir = M.tmpName('_frames'); fs.mkdirSync(dir, { recursive: true });
    const outF = M.tmpName('.webp');
    try {
        const shadow = await sharp(await recolor(mask, '#000000')).blur(2).png().toBuffer();
        const outline = st.outline ? await strokeLayer(mask, st.outline[0], Math.min(st.outline[1], 5)) : null;
        for (let i = 0; i < RAINBOW.length; i++) {
            const L = [{ input: shadow, left: left + 3, top: top + 4 }];
            if (outline) L.push({ input: outline, left, top });
            L.push({ input: await recolor(mask, RAINBOW[i]), left, top });
            fs.writeFileSync(path.join(dir, `f${String(i).padStart(2, '0')}.png`), await sharp({ create: { width: 512, height: 512, channels: 4, background: clear } }).composite(L).png().toBuffer());
        }
        await M.runFfmpeg(['-y', '-framerate', '5', '-i', path.join(dir, 'f%02d.png'), '-vcodec', 'libwebp', '-lossless', '0', '-q:v', '70', '-loop', '0', '-preset', 'default', '-an', '-vsync', '0', outF]);
        return withExif(fs.readFileSync(outF), pack, author);
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ } M.rm(outF); }
}

// ---------- quote card ("chat bubble" sticker)
async function renderQuote(name, text) {
    const [bf, bfile] = SI.test(text) ? FONTS.si : FONTS.outfit;
    const t = (s, size, color) => sharp({ text: { text: `<span foreground="${color}">${String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`, font: `${bf} ${size}`, fontfile: bfile, width: 400, align: 'left', rgba: true, wrap: 'word' } }).png().toBuffer();
    const nm = await t(name, 17, RAINBOW[(name.length * 3) % RAINBOW.length]);
    let size = 30, body = await t(text.slice(0, 220), size, '#e9edef');
    let bm = await sharp(body).metadata(); while (bm.height > 300 && size > 14) { size -= 3; body = await t(text.slice(0, 220), size, '#e9edef'); bm = await sharp(body).metadata(); }
    const nmM = await sharp(nm).metadata();
    const w = Math.min(480, Math.max(bm.width, nmM.width) + 56), h = nmM.height + bm.height + 52;
    const bubble = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="26" fill="#1f2c34"/></svg>`);
    const card = await sharp({ create: { width: w, height: h, channels: 4, background: clear } }).composite([{ input: bubble }, { input: nm, left: 26, top: 18 }, { input: body, left: 26, top: 18 + nmM.height + 10 }]).png().toBuffer();
    return sharp({ create: { width: 512, height: 512, channels: 4, background: clear } }).composite([{ input: card, gravity: 'centre' }]).png().toBuffer();
}

// ---------- round sticker
async function circle(buf) {
    const base = await sharp(buf).resize(512, 512, { fit: 'cover' }).png().toBuffer();
    const mask = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="254" fill="#fff"/></svg>');
    return sharp(base).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

module.exports = { STYLES, renderPng, renderAnimated, renderQuote, circle, toWebp, withExif };
