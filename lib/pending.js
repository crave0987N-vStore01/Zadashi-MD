'use strict';
// Zadashi - MD · "reply with a number" memory (menu pages, search results)
const handlers = {};
const TTL = 15 * 60 * 1000;

function on(type, fn) { handlers[type] = fn; }
function remember(session, sent, data) {
    if (!sent || !sent.key || !sent.key.id) return;
    const m = session.pending || (session.pending = new Map());
    m.set(sent.key.id, Object.assign({ ts: Date.now() }, data));
    while (m.size > 150) m.delete(m.keys().next().value);
    session.lastPrompt = { id: sent.key.id, chat: sent.key.remoteJid, ts: Date.now() };
}
function lookup(session, id) {
    const m = session.pending; if (!m || !id) return null;
    const d = m.get(id); if (!d) return null;
    if (Date.now() - d.ts > TTL) { m.delete(id); return null; }
    return d;
}
// Called for a plain message that is only a number. Returns true when it was used.
async function handleReply(ctx, quotedId, text) {
    const d = lookup(ctx.session, quotedId);
    if (!d || !handlers[d.type]) return false;
    await handlers[d.type](ctx, d, text);
    return true;
}
module.exports = { on, remember, lookup, handleReply };
