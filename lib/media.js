'use strict';
// Zadashi - MD · download engine (yt-dlp + plain HTTP). No API keys anywhere.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');
const { spawn, spawnSync } = require('child_process');
const { DL_MAX_MB } = require('./config');

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const TMP = path.join(os.tmpdir(), 'zadashi-md');
fs.mkdirSync(TMP, { recursive: true });
const tmpName = (ext) => path.join(TMP, crypto.randomBytes(6).toString('hex') + (ext || ''));
const rm = (...files) => files.forEach((f) => { if (f) fs.rm(f, { force: true }, () => {}); });
setInterval(() => { // clean leftovers of crashed jobs
    try { for (const f of fs.readdirSync(TMP)) { const p = path.join(TMP, f); if (Date.now() - fs.statSync(p).mtimeMs > 3600e3) rm(p); } } catch (e) { /* ignore */ }
}, 30 * 60 * 1000).unref();

class DlError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }

// ------------------------------------------------------------------ ffmpeg
let _ff;
function ffmpegPath() {
    if (_ff !== undefined) return _ff;
    _ff = null;
    try { const p = require('ffmpeg-static'); if (p && fs.existsSync(p)) _ff = p; } catch (e) { /* optional */ }
    if (!_ff) { try { if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) _ff = 'ffmpeg'; } catch (e) { /* none */ } }
    return _ff;
}
function runFfmpeg(args, timeoutMs) {
    return new Promise((resolve) => {
        const ff = ffmpegPath();
        if (!ff) return resolve({ ok: false, err: 'ffmpeg missing' });
        let err = '';
        const p = spawn(ff, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) { /* ignore */ } }, timeoutMs || 120000);
        p.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
        p.on('close', (code) => { clearTimeout(t); resolve({ ok: code === 0, err }); });
        p.on('error', (e) => { clearTimeout(t); resolve({ ok: false, err: String(e.message) }); });
    });
}

// ------------------------------------------------------------------ yt-dlp (downloaded automatically, free)
// _ready resolves to { cmd, pre, flags }:  cmd = program, pre = leading args (python zipapp), flags = extra yt-dlp flags
let _ready = null;
const BIN_DIR = path.join(require('./config').DATA_DIR, 'bin');
try { fs.mkdirSync(BIN_DIR, { recursive: true }); } catch (e) { /* ignore */ }
const asset = () => (process.platform === 'win32' ? 'yt-dlp.exe' : process.platform === 'darwin' ? 'yt-dlp_macos' : (process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux'));
const GH = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/';
function probe(cmd, pre) {
    try {
        const r = spawnSync(cmd, (pre || []).concat(['--version']), { timeout: 40000, encoding: 'utf8' });
        if (r.status === 0 && /^\d{4}\.\d{2}\.\d{2}/.test(String(r.stdout).trim())) return String(r.stdout).trim();
    } catch (e) { /* not runnable */ }
    return null;
}
// since 2025.11 YouTube needs a JavaScript runtime to solve the player challenge. We already run on Node, so hand it over.
function flagsFor(version) {
    const f = [];
    if (version && version.replace(/\./g, '') >= '20251112') f.push('--js-runtimes', 'node:' + process.execPath, '--remote-components', 'ejs:github');
    return f;
}
async function fetchBin(name, dest) {
    const res = await axios.get(GH + name, { responseType: 'arraybuffer', timeout: 120000, maxRedirects: 8 });
    fs.writeFileSync(dest + '.part', Buffer.from(res.data)); fs.renameSync(dest + '.part', dest); fs.chmodSync(dest, 0o755);
}
async function ensureYtDlp(force) {
    if (_ready && !force) return _ready;
    _ready = (async () => {
        if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) { const v = probe(process.env.YTDLP_PATH); return { cmd: process.env.YTDLP_PATH, pre: [], flags: flagsFor(v) }; }
        const dirs = [BIN_DIR, TMP]; // a data volume first, /tmp as a second place (some hosts mount one of them noexec)
        for (const dir of dirs) {
            const bin = path.join(dir, asset());
            const have = fs.existsSync(bin) && fs.statSync(bin).size > 1e6;
            const fresh = have && Date.now() - fs.statSync(bin).mtimeMs < 2 * 86400000;
            if (!fresh || force) {
                console.log(have ? '🔄 Updating yt-dlp...' : '⬇️ Downloading yt-dlp...');
                try { await fetchBin(asset(), bin); } catch (e) { if (!have) { console.log('yt-dlp download failed:', e.message); continue; } console.log('yt-dlp update skipped, using the old copy:', e.message); }
            }
            const v = probe(bin);
            if (v) { console.log('✅ yt-dlp ready ' + v); return { cmd: bin, pre: [], flags: flagsFor(v) }; }
        }
        // last resort: the python zipapp (needs python3, which the Nixpacks setup installs)
        const zip = path.join(BIN_DIR, 'yt-dlp.pyz');
        try {
            if (!fs.existsSync(zip) || force || Date.now() - fs.statSync(zip).mtimeMs > 2 * 86400000) await fetchBin('yt-dlp', zip);
            const v = probe('python3', [zip]);
            if (v) { console.log('✅ yt-dlp (python) ready ' + v); return { cmd: 'python3', pre: [zip], flags: flagsFor(v) }; }
        } catch (e) { console.log('yt-dlp python fallback failed:', e.message); }
        throw new Error('yt-dlp unavailable');
    })().catch((e) => { _ready = null; throw e; });
    return _ready;
}
setInterval(() => { _ready = null; }, 12 * 3600 * 1000).unref();
setTimeout(() => { ensureYtDlp().catch((e) => console.log('yt-dlp warm-up skipped:', e.message)); }, 8 * 1000);

function cookiesFile() {
    const b64 = process.env.YTDLP_COOKIES_B64; if (!b64) return null;
    const f = path.join(TMP, 'cookies.txt');
    try { fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f; } catch (e) { return null; }
}

// at most N downloads at the same time
const PAR = Math.max(1, parseInt(process.env.DL_PARALLEL || '', 10) || 2);
let busy = 0; const waiters = [];
async function slot() { if (busy >= PAR) await new Promise((r) => waiters.push(r)); busy++; }
function release() { busy--; const n = waiters.shift(); if (n) n(); }

function runOnce(args, opt) {
    opt = opt || {};
    return (async () => {
        let eng;
        try { eng = await ensureYtDlp(); } catch (e) { throw new DlError('NOBIN', 'downloader engine missing'); }
        return new Promise((resolve, reject) => {
            const cf = cookiesFile();
            const base = ['--no-warnings', '--no-progress', '--socket-timeout', '20', '--retries', '2', '-N', '4', '--no-cache-dir', '--restrict-filenames'];
            if (opt.playlist !== true) base.unshift('--no-playlist');
            const full = base.concat(eng.flags || [], cf ? ['--cookies', cf] : [], args);
            const ff = ffmpegPath(); if (ff && ff !== 'ffmpeg') full.unshift('--ffmpeg-location', ff);
            const ps = spawn(eng.cmd, (eng.pre || []).concat(full), { env: Object.assign({}, process.env, { PYTHONUNBUFFERED: '1' }) });
            let out = '', err = '';
            const cap = opt.maxOut || 30000;
            const timer = setTimeout(() => { try { ps.kill('SIGKILL'); } catch (e) { /* ignore */ } reject(new DlError('TIMEOUT', 'timed out')); }, opt.timeout || 170000);
            ps.stdout.on('data', (d) => { if (out.length < cap) out += d; });
            ps.stderr.on('data', (d) => { if (err.length < 8000) err += d; });
            ps.on('error', (e) => { clearTimeout(timer); reject(new DlError('SPAWN', e.message)); });
            ps.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve({ out, err }) : reject(Object.assign(new DlError('FAIL', err.slice(-400) || 'failed'), { stderr: err })); });
        });
    })();
}
let _forced = 0;
async function runYtDlp(args, opt) {
    try { return await runOnce(args, opt); }
    catch (e) {
        // a site changed its layout: fetch the newest yt-dlp once (at most every 30 min) and try again
        if (e && e.code === 'FAIL' && /unable to extract|nsig|HTTP Error 403|Requested format is not available|player response|report this issue|Unable to download webpage/i.test(String(e.stderr || '')) && Date.now() - _forced > 30 * 60 * 1000) {
            _forced = Date.now();
            try { await ensureYtDlp(true); return await runOnce(args, opt); } catch (e2) { throw e2; }
        }
        throw e;
    }
}
// YouTube sometimes refuses data-center servers: try a few different "player clients" (all free, no login)
const YT_VARIANTS = [[], ['--extractor-args', 'youtube:player_client=android_vr'], ['--extractor-args', 'youtube:player_client=tv,web_safari'], ['--extractor-args', 'youtube:player_client=mweb']];
const YT_RETRY = /Sign in to confirm|not a bot|player response|Requested format|nsig|HTTP Error 403|Precondition|n challenge|JavaScript runtime|No video formats|Only images are available/i;
async function runYt(args, opt) {
    let last; const t0 = Date.now();
    for (const v of YT_VARIANTS) {
        if (Date.now() - t0 > 110000) break; // never keep the user waiting for minutes
        try { return await runYtDlp(v.concat(args), Object.assign({}, opt, { timeout: Math.min((opt && opt.timeout) || 90000, 90000) })); }
        catch (e) {
            last = e;
            if (!(e && e.code === 'FAIL' && YT_RETRY.test(String(e.stderr || '')))) break;
        }
    }
    throw last;
}

function friendlyError(e) {
    const t = String((e && (e.stderr || e.message)) || '');
    const c = e && e.code;
    if (c === 'NOBIN') return 'The downloader engine could not be installed on this server (no internet to GitHub?).';
    if (c === 'TIMEOUT') return 'That took too long. Try a shorter video.';
    if (c === 'TOO_BIG' || /larger than max-filesize|File is larger/i.test(t)) return `That file is bigger than ${DL_MAX_MB} MB, the limit for WhatsApp here.`;
    if (c === 'BAD_URL') return 'That link is not supported.';
    if (c === 'NOT_FOUND') return String(e.message || 'Nothing was found.');
    if (c === 'YT_ALL') return 'YouTube blocked every route right now. Please try again in a minute.';
    if (/Sign in to confirm|not a bot/i.test(t)) return 'YouTube asked this server to prove it is not a bot. Try again in a minute.';
    if (/private|login required|requires login|Private video|rate-limit|empty media response/i.test(t)) return 'That post is private or needs a login.';
    if (/Unsupported URL/i.test(t)) return 'That link is not supported.';
    if (/Video unavailable|removed|not available|404|does not exist/i.test(t)) return 'That video is unavailable or was removed.';
    if (/is live|live event/i.test(t)) return 'Live streams cannot be downloaded.';
    if (c === 'HTTP') return String(e.message || 'The file server refused the request.');
    return 'Could not download that. Check the link and try again.';
}

const URL_RE = /https?:\/\/[^\s<>"']+/i;
const YT_RE = /(?:youtube\.com|youtu\.be|music\.youtube\.com)\//i;
const pickUrl = (q, extra) => { const m = String(q || '').match(URL_RE) || String(extra || '').match(URL_RE); return m ? m[0].replace(/[)\].,]+$/, '') : null; };

// ------------------------------------------------------------------ YouTube search
const UA_DESK = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const parseDur = (t) => String(t || '').split(':').reduce((a, x) => a * 60 + (parseInt(x, 10) || 0), 0);
const parseViews = (t) => parseInt(String(t || '').replace(/[^\d]/g, ''), 10) || 0;
const mkVideo = (id, title, channel, duration, views) => ({ id, title: title || 'Unknown', channel: channel || '', duration: duration || 0, views: views || 0, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, url: 'https://www.youtube.com/watch?v=' + id });

// 1) straight from the YouTube results page (no yt-dlp, fast)
async function ytSearchWeb(query, n) {
    const html = await getText('https://www.youtube.com/results?search_query=' + encodeURIComponent(query) + '&hl=en&gl=US', { timeout: 20000, headers: { 'User-Agent': UA_DESK, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1; SOCS=CAI' } });
    const m = /var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(html);
    if (!m) throw new DlError('FAIL', 'no results data');
    const data = JSON.parse(m[1]); const out = [];
    (function walk(o) {
        if (!o || typeof o !== 'object' || out.length >= (n || 5) * 3) return;
        if (o.videoRenderer && o.videoRenderer.videoId) {
            const v = o.videoRenderer;
            if (v.lengthText && !out.some((x) => x.id === v.videoId)) out.push(mkVideo(v.videoId, v.title && v.title.runs && v.title.runs.map((r) => r.text).join(''), v.ownerText && v.ownerText.runs && v.ownerText.runs[0].text, parseDur(v.lengthText.simpleText), parseViews(v.viewCountText && v.viewCountText.simpleText)));
            return;
        }
        for (const k of Object.keys(o)) walk(o[k]);
    })(data);
    return out.slice(0, n || 5);
}
// 2) yt-dlp search
async function ytSearchDlp(query, n) {
    const { out } = await runYt(['--flat-playlist', '-J', 'ytsearch' + (n || 5) + ':' + query], { timeout: 60000, maxOut: 600000, playlist: true });
    const j = JSON.parse(out);
    return (j.entries || []).filter((e) => e && e.id).map((e) => Object.assign(mkVideo(e.id, e.title, e.channel || e.uploader, e.duration, e.view_count), { thumb: (e.thumbnails && e.thumbnails.length ? e.thumbnails[e.thumbnails.length - 1].url : '') || `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg` }));
}
// 3) public Invidious / Piped mirrors
const invInstances = () => String(process.env.YT_INSTANCES || 'https://yewtu.be,https://inv.nadeko.net,https://invidious.nerdvpn.de').split(',').map((x) => x.trim().replace(/\/+$/, '')).filter(Boolean);
const pipedInstances = () => String(process.env.PIPED_INSTANCES || 'https://pipedapi.kavin.rocks,https://pipedapi.adminforge.de,https://api.piped.private.coffee').split(',').map((x) => x.trim().replace(/\/+$/, '')).filter(Boolean);
async function ytSearchMirror(query, n) {
    for (const base of invInstances().slice(0, 3)) {
        try { const j = await getJson(`${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, { timeout: 12000 }); const r = (j || []).filter((x) => x && x.videoId && x.lengthSeconds).slice(0, n || 5).map((x) => mkVideo(x.videoId, x.title, x.author, x.lengthSeconds, x.viewCount)); if (r.length) return r; } catch (e) { /* next */ }
    }
    for (const base of pipedInstances().slice(0, 3)) {
        try { const j = await getJson(`${base}/search?q=${encodeURIComponent(query)}&filter=music_songs`, { timeout: 12000 }); const r = ((j && j.items) || []).filter((x) => x && x.url && /watch\?v=/.test(x.url)).slice(0, n || 5).map((x) => mkVideo(x.url.split('v=')[1], x.title, x.uploaderName, x.duration, x.views)); if (r.length) return r; } catch (e) { /* next */ }
    }
    return [];
}
async function ytSearch(query, n) {
    let last;
    for (const fn of [ytSearchWeb, ytSearchDlp, ytSearchMirror]) {
        try { const r = await fn(query, n); if (r && r.length) return r; } catch (e) { last = e; console.log('yt search route failed:', fn.name, String(e && e.message).slice(0, 120)); }
    }
    if (last) throw last;
    return [];
}
const ytIdOf = (url) => ((String(url).match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/) || [])[1]) || '';
async function ytInfo(url) {
    const id = ytIdOf(url);
    try { // oEmbed: always free, never blocked
        if (id) { const j = await getJson('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id), { timeout: 10000 }); if (j && j.title) return mkVideo(id, j.title, j.author_name, 0, 0); }
    } catch (e) { /* try yt-dlp */ }
    const { out } = await runYt(['--dump-single-json', '--skip-download', url], { timeout: 60000, maxOut: 900000 });
    const e = JSON.parse(out);
    return Object.assign(mkVideo(e.id, e.title, e.channel || e.uploader, e.duration, e.view_count), { thumb: e.thumbnail || `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`, url: e.webpage_url || url });
}

// ------------------------------------------------------------------ YouTube without yt-dlp (backup routes)
// A) YouTube's own app API with the "android_vr" client — gives direct file links without any login
async function ytDirectStreams(id) {
    const ver = '1.60.19';
    const r = await axios.post('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        videoId: id, contentCheckOk: true, racyCheckOk: true,
        context: { client: { clientName: 'ANDROID_VR', clientVersion: ver, deviceMake: 'Oculus', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12L', androidSdkVersion: 32, hl: 'en', gl: 'US' } }
    }, { timeout: 20000, headers: { 'User-Agent': `com.google.android.apps.youtube.vr.oculus/${ver} (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip`, 'X-YouTube-Client-Name': '28', 'X-YouTube-Client-Version': ver, 'Content-Type': 'application/json', Origin: 'https://www.youtube.com' } });
    const d = r.data || {};
    if (!d.streamingData) throw new DlError('FAIL', 'no streams: ' + ((d.playabilityStatus && d.playabilityStatus.reason) || 'unknown'));
    return { formats: (d.streamingData.adaptiveFormats || []).concat(d.streamingData.formats || []).filter((f) => f.url), ua: `com.google.android.apps.youtube.vr.oculus/${ver} (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip` };
}
// download in 8 MB pieces (googlevideo throttles one long request)
async function downloadRanged(url, total, maxBytes, headers) {
    if (total && total > maxBytes) throw new DlError('TOO_BIG', 'big');
    const file = tmpName('.bin'); const fd = fs.openSync(file, 'w'); let pos = 0; const STEP = 8 * 1048576;
    try {
        while (!total || pos < total) {
            const end = pos + STEP - 1;
            const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000, maxRedirects: 4, validateStatus: (x) => x === 200 || x === 206, headers: Object.assign({ Range: `bytes=${pos}-${end}` }, headers || {}) });
            const buf = Buffer.from(r.data); if (!buf.length) break;
            fs.writeSync(fd, buf); pos += buf.length;
            const cr = /\/(\d+)$/.exec(String(r.headers['content-range'] || '')); if (cr) total = parseInt(cr[1], 10);
            if (pos > maxBytes) throw new DlError('TOO_BIG', 'big');
            if (r.status === 200 || buf.length < STEP) break;
        }
    } catch (e) { try { fs.closeSync(fd); } catch (x) { /* ignore */ } rm(file); throw e; }
    fs.closeSync(fd);
    if (!pos) { rm(file); throw new DlError('FAIL', 'empty download'); }
    return { file, size: pos, cleanup: () => rm(file) };
}
async function ytViaApp(id, kind, maxMb) {
    const { formats, ua } = await ytDirectStreams(id);
    const max = (maxMb || DL_MAX_MB) * 1048576;
    let pick;
    if (kind === 'audio') pick = formats.filter((f) => /^audio\/mp4/.test(f.mimeType || '')).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] || formats.filter((f) => /^audio\//.test(f.mimeType || '')).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    else pick = formats.filter((f) => /^video\/mp4/.test(f.mimeType || '') && f.audioQuality).sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    if (!pick) throw new DlError('FAIL', 'no matching stream');
    const f = await downloadRanged(pick.url, parseInt(pick.contentLength || '0', 10), max, { 'User-Agent': ua });
    return Object.assign(f, { title: '', mime: /^audio\/webm/.test(pick.mimeType || '') ? 'audio/ogg; codecs=opus' : kind === 'audio' ? 'audio/mp4' : 'video/mp4' });
}
// B) public Piped / Invidious mirrors
async function ytViaMirrors(id, kind, maxMb) {
    let last;
    for (const base of pipedInstances().slice(0, 3)) {
        try {
            const j = await getJson(`${base}/streams/${id}`, { timeout: 15000 });
            const list = kind === 'audio' ? (j.audioStreams || []).filter((x) => /mp4|m4a/i.test(x.mimeType || x.format || '')).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0)) : (j.videoStreams || []).filter((x) => !x.videoOnly && /mp4/i.test(x.mimeType || x.format || '')).sort((a, b) => (b.height || 0) - (a.height || 0));
            if (!list.length) continue;
            const f = await downloadFile(list[0].url, maxMb || DL_MAX_MB);
            return Object.assign(f, { title: j.title || '', mime: kind === 'audio' ? 'audio/mp4' : 'video/mp4' });
        } catch (e) { last = e; }
    }
    for (const base of invInstances().slice(0, 3)) {
        try {
            const f = await downloadFile(`${base}/latest_version?id=${id}&itag=${kind === 'audio' ? 140 : 18}&local=true`, maxMb || DL_MAX_MB);
            return Object.assign(f, { title: '', mime: kind === 'audio' ? 'audio/mp4' : 'video/mp4' });
        } catch (e) { last = e; }
    }
    throw last || new DlError('FAIL', 'no mirror worked');
}
// the whole chain for one YouTube video. audio: also SoundCloud as the very last resort.
async function getYoutube(v, kind, o) {
    o = o || {};
    const errs = [];
    const routes = [
        ['yt-dlp', () => fetchLink(v.url, kind, o)],
        ['app-api', () => (v.id ? ytViaApp(v.id, kind, o.maxMb) : Promise.reject(new DlError('FAIL', 'no id')))],
        ['mirrors', () => (v.id ? ytViaMirrors(v.id, kind, o.maxMb) : Promise.reject(new DlError('FAIL', 'no id')))]
    ];
    if (kind === 'audio' && v.title) routes.push(['soundcloud', () => fetchLink('scsearch1:' + v.title.replace(/\(.*?\)|\[.*?\]/g, '').slice(0, 80), 'audio', o)]);
    for (const [name, fn] of routes) {
        try { const f = await fn(); if (f && f.file) return f; }
        catch (e) {
            errs.push(e); console.log(`youtube route "${name}" failed:`, String((e && (e.stderr || e.message)) || e).replace(/\s+/g, ' ').slice(0, 220));
            if (e && (e.code === 'TOO_BIG' || /larger than max-filesize/i.test(String(e.stderr || '')))) throw e; // another route will not make the file smaller
        }
    }
    const first = errs.find((e) => e && e.code && e.code !== 'FAIL') || errs[0];
    throw first && first.code === 'FAIL' && /Sign in|not a bot/i.test(String(first.stderr || '')) ? first : Object.assign(new DlError('YT_ALL', 'all routes failed'), { stderr: String((first && first.stderr) || '') });
}

// ------------------------------------------------------------------ download a link to a temp file with yt-dlp
// kind: 'audio' | 'video'.  returns { file, title, size, mime, cleanup }
async function fetchLink(url, kind, o) {
    o = o || {};
    await slot();
    const id = crypto.randomBytes(5).toString('hex');
    const base = path.join(TMP, 'dl_' + id);
    const cleanup = () => { try { for (const f of fs.readdirSync(TMP)) if (f.startsWith('dl_' + id)) fs.unlinkSync(path.join(TMP, f)); } catch (e) { /* ignore */ } };
    try {
        const h = o.height || 720, max = (o.maxMb || DL_MAX_MB) + 'M';
        let args, mime;
        if (kind === 'audio') {
            if (ffmpegPath()) { args = ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '5']; mime = 'audio/mpeg'; }
            else { args = ['-f', 'bestaudio[ext=m4a]/bestaudio']; mime = 'audio/mp4'; }
        } else {
            args = ['-f', `b[ext=mp4][height<=${h}]/b[height<=${h}]/bv*[height<=${h}]+ba/b`, '-S', 'vcodec:h264,res,acodec:aac'];
            if (ffmpegPath()) args.push('--merge-output-format', 'mp4');
            mime = 'video/mp4';
        }
        args.push('--max-filesize', max, '-o', base + '.%(ext)s', '--print', 'before_dl:TITLE=%(title).120s', url);
        const isYt = YT_RE.test(url);
        const { out } = await (isYt ? runYt : runYtDlp)(args, { timeout: 175000 });
        const title = ((out.match(/TITLE=(.*)/) || [])[1] || '').trim();
        const file = fs.readdirSync(TMP).map((f) => path.join(TMP, f)).find((f) => path.basename(f).startsWith('dl_' + id) && !/\.(part|ytdl)$/.test(f));
        if (!file) throw new DlError('FAIL', 'no file');
        const size = fs.statSync(file).size;
        if (size > (o.maxMb || DL_MAX_MB) * 1048576) throw new DlError('TOO_BIG', 'big');
        if (/\.(m4a|mp4)$/i.test(file) === false && kind === 'audio' && mime === 'audio/mp4') mime = 'audio/ogg; codecs=opus';
        return { file, title, size, mime, cleanup };
    } catch (e) { cleanup(); throw e; }
    finally { release(); }
}

// ------------------------------------------------------------------ plain HTTP downloads
const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.(local|internal)$)/i;
function checkUrl(url) {
    let u; try { u = new URL(url); } catch (e) { throw new DlError('BAD_URL', 'That is not a web link.'); }
    if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname)) throw new DlError('BAD_URL', 'That address is not allowed.');
    return u;
}
function nameFromDisposition(h) {
    const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(h || '');
    if (!m) return '';
    try { return decodeURIComponent(m[1] || m[2]).replace(/[\\/:*?"<>|]+/g, '_'); } catch (e) { return (m[2] || '').replace(/[\\/:*?"<>|]+/g, '_'); }
}
async function openStream(url, headers) {
    checkUrl(url);
    const r = await axios.get(url, { responseType: 'stream', timeout: 60000, maxRedirects: 5, validateStatus: () => true, headers: Object.assign({ 'User-Agent': UA, 'Accept': '*/*' }, headers || {}) });
    if (r.status >= 400) { r.data.destroy(); throw new DlError('HTTP', 'The file server answered HTTP ' + r.status + '.'); }
    return r;
}
async function downloadBuffer(url, maxBytes, headers) {
    const r = await openStream(url, headers);
    const len = parseInt(r.headers['content-length'] || '0', 10);
    if (len && len > maxBytes) { r.data.destroy(); throw new DlError('TOO_BIG', 'big'); }
    const chunks = []; let size = 0;
    for await (const ch of r.data) { size += ch.length; if (size > maxBytes) { r.data.destroy(); throw new DlError('TOO_BIG', 'big'); } chunks.push(ch); }
    return Buffer.concat(chunks);
}
// streams to a temp file (keeps RAM low for big files). returns { file, size, name, type, cleanup }
async function downloadFile(url, maxMb, headers) {
    const max = (maxMb || DL_MAX_MB) * 1048576;
    const r = await openStream(url, headers);
    const len = parseInt(r.headers['content-length'] || '0', 10);
    if (len && len > max) { r.data.destroy(); throw new DlError('TOO_BIG', 'big'); }
    const file = tmpName('.bin'); let size = 0;
    const ws = fs.createWriteStream(file);
    try {
        await new Promise((resolve, reject) => {
            r.data.on('data', (ch) => { size += ch.length; if (size > max) { r.data.destroy(new DlError('TOO_BIG', 'big')); } });
            r.data.on('error', reject); ws.on('error', reject); ws.on('finish', resolve);
            r.data.pipe(ws);
        });
    } catch (e) { rm(file); throw e; }
    return { file, size, name: nameFromDisposition(r.headers['content-disposition']), type: String(r.headers['content-type'] || ''), cleanup: () => rm(file) };
}
async function getJson(url, o) { return (await axios.get(url, Object.assign({ timeout: 20000, headers: { 'User-Agent': UA, 'Accept': 'application/json' } }, o || {}))).data; }
async function getText(url, o) { return (await axios.get(url, Object.assign({ timeout: 25000, responseType: 'text', headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } }, o || {}))).data; }

const fmtSize = (n) => { n = Number(n) || 0; return n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };
const fmtDur = (s) => { s = Math.floor(Number(s) || 0); if (!s) return '—'; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const fmtNum = (n) => { n = Number(n); if (!n) return '—'; return n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n); };

module.exports = {
    UA, TMP, tmpName, rm, DlError, ffmpegPath, runFfmpeg, ensureYtDlp, runYtDlp, runYt, friendlyError, URL_RE, YT_RE, pickUrl,
    ytSearch, ytInfo, ytIdOf, getYoutube, downloadRanged, fetchLink, downloadBuffer, downloadFile, getJson, getText, checkUrl, fmtSize, fmtDur, fmtNum, nameFromDisposition
};
