// server.js
const express = require('express');
const os = require('os');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');
const crypto = require('crypto');
let OBSWebSocket;
try {
  // obs-websocket-js v5 uses default export in some bundlers
  const mod = require('obs-websocket-js');
  OBSWebSocket = mod.default || mod;
} catch {
  OBSWebSocket = null;
}

const app = express();
const PORT = 3000;

const dataDir = path.join(__dirname, 'data');
const outDir = path.join(__dirname, 'out');

const participantsPath = path.join(dataDir, 'participants.json');
const contestsPath = path.join(dataDir, 'contests.json');
const contestParticipantsPath = path.join(dataDir, 'contest-participants.json');
const roundsButtonsPath = path.join(dataDir, 'round-buttons.json');
const specialsPath = path.join(dataDir, 'specials.json');
const overlaySettingsPath = path.join(dataDir, 'overlay-settings.json');

const operatorSettingsPath = path.join(dataDir, 'operator-settings.json');

// Custom fonts for Browser Overlay
const fontsDir = path.join(__dirname, 'public', 'fonts');
const fontsDbPath = path.join(dataDir, 'fonts.json');
let customFonts = []; // [{ name, file }]

// Browser Overlay (for OBS Browser Source)
// Uses the same output files that are used for Text Source.
// This avoids OBS file refresh glitches (missing glyphs) by rendering via Browser Source.

// Output files for OBS
const currentTitleFile = path.join(outDir, 'current_title.txt');
const currentPairFile = path.join(outDir, 'current_pair.txt');
const nextTitleFile = path.join(outDir, 'next_title.txt');

// In-memory data
let participants = []; // [{number, fullName, role}]
let contests = []; // [{id, name, type: 'finals'|'rounds'}]
let contestParticipants = {}; // { contestId: [numbers...] }
let roundButtons = []; // ['Heat 1', 'Heat 2', ...]
let specials = []; // [{id, name, items:[...] }]

// Browser Overlay appearance (font/size/color)
let overlaySettings = {
  titleFontFamily: 'system-ui',
  pairFontFamily: 'system-ui',
  titleSizePx: 48,
  pairSizePx: 40,
  titleColor: '#ffffff',
  pairColor: '#ffffff'
};

// Operator Mode settings (Stage 2)
let operatorSettings = {
  obsHost: 'localhost',
  obsPort: 4455,
  obsPassword: '',
  screenshotIntervalSec: 1,
  screenshotQuality: 70,
  screenshotWidth: 1280,
  screenshotHeight: 720,
  previewOnlyIfStudioMode: true,
  autoRefreshScreenshots: true
};

// OBS connection state
const obs = (OBSWebSocket ? new OBSWebSocket() : null);
let obsConnected = false;
let obsLastOkAt = 0;
let obsLastErrorAt = 0;
let obsLastErrorMessage = '';

// Import staging (single-user local; resets on server restart)
let importStash = new Map(); // token -> { ext, rows, headers, uploadedAt }

function loadJson(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) return defaultValue;
  const raw = fs.readFileSync(filePath, 'utf8');
  try { return JSON.parse(raw); } catch { return defaultValue; }
}
function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}
function ensureOutDir() {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
}
function writeFile(p, text) {
  ensureOutDir();
  fs.writeFileSync(p, text || '', 'utf8');
}

function readTextFileSafe(p) {
  try {
    if (!fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

// -------------------------
// OBS WebSocket (Stage 2)
// -------------------------
if (obs) {
  obs.on('ConnectionClosed', () => {
    obsConnected = false;
    obsLastErrorAt = Date.now();
    obsLastErrorMessage = 'Connection closed';
  });
  obs.on('error', (err) => {
    obsConnected = false;
    obsLastErrorAt = Date.now();
    obsLastErrorMessage = String(err?.message || err || 'OBS error');
  });
}

function getObsWsUrl() {
  const host = operatorSettings.obsHost || 'localhost';
  const port = operatorSettings.obsPort || 4455;
  return `ws://${host}:${port}`;
}

async function ensureObsConnected() {
  if (!obs) {
    obsLastErrorAt = Date.now();
    obsLastErrorMessage = 'obs-websocket-js is not installed';
    return { ok: false, error: obsLastErrorMessage };
  }
  if (obsConnected) return { ok: true };
  try {
    const url = getObsWsUrl();
    await obs.connect(url, operatorSettings.obsPassword || undefined);
    obsConnected = true;
    obsLastOkAt = Date.now();
    obsLastErrorMessage = '';
    return { ok: true };
  } catch (e) {
    obsConnected = false;
    obsLastErrorAt = Date.now();
    obsLastErrorMessage = String(e?.message || e || 'Failed to connect');
    return { ok: false, error: obsLastErrorMessage };
  }
}

async function getStudioModeEnabled() {
  const c = await ensureObsConnected();
  if (!c.ok) return { ok: false, error: c.error };
  try {
    const r = await obs.call('GetStudioModeEnabled');
    obsLastOkAt = Date.now();
    return { ok: true, studioModeEnabled: Boolean(r.studioModeEnabled) };
  } catch (e) {
    obsLastErrorAt = Date.now();
    obsLastErrorMessage = String(e?.message || e || 'GetStudioModeEnabled failed');
    return { ok: false, error: obsLastErrorMessage };
  }
}

function decodeObsImageData(imageData) {
  // imageData is a dataURL: data:image/jpeg;base64,....
  const s = String(imageData || '');
  const idx = s.indexOf('base64,');
  if (idx === -1) return null;
  const b64 = s.slice(idx + 'base64,'.length);
  try {
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

async function getSceneScreenshot(sceneName) {
  const c = await ensureObsConnected();
  if (!c.ok) return { ok: false, error: c.error };
  try {
    const r = await obs.call('GetSourceScreenshot', {
      sourceName: sceneName,
      imageFormat: 'jpg',
      imageWidth: operatorSettings.screenshotWidth,
      imageHeight: operatorSettings.screenshotHeight,
      imageCompressionQuality: operatorSettings.screenshotQuality,
    });
    obsLastOkAt = Date.now();
    const buf = decodeObsImageData(r.imageData);
    if (!buf) return { ok: false, error: 'Failed to decode screenshot' };
    return { ok: true, buffer: buf };
  } catch (e) {
    obsLastErrorAt = Date.now();
    obsLastErrorMessage = String(e?.message || e || 'GetSourceScreenshot failed');
    return { ok: false, error: obsLastErrorMessage };
  }
}

async function getProgramInfoAndScreenshot() {
  const c = await ensureObsConnected();
  if (!c.ok) return { ok: false, error: c.error };
  try {
    const r = await obs.call('GetCurrentProgramScene');
    obsLastOkAt = Date.now();
    const scene = r.currentProgramSceneName || r.currentProgramSceneName === '' ? r.currentProgramSceneName : r.sceneName;
    const ss = await getSceneScreenshot(scene);
    if (!ss.ok) return { ok: false, error: ss.error };
    return { ok: true, sceneName: scene, buffer: ss.buffer };
  } catch (e) {
    obsLastErrorAt = Date.now();
    obsLastErrorMessage = String(e?.message || e || 'GetCurrentProgramScene failed');
    return { ok: false, error: obsLastErrorMessage };
  }
}

async function getPreviewInfoAndScreenshot() {
  const studio = await getStudioModeEnabled();
  if (!studio.ok) return { ok: false, error: studio.error };
  if (!studio.studioModeEnabled && operatorSettings.previewOnlyIfStudioMode) {
    return { ok: true, studioModeEnabled: false, noPreview: true };
  }
  const c = await ensureObsConnected();
  if (!c.ok) return { ok: false, error: c.error };
  if (!studio.studioModeEnabled) {
    // Studio mode disabled but user still wants preview -> show current program as preview fallback
    const prog = await getProgramInfoAndScreenshot();
    if (!prog.ok) return { ok: false, error: prog.error };
    return { ok: true, studioModeEnabled: false, sceneName: prog.sceneName, buffer: prog.buffer };
  }
  try {
    const r = await obs.call('GetCurrentPreviewScene');
    obsLastOkAt = Date.now();
    const scene = r.currentPreviewSceneName || r.sceneName;
    const ss = await getSceneScreenshot(scene);
    if (!ss.ok) return { ok: false, error: ss.error };
    return { ok: true, studioModeEnabled: true, sceneName: scene, buffer: ss.buffer };
  } catch (e) {
    obsLastErrorAt = Date.now();
    obsLastErrorMessage = String(e?.message || e || 'GetCurrentPreviewScene failed');
    return { ok: false, error: obsLastErrorMessage };
  }
}

async function disconnectObs() {
  if (!obs) return;
  try {
    await obs.disconnect();
  } catch {}
  obsConnected = false;
}

function initData() {
  participants = loadJson(participantsPath, []);
  contests = loadJson(contestsPath, []);
  contestParticipants = loadJson(contestParticipantsPath, {});
  roundButtons = loadJson(roundsButtonsPath, ['Heat 1', 'Heat 2', 'Heat 3', 'Heat 4']);
  const rawSpecials = loadJson(specialsPath, []);
  specials = Array.isArray(rawSpecials)
    ? rawSpecials.map(normalizeSpecial).filter(Boolean)
    : [];
  // If we migrated anything, persist new shape to disk.
  saveJson(specialsPath, specials);

  // Overlay settings (persist defaults if file missing)
  const loadedOverlaySettings = loadJson(overlaySettingsPath, overlaySettings);
  overlaySettings = normalizeOverlaySettings(loadedOverlaySettings);
  saveJson(overlaySettingsPath, overlaySettings);

  // Operator settings
  const loadedOperatorSettings = loadJson(operatorSettingsPath, operatorSettings);
  operatorSettings = normalizeOperatorSettings(loadedOperatorSettings);
  saveJson(operatorSettingsPath, operatorSettings);

  // Custom fonts
  if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });
  customFonts = loadJson(fontsDbPath, []);
  if (!Array.isArray(customFonts)) customFonts = [];
  customFonts = customFonts
    .filter(f => f && typeof f === 'object')
    .map(f => ({ name: String(f.name || '').trim(), file: String(f.file || '').trim() }))
    .filter(f => f.name && f.file);
  saveJson(fontsDbPath, customFonts);
  regenerateFontsCss();

  console.log(`Loaded ${participants.length} participants, ${contests.length} contests`);
}

function normalizeOperatorSettings(input) {
  const s = (input && typeof input === 'object') ? input : {};
  const obsHost = String(s.obsHost ?? operatorSettings.obsHost).trim() || operatorSettings.obsHost;
  const obsPort = clampInt(s.obsPort ?? operatorSettings.obsPort, 1, 65535, operatorSettings.obsPort);
  const obsPassword = String(s.obsPassword ?? operatorSettings.obsPassword);
  const screenshotIntervalSec = clampInt(s.screenshotIntervalSec ?? operatorSettings.screenshotIntervalSec, 1, 30, operatorSettings.screenshotIntervalSec);
  const screenshotQuality = clampInt(s.screenshotQuality ?? operatorSettings.screenshotQuality, 1, 100, operatorSettings.screenshotQuality);
  const screenshotWidth = clampInt(s.screenshotWidth ?? operatorSettings.screenshotWidth, 320, 3840, operatorSettings.screenshotWidth);
  const screenshotHeight = clampInt(s.screenshotHeight ?? operatorSettings.screenshotHeight, 240, 2160, operatorSettings.screenshotHeight);
  const previewOnlyIfStudioMode = Boolean(s.previewOnlyIfStudioMode ?? operatorSettings.previewOnlyIfStudioMode);
  const autoRefreshScreenshots = Boolean(s.autoRefreshScreenshots ?? operatorSettings.autoRefreshScreenshots);
  return { obsHost, obsPort, obsPassword, screenshotIntervalSec, screenshotQuality, screenshotWidth, screenshotHeight, previewOnlyIfStudioMode, autoRefreshScreenshots };
}

function normalizeOverlaySettings(input) {
  const s = (input && typeof input === 'object') ? input : {};
  const titleFontFamily = String(s.titleFontFamily ?? overlaySettings.titleFontFamily).trim() || overlaySettings.titleFontFamily;
  const pairFontFamily = String(s.pairFontFamily ?? overlaySettings.pairFontFamily).trim() || overlaySettings.pairFontFamily;
  const titleSizePx = clampInt(s.titleSizePx ?? overlaySettings.titleSizePx, 10, 200, overlaySettings.titleSizePx);
  const pairSizePx = clampInt(s.pairSizePx ?? overlaySettings.pairSizePx, 10, 200, overlaySettings.pairSizePx);
  const titleColor = normalizeHexColor(s.titleColor ?? overlaySettings.titleColor) || overlaySettings.titleColor;
  const pairColor = normalizeHexColor(s.pairColor ?? overlaySettings.pairColor) || overlaySettings.pairColor;
  return { titleFontFamily, pairFontFamily, titleSizePx, pairSizePx, titleColor, pairColor };
}

function sanitizeFontName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9 _\-]/g, '')
    .slice(0, 64);
}

function regenerateFontsCss() {
  if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });
  const cssPath = path.join(fontsDir, 'fonts.css');
  const lines = [];
  for (const f of customFonts) {
    const fontName = sanitizeFontName(f.name);
    const file = String(f.file || '').trim();
    if (!fontName || !file) continue;
    const urlPath = `/fonts/${encodeURIComponent(file)}`;
    const ext = path.extname(file).toLowerCase();
    let format = '';
    if (ext === '.woff2') format = 'woff2';
    else if (ext === '.woff') format = 'woff';
    else if (ext === '.otf') format = 'opentype';
    else if (ext === '.ttf') format = 'truetype';

    lines.push(`@font-face {`);
    lines.push(`  font-family: "${fontName}";`);
    if (format) {
      lines.push(`  src: url('${urlPath}') format('${format}');`);
    } else {
      lines.push(`  src: url('${urlPath}');`);
    }
    lines.push(`  font-display: swap;`);
    lines.push(`}`);
  }
  fs.writeFileSync(cssPath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeHexColor(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  // Allow #rgb or #rrggbb
  if (/^#([0-9a-fA-F]{3}){1,2}$/.test(v)) {
    // If #rgb, expand to #rrggbb for consistency
    if (v.length === 4) {
      const r = v[1], g = v[2], b = v[3];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return v.toLowerCase();
  }
  return null;
}

function slugId(name, existingIds) {
  const base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let id = base || 'item';
  let suffix = 1;
  while (existingIds.has(id)) id = `${base}-${suffix++}`;
  return id;
}

function specialById(id) {
  return specials.find(s => s.id === id);
}

function roleByNumber(number, leaderParity = 'odd') {
  // leaderParity: 'odd' or 'even'
  if (!Number.isFinite(number)) return 'unknown';
  const isOdd = (number % 2 === 1);
  const leaderIsOdd = (leaderParity !== 'even');
  const isLeader = leaderIsOdd ? isOdd : !isOdd;
  return isLeader ? 'lead' : 'follow';
}

function findParticipant(number) {
  return participants.find(p => p.number === number);
}

function getParticipantsForContest(contestId) {
  const allowed = contestParticipants[contestId];
  // Contest participants subset behavior:
  // - If a contest has NO configured participant list -> return NONE.
  // - If a contest is configured with an empty list -> return NONE.
  // This matches the operator expectation: if nobody is selected in setup,
  // the on-air participant dropdowns must be empty.
  if (allowed === undefined) return [];
  if (!Array.isArray(allowed)) return [];
  if (allowed.length === 0) return [];
  const set = new Set(allowed);
  return participants.filter(p => set.has(p.number));
}

function contestById(id) {
  return contests.find(c => c.id === id);
}

function buildTitle(contestName, heatLabel, isNext) {
  const prefix = isNext ? 'NEXT: ' : '';
  const heatPart = heatLabel ? ` • ${heatLabel}` : '';
  return `${prefix}${contestName || ''}${heatPart}`.trim();
}

function buildSpecialTitle(name) {
  return `${name || ''}`.trim();
}

function normalizeSpecial(s) {
  // Backward compatibility:
  // - previously: { id, name, info, teams: [...] }
  // - now:        { id, name, items: [...] }
  if (!s || typeof s !== 'object') return null;
  const id = String(s.id || '').trim();
  const name = String(s.name || '').trim();
  if (!id || !name) return null;

  const itemsSrc = Array.isArray(s.items)
    ? s.items
    : (Array.isArray(s.teams) ? s.teams : []);

  const items = itemsSrc.map(x => String(x).trim()).filter(x => x.length > 0).slice(0, 120);
  return { id, name, items };
}

// File upload
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function readRowsFromUpload(buffer, ext) {
  if (ext === '.csv') {
    const text = buffer.toString('utf8');
    const records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
    // headers: keys from first record (if any)
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    return { rows: records, headers };
  }
  if (ext === '.xlsx' || ext === '.xls') {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }); // array of objects with headers
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { rows, headers };
  }
  throw new Error('unsupported file type');
}

function parseParticipantsFromRows(rows, numberCol, nameCol, leaderParity = 'odd') {
  const parsed = [];
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const numRaw = r[numberCol];
    const nameRaw = r[nameCol];

    const num = Number(String(numRaw ?? '').trim());
    const fullName = String(nameRaw ?? '').trim();

    if (!Number.isFinite(num) || !fullName) {
      errors.push({ row: i + 2, number: numRaw, name: nameRaw }); // +2 because header row is row 1
      continue;
    }
    parsed.push({ number: num, fullName, role: roleByNumber(num, leaderParity) });
  }

  // de-duplicate by number (last wins)
  const byNum = new Map();
  parsed.forEach(p => byNum.set(p.number, p));
  const finalList = Array.from(byNum.values()).sort((a, b) => a.number - b.number);
  return { finalList, errors };
}

// Express
app.use(cors());
app.use(express.json());

// Operator Mode standalone page (for iPad)
app.get('/operator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'operator.html'));
});

// Avoid aggressive caching for uploaded fonts (OBS Browser Source can cache hard)
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store');
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// API: current overlay state (for Browser Source)
app.get('/api/state', (req, res) => {
  res.json({
    currentTitle: readTextFileSafe(currentTitleFile),
    currentPair: readTextFileSafe(currentPairFile),
    nextTitle: readTextFileSafe(nextTitleFile),
    updatedAt: Date.now()
  });
});

// API: overlay appearance settings (for Browser Source)
app.get('/api/overlay-settings', (req, res) => {
  res.json(overlaySettings);
});

app.post('/api/overlay-settings', (req, res) => {
  overlaySettings = normalizeOverlaySettings(req.body);
  saveJson(overlaySettingsPath, overlaySettings);
  res.json({ ok: true, overlaySettings });
});

// -------------------------
// Operator Mode API (Stage 2)
// -------------------------
app.get('/api/operator/settings', (req, res) => {
  res.json(operatorSettings);
});

app.post('/api/operator/settings', (req, res) => {
  operatorSettings = normalizeOperatorSettings(req.body);
  saveJson(operatorSettingsPath, operatorSettings);
  res.json({ ok: true, operatorSettings });
});

app.post('/api/operator/test-connection', async (req, res) => {
  // Optional one-off override in body
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
    operatorSettings = normalizeOperatorSettings({ ...operatorSettings, ...req.body });
    saveJson(operatorSettingsPath, operatorSettings);
  }
  const r = await ensureObsConnected();
  if (!r.ok) return res.status(500).json({ ok: false, error: r.error });
  const studio = await getStudioModeEnabled();
  res.json({ ok: true, studioModeEnabled: studio.ok ? studio.studioModeEnabled : false });
});

app.post('/api/operator/reconnect', async (req, res) => {
  await disconnectObs();
  const r = await ensureObsConnected();
  if (!r.ok) return res.status(500).json({ ok: false, error: r.error });
  res.json({ ok: true });
});

app.get('/api/operator/obs-status', async (req, res) => {
  const now = Date.now();
  const staleMs = (operatorSettings.screenshotIntervalSec * 1000 * 3) || 3000;
  const isStale = obsConnected && obsLastOkAt && (now - obsLastOkAt > staleMs);
  let studioModeEnabled = false;
  if (obsConnected) {
    const studio = await getStudioModeEnabled();
    if (studio.ok) studioModeEnabled = studio.studioModeEnabled;
  }
  res.json({
    obsAvailable: Boolean(obs),
    connected: obsConnected,
    stale: Boolean(isStale),
    lastOkAt: obsLastOkAt,
    lastErrorAt: obsLastErrorAt,
    lastErrorMessage: obsLastErrorMessage,
    studioModeEnabled
  });
});

app.get('/api/operator/program.jpg', async (req, res) => {
  const r = await getProgramInfoAndScreenshot();
  if (!r.ok) return res.status(503).json({ ok: false, error: r.error });
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-OBS-Scene', encodeURIComponent(r.sceneName || ''));
  res.send(r.buffer);
});

app.get('/api/operator/preview.jpg', async (req, res) => {
  const r = await getPreviewInfoAndScreenshot();
  if (!r.ok) return res.status(503).json({ ok: false, error: r.error });
  if (r.noPreview) return res.status(204).end();
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-OBS-Scene', encodeURIComponent(r.sceneName || ''));
  res.send(r.buffer);
});

// API: fonts for Browser Overlay
function getBuiltInFonts() {
  // Keep this list short & useful (no massive font-family strings).
  return [
    'system-ui',
    'Arial',
    'Helvetica',
    'Verdana',
    'Trebuchet MS',
    'Georgia',
    'Times New Roman',
    'Courier New',
    'Impact'
  ];
}

app.get('/api/fonts', (req, res) => {
  const builtIn = getBuiltInFonts();
  const uploaded = customFonts.map(f => sanitizeFontName(f.name)).filter(Boolean);
  const fonts = Array.from(new Set([...builtIn, ...uploaded]));
  res.json({ fonts, customFonts: customFonts.map(f => ({ name: sanitizeFontName(f.name), file: f.file })) });
});

app.post('/api/fonts/upload', upload.single('font'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const original = String(req.file.originalname || 'font').trim();
    const ext = path.extname(original).toLowerCase();
    const allowed = new Set(['.ttf', '.otf', '.woff', '.woff2']);
    if (!allowed.has(ext)) return res.status(400).json({ error: 'Unsupported font type. Use ttf/otf/woff/woff2' });

    const baseName = sanitizeFontName(path.basename(original, ext)) || 'Custom Font';
    const hash = crypto.createHash('sha1').update(req.file.buffer).digest('hex').slice(0, 10);
    const filename = `${baseName.replace(/\s+/g, '_')}-${hash}${ext}`;

    if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });
    fs.writeFileSync(path.join(fontsDir, filename), req.file.buffer);

    // Upsert by name
    const existingIdx = customFonts.findIndex(f => sanitizeFontName(f.name) === baseName);
    const entry = { name: baseName, file: filename };
    if (existingIdx >= 0) customFonts[existingIdx] = entry;
    else customFonts.push(entry);

    saveJson(fontsDbPath, customFonts);
    regenerateFontsCss();

    res.json({ ok: true, font: { name: baseName, file: filename } });
  } catch (e) {
    res.status(500).json({ error: 'Failed to upload font' });
  }
});

// API: contests
app.get('/api/contests', (req, res) => {
  const type = req.query.type; // finals|rounds|all
  if (!type || type === 'all') return res.json(contests);
  res.json(contests.filter(c => c.type === type));
});

app.post('/api/contests', (req, res) => {
  const { name, type } = req.body;
  const contestType = (type === 'finals' || type === 'rounds') ? type : 'rounds';
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Invalid contest name' });

  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let id = base || 'contest';
  let suffix = 1;
  const existing = new Set(contests.map(c => c.id));
  while (existing.has(id)) id = `${base}-${suffix++}`;

  const contest = { id, name, type: contestType };
  contests.push(contest);
  saveJson(contestsPath, contests);
  res.json(contest);
});

// API: participants
app.get('/api/participants', (req, res) => {
  const contestId = req.query.contestId;
  const list = contestId ? getParticipantsForContest(contestId) : participants;
  res.json(list);
});

// API: round buttons
app.get('/api/round-buttons', (req, res) => res.json(roundButtons));

app.post('/api/round-buttons', (req, res) => {
  const { buttons } = req.body;
  if (!Array.isArray(buttons)) return res.status(400).json({ error: 'buttons must be an array' });
  roundButtons = buttons.map(x => String(x)).filter(x => x.trim().length > 0).slice(0, 30);
  saveJson(roundsButtonsPath, roundButtons);
  res.json({ ok: true, roundButtons });
});

// API: specials
app.get('/api/specials', (req, res) => {
  res.json(specials);
});

app.post('/api/specials', (req, res) => {
  const { name, items } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Invalid special name' });
  if (!Array.isArray(items) || items.length < 1) return res.status(400).json({ error: 'items must be an array with at least 1 item' });

  const existing = new Set(specials.map(s => s.id));
  const id = slugId(name, existing);
  const cleanItems = items.map(t => String(t).trim()).filter(t => t.length > 0).slice(0, 120);

  const special = { id, name: name.trim(), items: cleanItems };
  specials.push(special);
  saveJson(specialsPath, specials);
  res.json(special);
});

app.put('/api/specials/:id', (req, res) => {
  const id = req.params.id;
  const s = specialById(id);
  if (!s) return res.status(404).json({ error: 'special not found' });

  const { name, items } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Invalid special name' });
  if (!Array.isArray(items) || items.length < 1) return res.status(400).json({ error: 'items must be an array with at least 1 item' });

  s.name = name.trim();
  s.items = items.map(t => String(t).trim()).filter(t => t.length > 0).slice(0, 120);
  saveJson(specialsPath, specials);
  res.json({ ok: true, special: s });
});

app.delete('/api/specials/:id', (req, res) => {
  const id = req.params.id;
  const idx = specials.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'special not found' });
  specials.splice(idx, 1);
  saveJson(specialsPath, specials);
  res.json({ ok: true });
});

// APPLY: "В эфире" (Finals)
app.post('/api/onair/finals', (req, res) => {
  const { contestId, firstNumber, secondNumber, noPair } = req.body;
  if (!contestId) return res.status(400).json({ error: 'contestId required' });

  const contest = contestById(contestId);
  if (!contest) return res.status(400).json({ error: 'invalid contestId' });
  if (contest.type !== 'finals') return res.status(400).json({ error: 'contest is not finals type' });

  writeFile(currentTitleFile, buildTitle(contest.name, null, false));

  if (Boolean(noPair)) {
    writeFile(currentPairFile, '');
    return res.json({ ok: true });
  }

  const a = findParticipant(Number(firstNumber));
  const b = findParticipant(Number(secondNumber));
  if (!a || !b) return res.status(400).json({ error: 'invalid participant numbers' });

  writeFile(currentPairFile, `${a.fullName} — ${b.fullName}`);
  res.json({ ok: true });
});

// APPLY: "В эфире" (Rounds) - clears pair
app.post('/api/onair/rounds', (req, res) => {
  const { contestId, heatLabel } = req.body;
  if (!contestId) return res.status(400).json({ error: 'contestId required' });

  const contest = contestById(contestId);
  if (!contest) return res.status(400).json({ error: 'invalid contestId' });
  if (contest.type !== 'rounds') return res.status(400).json({ error: 'contest is not rounds type' });

  const heat = heatLabel ? String(heatLabel) : null;
  writeFile(currentTitleFile, buildTitle(contest.name, heat, false));
  writeFile(currentPairFile, ''); // requirement: clear pair in rounds mode

  res.json({ ok: true });
});

// APPLY: "В эфире" (Special)
app.post('/api/onair/special', (req, res) => {
  const { specialId, itemText, noPair } = req.body;
  if (!specialId) return res.status(400).json({ error: 'specialId required' });
  const s = specialById(specialId);
  if (!s) return res.status(400).json({ error: 'invalid specialId' });

  writeFile(currentTitleFile, buildSpecialTitle(s.name));

  if (Boolean(noPair)) {
    writeFile(currentPairFile, '');
    return res.json({ ok: true });
  }

  const list = Array.isArray(s.items) ? s.items : [];
  const chosen = String(itemText || '').trim();
  if (!chosen) return res.status(400).json({ error: 'itemText required' });
  if (!list.includes(chosen)) {
    return res.status(400).json({ error: 'itemText must be one of the Special items' });
  }

  writeFile(currentPairFile, chosen);
  res.json({ ok: true });
});

// APPLY NEXT (any contest type, heat only for rounds)
app.post('/api/next', (req, res) => {
  const { contestId, heatLabel } = req.body;
  if (!contestId) return res.status(400).json({ error: 'contestId required' });

  const contest = contestById(contestId);
  if (!contest) return res.status(400).json({ error: 'invalid contestId' });

  const heat = (contest.type === 'rounds' && heatLabel) ? String(heatLabel) : null;
  writeFile(nextTitleFile, buildTitle(contest.name, heat, true));

  res.json({ ok: true });
});

// Resets
app.post('/api/reset/onair', (req, res) => {
  writeFile(currentTitleFile, '');
  writeFile(currentPairFile, '');
  res.json({ ok: true });
});
app.post('/api/reset/next', (req, res) => {
  writeFile(nextTitleFile, '');
  res.json({ ok: true });
});

// Contest participants subset
app.get('/api/contest-participants', (req, res) => {
  const contestId = req.query.contestId;
  if (!contestId) return res.status(400).json({ error: 'contestId is required' });
  const list = contestParticipants[contestId];
  // If contest is not configured yet, treat it as "no participants selected".
  // This ensures on-air dropdowns are empty until the operator explicitly selects participants.
  if (list === undefined) return res.json({ contestId, participantNumbers: [] });
  if (!Array.isArray(list)) return res.json({ contestId, participantNumbers: [] });
  return res.json({ contestId, participantNumbers: list.map(Number).filter(n => Number.isFinite(n)) });
});

app.post('/api/contest-participants', (req, res) => {
  const { contestId, participantNumbers } = req.body;
  if (!contestId || !Array.isArray(participantNumbers)) {
    return res.status(400).json({ error: 'contestId and participantNumbers are required' });
  }
  contestParticipants[contestId] = participantNumbers.map(Number).filter(n => Number.isFinite(n));
  saveJson(contestParticipantsPath, contestParticipants);
  res.json({ ok: true });
});

// IMPORT: preview (upload file and return headers + sample + token)
app.post('/api/import/participants/preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });

    const originalName = req.file.originalname || 'upload';
    const ext = path.extname(originalName).toLowerCase();
    if (!['.csv', '.xls', '.xlsx'].includes(ext)) {
      return res.status(400).json({ error: 'unsupported file type. Use CSV, XLS, XLSX' });
    }

    const { rows, headers } = readRowsFromUpload(req.file.buffer, ext);
    if (!headers || headers.length === 0) {
      return res.status(400).json({ error: 'No headers detected. File must have a header row.' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    importStash.set(token, { ext, rows, headers, uploadedAt: Date.now() });

    // keep map small
    if (importStash.size > 5) {
      // delete oldest
      const oldest = Array.from(importStash.entries()).sort((a,b)=>a[1].uploadedAt-b[1].uploadedAt)[0];
      if (oldest) importStash.delete(oldest[0]);
    }

    const sample = rows.slice(0, 10);
    res.json({ ok: true, token, headers, sample });
  } catch (e) {
    console.error('Preview import error', e);
    res.status(500).json({ error: 'preview failed' });
  }
});

// IMPORT: confirm (use token + selected columns)
app.post('/api/import/participants/confirm', (req, res) => {
  try {
    const { token, numberColumn, nameColumn, leaderParity } = req.body;
    if (!token || !numberColumn || !nameColumn) {
      return res.status(400).json({ error: 'token, numberColumn, nameColumn are required' });
    }

    const stash = importStash.get(token);
    if (!stash) return res.status(400).json({ error: 'invalid token (upload again)' });

    const headers = stash.headers;
    if (!headers.includes(numberColumn) || !headers.includes(nameColumn)) {
      return res.status(400).json({ error: 'selected columns not found in headers' });
    }

    const parity = (leaderParity === 'even') ? 'even' : 'odd';
    const { finalList, errors } = parseParticipantsFromRows(stash.rows, numberColumn, nameColumn, parity);

    participants = finalList;
    saveJson(participantsPath, participants);

    // one-time token
    importStash.delete(token);

    res.json({
      ok: true,
      imported: participants.length,
      skipped: errors.length,
      sample: participants.slice(0, 5),
      errors: errors.slice(0, 20),
    });
  } catch (e) {
    console.error('Confirm import error', e);
    res.status(500).json({ error: 'import failed' });
  }
});

initData();

function getLocalIPv4s() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net && net.family === 'IPv4' && !net.internal) results.push(net.address);
    }
  }
  // unique
  return Array.from(new Set(results));
}

app.listen(PORT, () => {
  const ips = getLocalIPv4s();
  console.log(`Server listening:`);
  console.log(`- Local: http://127.0.0.1:${PORT}`);
  console.log(`- Local: http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`- LAN:   http://${ip}:${PORT}`));
  console.log('Browser Source URLs:');
  const baseHosts = ['127.0.0.1', 'localhost', ...ips];
  baseHosts.forEach(host => {
    console.log(`- Current: http://${host}:${PORT}/overlay.html?mode=current`);
    console.log(`- Next:    http://${host}:${PORT}/overlay.html?mode=next`);
  });
});
