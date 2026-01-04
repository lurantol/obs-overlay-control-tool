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

const app = express();
const PORT = 3000;

const dataDir = path.join(__dirname, 'data');
const outDir = path.join(__dirname, 'out');

const participantsPath = path.join(dataDir, 'participants.json');
const contestsPath = path.join(dataDir, 'contests.json');
const contestParticipantsPath = path.join(dataDir, 'contest-participants.json');
const roundsButtonsPath = path.join(dataDir, 'round-buttons.json');
const specialsPath = path.join(dataDir, 'specials.json');

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
  console.log(`Loaded ${participants.length} participants, ${contests.length} contests`);
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

function roleByNumber(number) {
  // Default rule: odd => lead, even => follow
  if (!Number.isFinite(number)) return 'unknown';
  return (number % 2 === 1) ? 'lead' : 'follow';
}

function findParticipant(number) {
  return participants.find(p => p.number === number);
}

function getParticipantsForContest(contestId) {
  const allowed = contestParticipants[contestId];
  if (!allowed || allowed.length === 0) return participants;
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

function parseParticipantsFromRows(rows, numberCol, nameCol) {
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
    parsed.push({ number: num, fullName, role: roleByNumber(num) });
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
  const { contestId, firstNumber, secondNumber } = req.body;
  if (!contestId) return res.status(400).json({ error: 'contestId required' });

  const contest = contestById(contestId);
  if (!contest) return res.status(400).json({ error: 'invalid contestId' });
  if (contest.type !== 'finals') return res.status(400).json({ error: 'contest is not finals type' });

  const a = findParticipant(Number(firstNumber));
  const b = findParticipant(Number(secondNumber));
  if (!a || !b) return res.status(400).json({ error: 'invalid participant numbers' });

  writeFile(currentTitleFile, buildTitle(contest.name, null, false));
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
  const { specialId, itemText } = req.body;
  if (!specialId) return res.status(400).json({ error: 'specialId required' });
  const s = specialById(specialId);
  if (!s) return res.status(400).json({ error: 'invalid specialId' });

  const list = Array.isArray(s.items) ? s.items : [];
  const chosen = String(itemText || '').trim();
  if (!chosen) return res.status(400).json({ error: 'itemText required' });
  // Guard against accidental mismatches
  if (!list.includes(chosen)) {
    return res.status(400).json({ error: 'itemText must be one of the Special items' });
  }

  writeFile(currentTitleFile, buildSpecialTitle(s.name));
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
    const { token, numberColumn, nameColumn } = req.body;
    if (!token || !numberColumn || !nameColumn) {
      return res.status(400).json({ error: 'token, numberColumn, nameColumn are required' });
    }

    const stash = importStash.get(token);
    if (!stash) return res.status(400).json({ error: 'invalid token (upload again)' });

    const headers = stash.headers;
    if (!headers.includes(numberColumn) || !headers.includes(nameColumn)) {
      return res.status(400).json({ error: 'selected columns not found in headers' });
    }

    const { finalList, errors } = parseParticipantsFromRows(stash.rows, numberColumn, nameColumn);

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
