'use strict';
// Zadashi - MD · 📥 DOWNLOAD (15 commands) — every one runs on free, key-less services
const axios = require('axios');
const { reg } = require('../lib/registry');
const { card, row, usage, fail, trunc, foot } = require('../lib/ui');
const M = require('../lib/media');
const pending = require('../lib/pending');
const { quotedOf } = require('../lib/wa');
const { DL_MAX_MB, PREFIX } = require('../lib/config');

const enc = encodeURIComponent;
const cat = 'download';
const quotedText = (ctx) => { const q = quotedOf(ctx.msg, ctx.from); return q ? q.text : ''; };
const linkOf = (ctx, re) => { const u = M.pickUrl(ctx.q, quotedText(ctx)); return u && (!re || re.test(u)) ? u : null; };
const MIME = { pdf: 'application/pdf', zip: 'application/zip', apk: 'application/vnd.android.package-archive', mp3: 'audio/mpeg', mp4: 'video/mp4', jpg: 'image/jpeg', png: 'image/png', txt: 'text/plain', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed', mkv: 'video/x-matroska', exe: 'application/octet-stream' };
const mimeOf = (n) => MIME[(String(n).split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
const safeName = (s, d) => (String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 90)) || d || 'file';

// ---- senders (files are streamed from disk: low RAM)
const sendVideoFile = (ctx, file, caption) => ctx.send({ video: { url: file }, mimetype: 'video/mp4', caption });
const sendAudioFile = (ctx, file, mime) => ctx.send({ audio: { url: file }, mimetype: mime || 'audio/mpeg', ptt: false });
const sendDocFile = (ctx, file, name, mime) => ctx.send({ document: { url: file }, fileName: name, mimetype: mime || mimeOf(name) });
async function sendImageUrl(ctx, url, caption, referer) {
    const buf = await M.downloadBuffer(url, 12 * 1048576, referer ? { Referer: referer } : {});
    return ctx.send({ image: buf, caption: caption || undefined });
}

// ---- common error reply
async function failWith(ctx, emoji, title, e) {
    console.log(`.${ctx.command} failed:`, String((e && (e.stderr || e.message)) || e).slice(0, 300));
    await ctx.reply(card(emoji, title, ['❌ ' + M.friendlyError(e)], '🔁 _Try again in a moment._'));
}
const guard = (emoji, title, fn) => async (ctx) => {
    try { await fn(ctx); } catch (e) { await failWith(ctx, emoji, title, e); }
};

// ================================================================= YouTube
async function ytResolve(ctx) {
    const url = linkOf(ctx);
    if (url) {
        if (!M.YT_RE.test(url)) throw new M.DlError('BAD_URL', 'not youtube');
        try { return await M.ytInfo(url); } catch (e) { const id = M.ytIdOf(url); return { id, title: 'YouTube video', channel: '', duration: 0, views: 0, thumb: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '', url }; }
    }
    const q = ctx.q.trim() || quotedText(ctx).trim();
    const r = await M.ytSearch(q, 1);
    if (!r.length) throw new M.DlError('NOT_FOUND', `Nothing found for "${trunc(q, 40)}".`);
    return r[0];
}
const infoRows = (v) => [
    row('🎼', 'Title', trunc(v.title, 60)), v.channel ? row('📺', 'Channel', trunc(v.channel, 30)) : null,
    v.duration ? row('⏱️', 'Length', M.fmtDur(v.duration)) : null, v.views ? row('👁️', 'Views', M.fmtNum(v.views)) : null, v.url ? row('🔗', 'Link', v.url) : null
];
async function ytSend(ctx, v, kind) {
    const label = kind === 'audio' ? 'Song' : 'Video';
    const emoji = kind === 'audio' ? '🎵' : '🎬';
    try { if (v.thumb) await sendImageUrl(ctx, v.thumb, card(emoji, label, infoRows(v), kind === 'audio' ? '🎧 _Getting the audio..._' : '⏬ _Downloading the video..._')); else await ctx.reply(card(emoji, label, infoRows(v), '⏬ _Please wait..._')); }
    catch (e) { await ctx.reply(card(emoji, label, infoRows(v), '⏬ _Please wait..._')); }
    const f = await M.getYoutube(v, kind, { height: 720 });
    try {
        if (kind === 'audio') await sendAudioFile(ctx, f.file, f.mime);
        else await sendVideoFile(ctx, f.file, card('🎬', 'Video', [row('🎼', 'Title', trunc(v.title || f.title, 60)), row('📦', 'Size', M.fmtSize(f.size))]));
    } finally { f.cleanup(); }
    await ctx.react('✅');
}
reg({ name: 'song', aliases: ['play', 'mp3', 'ytmp3', 'music'], category: cat, emoji: '🎵', desc: 'YouTube song as MP3 (name or link)', usage: '<name | link>',
    run: guard('🎵', 'Song', async (ctx) => {
        if (!ctx.q.trim() && !quotedText(ctx)) return ctx.reply(usage('🎵', 'Song', 'Type a song name or paste a YouTube link.', `${PREFIX}song ruwan tharaka`));
        await ctx.react('🔎');
        await ytSend(ctx, await ytResolve(ctx), 'audio');
    }) });
reg({ name: 'video', aliases: ['ytmp4', 'ytv', 'mp4'], category: cat, emoji: '🎬', desc: 'YouTube video as MP4 (name or link)', usage: '<name | link>',
    run: guard('🎬', 'Video', async (ctx) => {
        if (!ctx.q.trim() && !quotedText(ctx)) return ctx.reply(usage('🎬', 'Video', 'Type a video name or paste a YouTube link.', `${PREFIX}video new sinhala song`));
        await ctx.react('🔎');
        await ytSend(ctx, await ytResolve(ctx), 'video');
    }) });
reg({ name: 'yts', aliases: ['ytsearch', 'yt'], category: cat, emoji: '📺', desc: 'search YouTube, then pick a result', usage: '<name>',
    run: guard('📺', 'YouTube', async (ctx) => {
        if (!ctx.q.trim()) return ctx.reply(usage('📺', 'YouTube', 'Type what you want to search.', `${PREFIX}yts nadeemal perera`));
        await ctx.react('🔎');
        const items = await M.ytSearch(ctx.q.trim(), 6);
        if (!items.length) return ctx.reply(card('📺', 'YouTube', [`Nothing found for "${trunc(ctx.q, 40)}".`]));
        const n = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
        const rows = [];
        items.forEach((v, i) => { rows.push(`${n[i]} *${trunc(v.title, 55)}*`); rows.push(`    ⏱️ ${M.fmtDur(v.duration)}  ·  📺 ${trunc(v.channel, 22)}`); rows.push(''); });
        const sent = await ctx.reply(card('📺', 'YouTube', rows, '💬 _Reply *1-6* for 🎵 audio, or *1v-6v* for 🎬 video_'));
        pending.remember(ctx.session, sent, { type: 'yts', items });
    }) });
pending.on('yts', async (ctx, d, text) => {
    const m = /^([1-9])\s*(v|video|a|audio|mp3|mp4)?$/i.exec(String(text).trim());
    if (!m) return;
    const v = d.items[parseInt(m[1], 10) - 1]; if (!v) return;
    const kind = /^(v|video|mp4)$/i.test(m[2] || '') ? 'video' : 'audio';
    try { await ctx.react('⏬'); await ytSend(ctx, v, kind); } catch (e) { await failWith(ctx, '📺', 'YouTube', e); }
});

// ================================================================= TikTok
const TT_RE = /https?:\/\/(?:[\w-]+\.)?tiktok\.com\/\S+/i;
const abs = (u) => (u && u.startsWith('/') ? 'https://www.tikwm.com' + u : u || '');
async function tikwm(url) {
    const r = await axios.post('https://www.tikwm.com/api/', new URLSearchParams({ url, hd: '1' }).toString(), { timeout: 30000, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': M.UA } });
    const d = r.data && r.data.data;
    if (!d || (!d.play && !d.hdplay && !(d.images && d.images.length))) throw new M.DlError('NOT_FOUND', 'Could not read that TikTok. It may be private or removed.');
    return { title: String(d.title || '').replace(/\s+/g, ' ').trim(), author: (d.author && (d.author.nickname || d.author.unique_id)) || '', duration: d.duration || 0, likes: d.digg_count, views: d.play_count, video: abs(d.hdplay || d.play), audio: abs(d.music), images: (d.images || []).map(abs) };
}
reg({ name: 'tiktok', aliases: ['tt', 'ttdl'], category: cat, emoji: '🎶', desc: 'TikTok video without watermark (add "audio" for sound)', usage: '<link>',
    run: guard('🎶', 'TikTok', async (ctx) => {
        const url = linkOf(ctx, TT_RE);
        if (!url) return ctx.reply(usage('🎶', 'TikTok', 'Send a TikTok link. Add *audio* to get only the sound.', `${PREFIX}tiktok https://vm.tiktok.com/xxxx`));
        await ctx.react('⏬');
        const wantAudio = /\b(audio|mp3|sound)\b/i.test(ctx.q.replace(url, ''));
        let t;
        try { t = await tikwm(url); }
        catch (e) { // backup: built-in downloader engine
            const f = await M.fetchLink(url, wantAudio ? 'audio' : 'video');
            try { if (wantAudio) await sendAudioFile(ctx, f.file, f.mime); else await sendVideoFile(ctx, f.file, card('🎶', 'TikTok', [row('🎼', 'Title', trunc(f.title, 70)), row('📦', 'Size', M.fmtSize(f.size))])); } finally { f.cleanup(); }
            return void await ctx.react('✅');
        }
        const rows = [t.title ? row('📝', 'Title', trunc(t.title, 70)) : null, t.author ? row('👤', 'By', t.author) : null, t.duration ? row('⏱️', 'Length', t.duration + 's') : null, t.likes ? row('❤️', 'Likes', M.fmtNum(t.likes)) : null];
        if (wantAudio) {
            if (!t.audio) return ctx.reply(card('🎶', 'TikTok', ['🔇 This post has no separate sound file.']));
            const buf = await M.downloadBuffer(t.audio, 25 * 1048576, { Referer: 'https://www.tiktok.com/' });
            await ctx.send({ audio: buf, mimetype: 'audio/mpeg', ptt: false });
        } else if (t.video) {
            const f = await M.downloadFile(t.video, DL_MAX_MB, { Referer: 'https://www.tiktok.com/' });
            try { await sendVideoFile(ctx, f.file, card('🎶', 'TikTok', rows)); } finally { f.cleanup(); }
        } else {
            let n = 0;
            for (const u of t.images.slice(0, 8)) await sendImageUrl(ctx, u, n++ === 0 ? card('🖼️', 'TikTok photos', rows) : '', 'https://www.tiktok.com/');
        }
        await ctx.react('✅');
    }) });

// ================================================================= Facebook · Instagram · Twitter/X · any link (yt-dlp)
async function viaYtDlp(ctx, emoji, title, url) {
    const wantAudio = /\b(audio|mp3)\b/i.test(ctx.q.replace(url, ''));
    const hq = parseInt((ctx.q.replace(url, '').match(/\b(144|240|360|480|720|1080)\b/) || [])[1], 10) || 720;
    await ctx.react('⏬');
    const f = await M.fetchLink(url, wantAudio ? 'audio' : 'video', { height: hq });
    try {
        if (wantAudio) await sendAudioFile(ctx, f.file, f.mime);
        else await sendVideoFile(ctx, f.file, card(emoji, title, [f.title ? row('📝', 'Title', trunc(f.title, 70)) : null, row('📦', 'Size', M.fmtSize(f.size))]));
    } finally { f.cleanup(); }
    await ctx.react('✅');
}
function linkCmd(name, aliases, emoji, title, re, example, desc) {
    reg({ name, aliases, category: cat, emoji, desc, usage: '<link>',
        run: guard(emoji, title, async (ctx) => {
            const url = linkOf(ctx);
            if (!url) return ctx.reply(usage(emoji, title, `Send a public ${title} link.`, `${PREFIX}${name} ${example}`));
            if (re && !re.test(url)) return ctx.reply(fail(`That is not a ${title} link.`));
            await viaYtDlp(ctx, emoji, title, url);
        }) });
}
linkCmd('facebook', ['fb', 'fbdl'], '📘', 'Facebook', /facebook\.com|fb\.watch|fb\.com/i, 'https://fb.watch/xxxx', 'Facebook video');
linkCmd('instagram', ['ig', 'igdl', 'insta', 'reel'], '📸', 'Instagram', /instagram\.com|instagr\.am/i, 'https://www.instagram.com/reel/xxxx/', 'Instagram reel / video');
linkCmd('twitter', ['x', 'tw', 'twdl'], '🐦', 'Twitter', /twitter\.com|x\.com|t\.co/i, 'https://x.com/user/status/123', 'Twitter / X video');
linkCmd('dl', ['download', 'getvideo'], '⏬', 'Download', null, 'https://site.com/video  [mp3 | 360 | 720]', 'video / audio from almost any site');

// ================================================================= SoundCloud
reg({ name: 'soundcloud', aliases: ['sc', 'scdl'], category: cat, emoji: '🎧', desc: 'SoundCloud track as MP3 (name or link)', usage: '<name | link>',
    run: guard('☁️', 'SoundCloud', async (ctx) => {
        if (!ctx.q.trim() && !quotedText(ctx)) return ctx.reply(usage('☁️', 'SoundCloud', 'Type a track name or paste a SoundCloud link.', `${PREFIX}soundcloud alan walker faded`));
        await ctx.react('🔎');
        const url = linkOf(ctx);
        const f = await M.fetchLink(url || ('scsearch1:' + ctx.q.trim()), 'audio');
        try {
            await ctx.reply(card('☁️', 'SoundCloud', [row('🎼', 'Title', trunc(f.title, 70)), row('📦', 'Size', M.fmtSize(f.size))], '🎧 _Sending..._'));
            await sendAudioFile(ctx, f.file, f.mime);
        } finally { f.cleanup(); }
        await ctx.react('✅');
    }) });

// ================================================================= Images: Pinterest + image search
async function bingImages(query, n) {
    const html = await M.getText(`https://www.bing.com/images/async?q=${enc(query)}&first=0&count=40&mmasync=1&adlt=strict`);
    const urls = []; const re = /murl&quot;:&quot;(.*?)&quot;/g; let m;
    while ((m = re.exec(html)) && urls.length < 40) { const u = m[1].replace(/&amp;/g, '&'); if (/^https?:\/\//.test(u) && !urls.includes(u)) urls.push(u); }
    return urls.slice(0, n || 20);
}
async function sendPictures(ctx, urls, want, caption) {
    let sent = 0, tried = 0;
    for (const u of urls) {
        if (sent >= want || tried >= want * 4) break;
        tried++;
        try { const buf = await M.downloadBuffer(u, 8 * 1048576); await ctx.send({ image: buf, caption: sent === 0 ? caption : undefined }); sent++; } catch (e) { /* next one */ }
    }
    return sent;
}
reg({ name: 'img', aliases: ['image', 'imgsearch', 'photo'], category: cat, emoji: '🏞️', desc: 'search & send pictures', usage: '<what> [count 1-5]',
    run: guard('🖼️', 'Images', async (ctx) => {
        let q = ctx.q.trim(); const cm = q.match(/\s(\d)$/); const count = cm ? Math.min(5, Math.max(1, parseInt(cm[1], 10))) : 3; if (cm) q = q.slice(0, -2).trim();
        if (!q) return ctx.reply(usage('🖼️', 'Images', 'Type what you want to see. Add a number (1-5) at the end for more pictures.', `${PREFIX}img sigiriya 4`));
        await ctx.react('🔎');
        const urls = await bingImages(q, 24);
        if (!urls.length) return ctx.reply(card('🖼️', 'Images', [`Nothing found for "${trunc(q, 40)}".`]));
        const n = await sendPictures(ctx, urls, count, card('🖼️', 'Images', [row('🔎', 'Search', trunc(q, 40))]));
        if (!n) return ctx.reply(fail('Could not load those pictures. Try different words.'));
        await ctx.react('✅');
    }) });
reg({ name: 'pinterest', aliases: ['pin', 'pindl'], category: cat, emoji: '📌', desc: 'Pinterest pin link or picture search', usage: '<link | words>',
    run: guard('📌', 'Pinterest', async (ctx) => {
        const q = ctx.q.trim();
        if (!q && !quotedText(ctx)) return ctx.reply(usage('📌', 'Pinterest', 'Send a Pinterest pin link, or type words to search pictures.', `${PREFIX}pinterest anime dragon`));
        await ctx.react('🔎');
        const url = linkOf(ctx);
        if (url && /pinterest\.|pin\.it/i.test(url)) {
            const html = await M.getText(url, { maxRedirects: 6 });
            const vid = (/<meta[^>]+property="og:video(?::url)?"[^>]+content="([^"]+)"/i.exec(html) || /"contentUrl":"(https:[^"]+\.mp4)"/i.exec(html) || [])[1];
            const img = (/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html) || [])[1];
            const ttl = ((/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i.exec(html) || [])[1] || '').replace(/&amp;/g, '&');
            const cap = card('📌', 'Pinterest', [ttl ? row('📝', 'Title', trunc(ttl, 70)) : null, row('🔗', 'Pin', url)]);
            if (vid && /\.mp4/i.test(vid)) { const f = await M.downloadFile(vid.replace(/\\u002F/g, '/'), DL_MAX_MB); try { await sendVideoFile(ctx, f.file, cap); } finally { f.cleanup(); } }
            else if (img) await sendImageUrl(ctx, img.replace(/\/\d+x\//, '/originals/'), cap).catch(() => sendImageUrl(ctx, img, cap));
            else return ctx.reply(fail('Could not read that pin.'));
            return void await ctx.react('✅');
        }
        const urls = await bingImages(q + ' site:pinterest.com', 24);
        if (!urls.length) return ctx.reply(card('📌', 'Pinterest', [`Nothing found for "${trunc(q, 40)}".`]));
        const n = await sendPictures(ctx, urls, 4, card('📌', 'Pinterest', [row('🔎', 'Search', trunc(q, 40))]));
        if (!n) return ctx.reply(fail('Could not load those pictures. Try different words.'));
        await ctx.react('✅');
    }) });

// ================================================================= MediaFire · Google Drive · GitHub · APK
async function sendDownloaded(ctx, emoji, title, f, name, extraRows) {
    try {
        await ctx.reply(card(emoji, title, [row('📄', 'File', trunc(name, 60)), row('📦', 'Size', M.fmtSize(f.size))].concat(extraRows || []), '📤 _Sending the file..._'));
        await sendDocFile(ctx, f.file, name, mimeOf(name));
    } finally { f.cleanup(); }
    await ctx.react('✅');
}
reg({ name: 'mediafire', aliases: ['mf', 'mfdl'], category: cat, emoji: '📂', desc: 'MediaFire file', usage: '<link>',
    run: guard('🔥', 'MediaFire', async (ctx) => {
        const url = linkOf(ctx, /mediafire\.com/i);
        if (!url) return ctx.reply(usage('🔥', 'MediaFire', 'Send a MediaFire file link.', `${PREFIX}mediafire https://www.mediafire.com/file/xxxx/file.zip`));
        await ctx.react('⏬');
        const html = await M.getText(url);
        let dl = (/data-scrambled-url="([^"]+)"/i.exec(html) || [])[1];
        if (dl) { try { dl = Buffer.from(dl, 'base64').toString('utf8'); } catch (e) { dl = ''; } }
        if (!dl) dl = (/id="downloadButton"[^>]*href="(https?:[^"]+)"/i.exec(html) || /href="(https?:\/\/download[^"]*mediafire[^"]+)"/i.exec(html) || [])[1];
        if (!dl) throw new M.DlError('NOT_FOUND', 'Could not find the download link on that page.');
        const nameFromPage = ((/class="filename">([^<]+)</i.exec(html) || [])[1] || '').trim();
        const f = await M.downloadFile(dl.replace(/&amp;/g, '&'), DL_MAX_MB);
        await sendDownloaded(ctx, '🔥', 'MediaFire', f, safeName(nameFromPage || f.name || decodeURIComponent(url.split('/').filter(Boolean).pop() || 'file'), 'file'));
    }) });
reg({ name: 'gdrive', aliases: ['gd', 'drive'], category: cat, emoji: '☁️', desc: 'Google Drive shared file', usage: '<link>',
    run: guard('💾', 'Google Drive', async (ctx) => {
        const url = linkOf(ctx, /drive\.google\.com|docs\.google\.com/i);
        if (!url) return ctx.reply(usage('💾', 'Google Drive', 'Send a Drive file link (shared as "anyone with the link").', `${PREFIX}gdrive https://drive.google.com/file/d/xxxx/view`));
        const id = (/\/d\/([\w-]{10,})/.exec(url) || /[?&]id=([\w-]{10,})/.exec(url) || [])[1];
        if (!id) throw new M.DlError('BAD_URL', 'bad link');
        await ctx.react('⏬');
        const f = await M.downloadFile(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, DL_MAX_MB);
        if (/text\/html/i.test(f.type)) { f.cleanup(); throw new M.DlError('NOT_FOUND', 'Could not open that file. Share it as "anyone with the link".'); }
        await sendDownloaded(ctx, '💾', 'Google Drive', f, safeName(f.name, 'drive-file-' + id.slice(0, 6)));
    }) });
reg({ name: 'gitclone', aliases: ['git', 'github', 'repo'], category: cat, emoji: '🐙', desc: 'GitHub repository as a ZIP', usage: '<repo link>',
    run: guard('🐙', 'GitHub', async (ctx) => {
        const url = linkOf(ctx, /github\.com/i);
        const m = url && /github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/tree\/([^\s#?]+))?(?:[/?#].*)?$/i.exec(url);
        if (!m) return ctx.reply(usage('🐙', 'GitHub', 'Send a GitHub repository link.', `${PREFIX}gitclone https://github.com/user/repo`));
        await ctx.react('⏬');
        const [, owner, repo, branch] = m;
        const f = await M.downloadFile(`https://api.github.com/repos/${owner}/${repo}/zipball${branch ? '/' + branch : ''}`, DL_MAX_MB, { Accept: 'application/vnd.github+json' });
        await sendDownloaded(ctx, '🐙', 'GitHub', f, safeName(f.name || `${repo}.zip`, repo + '.zip'), [row('👤', 'Owner', owner)]);
    }) });
reg({ name: 'apk', aliases: ['app', 'apkdl', 'playstore'], category: cat, emoji: '📲', desc: 'Android app (APK) by name', usage: '<app name>',
    run: guard('🤖', 'APK', async (ctx) => {
        const q = ctx.q.trim();
        if (!q) return ctx.reply(usage('🤖', 'APK', 'Type an app name.', `${PREFIX}apk whatsapp`));
        await ctx.react('🔎');
        const j = await M.getJson(`https://ws75.aptoide.com/api/7/apps/search?query=${enc(q)}&limit=1`);
        const a = j && j.datalist && j.datalist.list && j.datalist.list[0];
        if (!a || !a.file || !a.file.path) throw new M.DlError('NOT_FOUND', `No app found for "${trunc(q, 40)}".`);
        const size = a.size || (a.file && a.file.filesize) || 0;
        const rows = [row('📱', 'App', trunc(a.name, 50)), row('📦', 'Package', a.package), row('🏷️', 'Version', (a.file && a.file.vername) || '—'), row('💽', 'Size', M.fmtSize(size))];
        if (size > DL_MAX_MB * 1048576) return ctx.reply(card('🤖', 'APK', rows.concat([row('🔗', 'Direct link', a.file.path)]), `⚠️ _Too big for WhatsApp here (max ${DL_MAX_MB} MB)._`));
        if (a.icon) await sendImageUrl(ctx, a.icon, card('🤖', 'APK', rows, '📤 _Sending the file..._')).catch(() => ctx.reply(card('🤖', 'APK', rows, '📤 _Sending the file..._')));
        else await ctx.reply(card('🤖', 'APK', rows, '📤 _Sending the file..._'));
        const f = await M.downloadFile(a.file.path, DL_MAX_MB);
        try { await sendDocFile(ctx, f.file, safeName(a.name, 'app') + '.apk', MIME.apk); } finally { f.cleanup(); }
        await ctx.react('✅');
    }) });
