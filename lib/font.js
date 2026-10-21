'use strict';
// Zadashi - MD · fancy fonts for every bot message (bold-italic sans + monospace)
const UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', LO = 'abcdefghijklmnopqrstuvwxyz';
const map = (s, upBase, loBase) => Array.from(String(s)).map((ch) => {
    let i = UP.indexOf(ch); if (i >= 0) return String.fromCodePoint(upBase + i);
    i = LO.indexOf(ch); if (i >= 0) return String.fromCodePoint(loBase + i);
    return ch;
}).join('');
const boldItalic = (s) => map(s, 0x1D63C, 0x1D656);   // 𝘿𝙙𝙨
const mono = (s) => map(s, 0x1D670, 0x1D68A);          // 𝙳𝚍𝚜

// pieces that must stay exactly as typed: `code`, links, @mentions, e-mails, anything with a slash
const KEEP = /(```[\s\S]*?```|`[^`\n]*`|https?:\/\/\S+|\S*\/\S*|@\d+|[\w.+-]+@[\w.-]+)/g;
function styleSegment(t) {
    t = t.replace(/\*([^*\n]+)\*/g, (m, a) => boldItalic(a));                       // *bold*  -> bold italic
    t = t.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:])/g, (m, p, a) => p + mono(a)); // _italic_ -> mono
    return mono(t);                                                                    // the rest -> mono
}
function stylize(text) {
    if (typeof text !== 'string' || !text) return text;
    return text.split(KEEP).map((p, i) => (i % 2 ? p : styleSegment(p))).join('');
}
function stylizeContent(c) {
    if (!c || typeof c !== 'object') return c;
    if (typeof c.text === 'string') c = Object.assign({}, c, { text: stylize(c.text) });
    if (typeof c.caption === 'string') c = Object.assign({}, c, { caption: stylize(c.caption) });
    return c;
}
module.exports = { boldItalic, mono, stylize, stylizeContent };
