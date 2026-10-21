'use strict';
// Zadashi - MD · command registry (all commands)
const commands = new Map(); // name or alias -> definition
const list = [];            // unique definitions, in menu order

const CATEGORIES = [
    { id: 'download', emoji: '📥', title: 'Download' },
    { id: 'search', emoji: '🔎', title: 'Search' },
    { id: 'tools', emoji: '🛠️', title: 'Tools' },
    { id: 'sticker', emoji: '🎨', title: 'Sticker' },
    { id: 'fun', emoji: '🎉', title: 'Fun' },
    { id: 'group', emoji: '👥', title: 'Group' },
    { id: 'owner', emoji: '👑', title: 'Owner' },
    { id: 'main', emoji: '🏠', title: 'Main' }
];
const NUM = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

function reg(def) {
    if (!def || !def.name || typeof def.run !== 'function') throw new Error('bad command definition');
    if (commands.has(def.name)) throw new Error('duplicate command: ' + def.name);
    list.push(def);
    commands.set(def.name, def);
    for (const a of def.aliases || []) if (!commands.has(a)) commands.set(a, def);
}

module.exports = { commands, list, reg, CATEGORIES, NUM };
