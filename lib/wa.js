'use strict';
// Zadashi - MD · WhatsApp message helpers
const { digits } = require('./config');

const jidDigits = (j) => digits(String(j || '').split('@')[0].split(':')[0]);

function unwrap(message) {
    let m = message || {};
    for (let i = 0; i < 5; i++) {
        if (m.ephemeralMessage) m = m.ephemeralMessage.message || {};
        else if (m.viewOnceMessage) m = m.viewOnceMessage.message || {};
        else if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message || {};
        else if (m.viewOnceMessageV2Extension) m = m.viewOnceMessageV2Extension.message || {};
        else if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message || {};
        else if (m.editedMessage) m = (m.editedMessage.message && m.editedMessage.message.protocolMessage && m.editedMessage.message.protocolMessage.editedMessage) || {};
        else break;
    }
    return m;
}
function textOf(inner) {
    return inner.conversation || (inner.extendedTextMessage && inner.extendedTextMessage.text) ||
        (inner.imageMessage && inner.imageMessage.caption) || (inner.videoMessage && inner.videoMessage.caption) ||
        (inner.documentMessage && inner.documentMessage.caption) || '';
}
function contextOf(inner) {
    for (const k of Object.keys(inner)) { const v = inner[k]; if (v && typeof v === 'object' && v.contextInfo) return v.contextInfo; }
    return null;
}
// the message this message replies to: { message, key, text, sender }
function quotedOf(msg, from) {
    const inner = unwrap(msg.message), ci = contextOf(inner);
    if (!ci || !ci.quotedMessage) return null;
    const qm = unwrap(ci.quotedMessage);
    return { message: ci.quotedMessage, inner: qm, text: textOf(qm), sender: ci.participant || '', id: ci.stanzaId, key: { remoteJid: from, id: ci.stanzaId, participant: ci.participant, fromMe: false } };
}
// finds a media message of one of the types, in the message itself or in the message it replies to
function findMedia(msg, from, types) {
    const inner = unwrap(msg.message);
    for (const t of types) if (inner[t]) return { type: t, msg: { key: msg.key, message: msg.message } };
    const q = quotedOf(msg, from);
    if (q) for (const t of types) if (q.inner[t]) return { type: t, msg: { key: q.key, message: q.message } };
    return null;
}
function mentionsOf(msg) {
    const ci = contextOf(unwrap(msg.message));
    return (ci && ci.mentionedJid) || [];
}

module.exports = { jidDigits, unwrap, textOf, contextOf, quotedOf, findMedia, mentionsOf };

// downloads the bytes of an image / video / sticker / document message
async function download(sock, m) {
    const { downloadMediaMessage } = require('@whiskeysockets/baileys');
    const pino = require('pino');
    return downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
}
module.exports.download = download;
