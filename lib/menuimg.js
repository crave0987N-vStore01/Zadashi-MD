'use strict';
// Zadashi - MD · menu banner picture (logo + live info strip). Falls back to the plain logo if anything fails.
const path = require('path');
const sharp = require('sharp');
const { PUBLIC_DIR, BOT_NAME, VERSION } = require('./config');

const FD = path.join(__dirname, '..', 'fonts');
const OUTFIT = ['Outfit Bold', path.join(FD, 'Outfit-Bold.ttf')];
const SI = /[\u0D80-\u0DFF]/;
const W = 1280, H = 720;
let base = null;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (s, size, color, opts) => {
    const [font, file] = SI.test(s) ? ['FreeSerif Bold', path.join(FD, 'FreeSerifBold.ttf')] : OUTFIT;
    return sharp({ text: Object.assign({ text: `<span foreground="${color}">${esc(s)}</span>`, font: `${font} ${size}`, fontfile: file, rgba: true }, opts || {}) }).png().toBuffer();
};
async function getBase() {
    if (base) return base;
    base = await sharp(path.join(PUBLIC_DIR, 'logo.jpg')).resize(W, H, { fit: 'cover' }).png().toBuffer();
    return base;
}

// info = { name, greeting, mode, commands, uptime, time }
async function menuImage(info) {
    const L = [];
    const shade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>
<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#030712" stop-opacity=".85"/><stop offset="1" stop-color="#030712" stop-opacity="0"/></linearGradient>
<linearGradient id="b" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#030712" stop-opacity=".95"/><stop offset="1" stop-color="#030712" stop-opacity="0"/></linearGradient></defs>
<rect width="${W}" height="190" fill="url(#t)"/><rect y="${H - 230}" width="${W}" height="230" fill="url(#b)"/>
<rect x="40" y="38" width="170" height="46" rx="23" fill="#4d8dff" fill-opacity=".92"/>
<rect x="${W - 250}" y="38" width="210" height="46" rx="23" fill="#0b1226" fill-opacity=".75" stroke="#4d8dff" stroke-opacity=".6"/>
${[0, 1, 2, 3].map((i) => `<rect x="${40 + i * 300}" y="${H - 132}" width="276" height="96" rx="22" fill="#0b1226" fill-opacity=".72" stroke="#5ee1ff" stroke-opacity=".35" stroke-width="1.5"/>`).join('')}
</svg>`);
    L.push({ input: shade, left: 0, top: 0 });
    L.push({ input: await text(`V${VERSION} · ONLINE`, 17, '#ffffff'), left: 62, top: 49 });
    L.push({ input: await text(info.time, 17, '#cfe6ff'), left: W - 232, top: 49 });
    L.push({ input: await text(`${info.greeting}, ${info.name}`, 30, '#ffffff', { width: 760 }), left: 40, top: 108 });
    const cells = [['COMMANDS', String(info.commands)], ['MODE', info.mode], ['UPTIME', info.uptime], ['PREFIX', info.prefix || '.']];
    for (let i = 0; i < cells.length; i++) {
        L.push({ input: await text(cells[i][0], 13, '#8fb4ff', { width: 230 }), left: 64 + i * 300, top: H - 118 });
        L.push({ input: await text(cells[i][1], 30, '#ffffff', { width: 230 }), left: 64 + i * 300, top: H - 88 });
    }
    return sharp(await getBase()).composite(L).jpeg({ quality: 88 }).toBuffer();
}
module.exports = { menuImage };
