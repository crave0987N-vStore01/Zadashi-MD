'use strict';
// Zadashi - MD · 🎉 FUN PACK — flip, dice, 8ball, ship, truth, dare, rate, pick, fancy, password
const crypto = require('crypto');
const { reg } = require('../lib/registry');
const { card, row, usage, trunc } = require('../lib/ui');
const wa = require('../lib/wa');
const { PREFIX } = require('../lib/config');

const rnd = (n) => crypto.randomInt(n);
const pickOf = (a) => a[rnd(a.length)];
const quotedText = (ctx) => { const q = wa.quotedOf(ctx.msg, ctx.from); return q ? q.text : ''; };
const bar = (p) => '█'.repeat(Math.round(p / 10)) + '░'.repeat(10 - Math.round(p / 10));

reg({ name: 'flip', aliases: ['coin', 'toss'], category: 'fun', emoji: '🪙', desc: 'flip a coin', usage: '',
    run: async (ctx) => { const h = rnd(2) === 0; await ctx.reply(card('🪙', 'Coin Flip', [row(h ? '🟡' : '⚪', 'Result', h ? 'HEADS' : 'TAILS')])); } });
reg({ name: 'dice', aliases: ['roll', 'd6'], category: 'fun', emoji: '🎲', desc: 'roll a dice (add sides: .dice 20)', usage: '[sides]',
    run: async (ctx) => { const n = Math.min(Math.max(parseInt(ctx.args[0], 10) || 6, 2), 1000); await ctx.reply(card('🎲', 'Dice Roll', [row('🎯', `d${n}`, String(1 + rnd(n)))])); } });
const BALL = ['Yes, definitely! ✅', 'It is certain 🔮', 'Most likely 👍', 'Signs point to yes ✨', 'Ask again later 🌫️', 'Cannot predict now 🤔', 'Don\'t count on it 😬', 'My answer is no ❌', 'Very doubtful 👎', 'Without a doubt 💯'];
reg({ name: '8ball', aliases: ['ball', 'ask', 'magic'], category: 'fun', emoji: '🎱', desc: 'ask the magic 8-ball', usage: '<question>',
    run: async (ctx) => {
        const q = ctx.q.trim() || quotedText(ctx);
        if (!q) return ctx.reply(usage('🎱', '8 Ball', 'Ask a yes / no question.', `${PREFIX}8ball Will I pass the exam?`));
        await ctx.reply(card('🎱', 'Magic 8 Ball', [row('❓', 'Question', trunc(q, 60)), row('🔮', 'Answer', pickOf(BALL))]));
    } });
reg({ name: 'ship', aliases: ['love', 'match'], category: 'fun', emoji: '💘', desc: 'love match % between two names', usage: '<name> & <name>',
    run: async (ctx) => {
        const parts = ctx.q.replace(/@\d+/g, (m) => m).split(/&|\+|\band\b| x | and /i).map((x) => x.trim()).filter(Boolean);
        if (parts.length < 2) return ctx.reply(usage('💘', 'Love Match', 'Two names with & between them.', `${PREFIX}ship Kasun & Nimali`));
        const seed = crypto.createHash('md5').update(parts.slice(0, 2).map((x) => x.toLowerCase()).sort().join('|')).digest();
        const p = seed[0] % 101;
        const msg = p > 85 ? 'Soulmates! 💍' : p > 65 ? 'Great couple 😍' : p > 40 ? 'Could work 🙂' : p > 20 ? 'Needs effort 😅' : 'Just friends 🙈';
        await ctx.reply(card('💘', 'Love Match', [`💑 ${trunc(parts[0], 20)}  ❤️  ${trunc(parts[1], 20)}`, '', `${bar(p)} *${p}%*`, msg]));
    } });
const TRUTH = ['What is your biggest fear?', 'What was your most embarrassing moment?', 'Who was your first crush?', 'What is a lie you told recently?', 'What is a secret nobody knows about you?', 'Which app do you waste the most time on?', 'What is the worst gift you ever got?', 'Who in this chat would you trust with your phone?', 'What is your most unusual talent?', 'What is the last thing you searched on Google?'];
const DARE = ['Send a voice note singing the chorus of your favourite song.', 'Change your WhatsApp status to "I love Zadashi MD" for 1 hour.', 'Send the 5th photo in your gallery (if it is safe!).', 'Talk only in emojis for the next 5 minutes.', 'Send a voice note saying a tongue twister 3 times fast.', 'Text your best friend "I miss you" right now.', 'Do 10 push-ups and send a video.', 'Write a 2-line poem about the person above you.'];
reg({ name: 'truth', aliases: ['tr'], category: 'fun', emoji: '🙊', desc: 'a random truth question', usage: '', run: async (ctx) => ctx.reply(card('🙊', 'Truth', [pickOf(TRUTH)])) });
reg({ name: 'dare', aliases: ['dr'], category: 'fun', emoji: '😈', desc: 'a random dare', usage: '', run: async (ctx) => ctx.reply(card('😈', 'Dare', [pickOf(DARE)])) });
reg({ name: 'rate', aliases: ['rating', 'howmuch'], category: 'fun', emoji: '📊', desc: 'rate anything out of 100', usage: '<thing>',
    run: async (ctx) => {
        const t = ctx.q.trim() || quotedText(ctx);
        if (!t) return ctx.reply(usage('📊', 'Rate', 'Type what to rate.', `${PREFIX}rate my singing`));
        const p = crypto.createHash('md5').update(t.toLowerCase()).digest()[0] % 101;
        await ctx.reply(card('📊', 'Rating', [row('📝', 'Thing', trunc(t, 40)), `${bar(p)} *${p}%*`]));
    } });
reg({ name: 'pick', aliases: ['choose', 'decide'], category: 'fun', emoji: '🎯', desc: 'pick one option (separate with , or |)', usage: 'a, b, c',
    run: async (ctx) => {
        const o = ctx.q.split(/[,|]/).map((x) => x.trim()).filter(Boolean);
        if (o.length < 2) return ctx.reply(usage('🎯', 'Pick', 'Give 2 or more options.', `${PREFIX}pick pizza, burger, rice`));
        await ctx.reply(card('🎯', 'I choose', [`✨ *${pickOf(o)}*`], `_from ${o.length} options_`));
    } });

// ---- fancy fonts
const up = (a, b) => (s) => [...s].map((c) => { const k = c.charCodeAt(0); return k >= 65 && k <= 90 ? String.fromCodePoint(a + k - 65) : k >= 97 && k <= 122 ? String.fromCodePoint(b + k - 97) : c; }).join('');
const FANCY = [['Bold', up(0x1D5D4, 0x1D5EE)], ['Bold Italic', up(0x1D63C, 0x1D656)], ['Script', up(0x1D4D0, 0x1D4EA)], ['Gothic', up(0x1D56C, 0x1D586)], ['Mono', up(0x1D670, 0x1D68A)], ['Circle', up(0x24B6, 0x24D0)],
    ['Small Caps', (s) => [...s.toLowerCase()].map((c) => ({ a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ' }[c] || c)).join('')],
    ['Wide', (s) => [...s].map((c) => { const k = c.charCodeAt(0); return k >= 33 && k <= 126 ? String.fromCodePoint(k + 0xFEE0) : c === ' ' ? '　' : c; }).join('')]];
reg({ name: 'fancy', aliases: ['font', 'fonts', 'style'], category: 'fun', emoji: '✨', desc: 'turn text into fancy fonts', usage: '<text>',
    run: async (ctx) => {
        const t = (ctx.q.trim() || quotedText(ctx)).slice(0, 60);
        if (!t) return ctx.reply(usage('✨', 'Fancy Fonts', 'Type the text.', `${PREFIX}fancy Zadashi MD`));
        await ctx.reply(card('✨', 'Fancy Fonts', FANCY.map(([n, f]) => `🔹 ${f(t)}`)));
    } });

// ---- password (tools)
reg({ name: 'password', aliases: ['pass', 'genpass', 'passgen'], category: 'tools', emoji: '🔐', desc: 'strong random password (e.g. .password 16)', usage: '[length]',
    run: async (ctx) => {
        const n = Math.min(Math.max(parseInt(ctx.args[0], 10) || 14, 8), 40);
        const set = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';
        let p = ''; for (let i = 0; i < n; i++) p += set[rnd(set.length)];
        await ctx.reply(card('🔐', 'Password', ['```' + p + '```', row('📏', 'Length', n)], '🔒 _Generated here and not saved anywhere_'));
    } });
