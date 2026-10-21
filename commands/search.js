'use strict';
// Zadashi - MD · 🔎 SEARCH (4) and 🎭 FUN (3) — free, key-less public services
const { reg } = require('../lib/registry');
const { card, row, usage, fail, trunc } = require('../lib/ui');
const M = require('../lib/media');
const { quotedOf } = require('../lib/wa');
const { PREFIX } = require('../lib/config');

const enc = encodeURIComponent;
const guard = (emoji, title, fn) => async (ctx) => {
    try { await fn(ctx); }
    catch (e) {
        console.log(`.${ctx.command} failed:`, (e && e.response && e.response.status) || (e && e.message));
        const st = e && e.response && e.response.status;
        await ctx.reply(card(emoji, title, [st === 404 ? '🔍 Nothing was found for that.' : '⚠️ The service did not answer. Please try again shortly.']));
    }
};

// ================================================================= 🔎 SEARCH
reg({ name: 'lyrics', aliases: ['lyric', 'gee'], category: 'search', emoji: '📜', desc: 'find the lyrics page of a song', usage: '<song name>',
    run: guard('📜', 'Lyrics', async (ctx) => {
        const q = ctx.q.trim();
        if (!q) return ctx.reply(usage('📜', 'Lyrics', 'Type a song name (and the artist for better results).', `${PREFIX}lyrics mage adara landu`));
        await ctx.react('🔎');
        const j = await M.getJson('https://lrclib.net/api/search?q=' + enc(q));
        const items = (Array.isArray(j) ? j : []).filter((x) => x && x.trackName).slice(0, 5);
        if (!items.length) return ctx.reply(card('📜', 'Lyrics', [`🔍 Nothing found for "${trunc(q, 40)}".`], '💡 _Try the song name in English letters._'));
        const n = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
        const rows = [];
        items.forEach((t, i) => {
            rows.push(`${n[i]} *${trunc(t.trackName, 50)}*`);
            rows.push(`    🎤 ${trunc(t.artistName || '—', 30)}${t.albumName ? '  ·  💿 ' + trunc(t.albumName, 24) : ''}`);
            rows.push(`    🔗 https://www.google.com/search?q=${enc((t.artistName || '') + ' ' + t.trackName + ' lyrics')}`);
            rows.push('');
        });
        await ctx.reply(card('📜', 'Lyrics', rows, '💡 _Open a link to read the full lyrics._'));
    }) });

reg({ name: 'wiki', aliases: ['wikipedia', 'w'], category: 'search', emoji: '📚', desc: 'Wikipedia summary (add a language code: si, ta ...)', usage: '[lang] <topic>',
    run: guard('📚', 'Wikipedia', async (ctx) => {
        let words = ctx.args.slice(); let lang = 'en';
        if (words.length > 1 && /^[a-z]{2,3}$/i.test(words[0]) && words[0].toLowerCase() !== 'the') { lang = words.shift().toLowerCase(); }
        const q = words.join(' ').trim();
        if (!q) return ctx.reply(usage('📚', 'Wikipedia', 'Type what you want to know. Add a language code first for other languages.', `${PREFIX}wiki Sri Lanka   ·   ${PREFIX}wiki si ශ්‍රී ලංකාව`));
        await ctx.react('🔎');
        const base = `https://${lang}.wikipedia.org`;
        let title = q;
        try { const s = await M.getJson(`${base}/w/api.php?action=opensearch&search=${enc(q)}&limit=1&format=json&origin=*`); if (s && s[1] && s[1][0]) title = s[1][0]; } catch (e) { /* use the typed title */ }
        const d = await M.getJson(`${base}/api/rest_v1/page/summary/${enc(title.replace(/ /g, '_'))}`);
        if (!d || !d.extract) return ctx.reply(card('📚', 'Wikipedia', [`🔍 Nothing found for "${trunc(q, 40)}".`]));
        const text = card('📚', 'Wikipedia', [row('📖', 'Topic', d.title), '', trunc(d.extract, 900), '', row('🔗', 'Read more', (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) || '')]);
        const img = d.thumbnail && d.thumbnail.source;
        if (img) { try { return void await ctx.send({ image: await M.downloadBuffer(img, 5 * 1048576), caption: text }); } catch (e) { /* text only */ } }
        await ctx.reply(text);
    }) });

const WX = { 0: ['☀️', 'Clear sky'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'], 51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Heavy drizzle'], 61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 80: ['🌦️', 'Rain showers'], 81: ['🌧️', 'Rain showers'], 82: ['⛈️', 'Violent showers'], 95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm + hail'], 99: ['⛈️', 'Thunderstorm + hail'] };
reg({ name: 'weather', aliases: ['wthr', 'climate'], category: 'search', emoji: '🌦️', desc: 'weather of any city (3 days)', usage: '<city>',
    run: guard('🌦️', 'Weather', async (ctx) => {
        const q = ctx.q.trim();
        if (!q) return ctx.reply(usage('🌦️', 'Weather', 'Type a city name.', `${PREFIX}weather Colombo`));
        await ctx.react('🔎');
        const g = await M.getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${enc(q)}&count=1`);
        const p = g && g.results && g.results[0];
        if (!p) return ctx.reply(card('🌦️', 'Weather', [`🔍 Could not find "${trunc(q, 40)}".`]));
        const w = await M.getJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`);
        const c = w.current, d = w.daily; const wc = WX[c.weather_code] || ['🌡️', 'Unknown'];
        const days = d.time.map((t, i) => { const x = WX[d.weather_code[i]] || ['🌡️', '']; return `${x[0]} ${new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}  ${Math.round(d.temperature_2m_min[i])}°–${Math.round(d.temperature_2m_max[i])}°C  ☔ ${d.precipitation_probability_max[i] || 0}%`; });
        await ctx.reply(card('🌦️', 'Weather', [
            row('📍', 'City', `${p.name}${p.admin1 ? ', ' + p.admin1 : ''}, ${p.country || ''}`), '',
            `${wc[0]} *${wc[1]}*`, row('🌡️', 'Temp', `${Math.round(c.temperature_2m)}°C (feels ${Math.round(c.apparent_temperature)}°C)`),
            row('💧', 'Humidity', c.relative_humidity_2m + '%'), row('💨', 'Wind', c.wind_speed_10m + ' km/h'), row('🌧️', 'Rain now', c.precipitation + ' mm'), '',
            '📅 *Next days*'].concat(days)));
    }) });

reg({ name: 'translate', aliases: ['tr', 'trt'], category: 'search', emoji: '🌐', desc: 'translate text (reply to a message too)', usage: '<lang> <text>',
    run: guard('🌐', 'Translate', async (ctx) => {
        const lang = (ctx.args[0] || '').toLowerCase();
        const quoted = quotedOf(ctx.msg, ctx.from);
        let text = ctx.args.slice(1).join(' ').trim() || (quoted && quoted.text) || '';
        if (!/^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(lang) || !text) return ctx.reply(usage('🌐', 'Translate', 'Type a language code then the text, or reply to a message with the code.', `${PREFIX}translate si Good morning   ·   ${PREFIX}translate en (reply to a message)`));
        await ctx.react('🔎');
        text = text.slice(0, 480);
        const j = await M.getJson(`https://api.mymemory.translated.net/get?q=${enc(text)}&langpair=Autodetect|${enc(lang)}`);
        const out = j && j.responseData && j.responseData.translatedText;
        if (!out || (j.responseStatus && Number(j.responseStatus) !== 200)) return ctx.reply(fail('Could not translate that. Check the language code (en, si, ta, hi ...).'));
        await ctx.reply(card('🌐', 'Translate', [row('📝', 'Original', trunc(text, 120)), '', row('✅', lang.toUpperCase(), out)]));
    }) });

// ================================================================= 🎭 FUN
reg({ name: 'joke', aliases: ['jokes'], category: 'fun', emoji: '😂', desc: 'a random joke', usage: '',
    run: guard('😂', 'Joke', async (ctx) => {
        let setup, punch;
        try { const j = await M.getJson('https://official-joke-api.appspot.com/random_joke'); setup = j.setup; punch = j.punchline; }
        catch (e) { const j = await M.getJson('https://v2.jokeapi.dev/joke/Any?safe-mode&type=twopart'); setup = j.setup; punch = j.delivery; }
        if (!setup) throw new Error('empty');
        await ctx.reply(card('😂', 'Joke', [`🤔 ${setup}`, '', `😆 *${punch}*`]));
    }) });
reg({ name: 'fact', aliases: ['facts', 'randomfact'], category: 'fun', emoji: '🧠', desc: 'a random fact', usage: '',
    run: guard('🧠', 'Fact', async (ctx) => {
        const j = await M.getJson('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
        if (!j || !j.text) throw new Error('empty');
        await ctx.reply(card('🧠', 'Fact', [`💡 ${j.text}`]));
    }) });
reg({ name: 'quote', aliases: ['quotes', 'inspire'], category: 'fun', emoji: '💭', desc: 'an inspiring quote', usage: '',
    run: guard('💭', 'Quote', async (ctx) => {
        let text, who;
        try { const j = await M.getJson('https://zenquotes.io/api/random'); text = j[0].q; who = j[0].a; }
        catch (e) { const j = await M.getJson('https://dummyjson.com/quotes/random'); text = j.quote; who = j.author; }
        if (!text) throw new Error('empty');
        await ctx.reply(card('💭', 'Quote', [`✨ _${text}_`, '', `🖋️ *${who || 'Unknown'}*`]));
    }) });
