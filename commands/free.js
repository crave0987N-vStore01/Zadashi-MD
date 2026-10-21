'use strict';
// Zadashi - MD · 🆓 FREE hub — free tools, VPNs, learning and apps (all links are official free services)
const { reg } = require('../lib/registry');
const { card, row } = require('../lib/ui');
const { PREFIX } = require('../lib/config');

const TOPICS = {
    vpn: { emoji: '🛡️', title: 'Free VPN', rows: [
        row('🔷', 'Proton VPN', 'free, no ads, no data cap · protonvpn.com'),
        row('🌐', 'Cloudflare WARP', 'free · 1.1.1.1 app'),
        row('🧅', 'Psiphon', 'free · psiphon.ca'),
        row('🔒', 'Windscribe', '10 GB free / month · windscribe.com')
    ] },
    learn: { emoji: '🎓', title: 'Free Learning', rows: [
        row('💻', 'freeCodeCamp', 'web, data, Python · freecodecamp.org'),
        row('📚', 'Khan Academy', 'school & college · khanacademy.org'),
        row('🎬', 'CS50 (Harvard)', 'computer science · cs50.harvard.edu'),
        row('🧠', 'Coursera / edX', 'audit courses free'),
        row('📈', 'Google Skillshop', 'free marketing & analytics')
    ] },
    design: { emoji: '🎨', title: 'Free Design', rows: [
        row('🖌️', 'Canva', 'posters, logos, videos · canva.com'),
        row('🧼', 'remove.bg', 'remove picture backgrounds'),
        row('🎞️', 'CapCut', 'free video editor'),
        row('🔤', 'Google Fonts', 'fonts.google.com'),
        row('🖼️', 'Unsplash / Pexels', 'free photos')
    ] },
    dev: { emoji: '👨‍💻', title: 'Free Dev Tools', rows: [
        row('🐙', 'GitHub', 'code hosting · github.com'),
        row('🚄', 'Railway / Render', 'free bot hosting tiers'),
        row('🧪', 'VS Code', 'free code editor'),
        row('🌩️', 'Cloudflare', 'free DNS & hosting for sites'),
        row('🗄️', 'MongoDB Atlas / Supabase', 'free databases')
    ] }
};
const ALIAS = { vpns: 'vpn', study: 'learn', course: 'learn', courses: 'learn', edu: 'learn', canva: 'design', graphic: 'design', code: 'dev', host: 'dev', hosting: 'dev' };

reg({ name: 'free', aliases: ['freebies', 'freestuff'], category: 'tools', emoji: '🆓', desc: 'free tools: vpn, learn, design, dev', usage: '[vpn | learn | design | dev]',
    run: async (ctx) => {
        let t = (ctx.args[0] || '').toLowerCase(); t = ALIAS[t] || t;
        if (TOPICS[t]) { const x = TOPICS[t]; return ctx.reply(card(x.emoji, x.title, x.rows, `💡 _${PREFIX}free  ·  all topics_`)); }
        await ctx.reply(card('🆓', 'Free Zone', [
            '🎁 Everything below is free to use.', '',
            row('🛡️', PREFIX + 'free vpn', 'free VPN apps'),
            row('🎓', PREFIX + 'free learn', 'free courses'),
            row('🎨', PREFIX + 'free design', 'free design tools'),
            row('👨‍💻', PREFIX + 'free dev', 'free dev & hosting'), '',
            '✅ This bot needs no API keys and costs nothing.'
        ], `💡 _Example: ${PREFIX}free vpn_`));
    } });
