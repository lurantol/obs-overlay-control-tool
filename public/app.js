const apiBase = '';

/** Tabs (top-level) */
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
  });
});

/** Subtabs inside Live */
const liveSubtabButtons = document.querySelectorAll('.live-subtab-btn');
const liveSubtabContents = document.querySelectorAll('.live-subtab-content');
liveSubtabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const sub = btn.dataset.subtab;
    liveSubtabButtons.forEach(b => b.classList.remove('active'));
    liveSubtabContents.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('live-subtab-' + sub).classList.add('active');
  });
});

/** Subtabs inside Admin */
const adminSubtabButtons = document.querySelectorAll('.admin-subtab-btn');
const adminSubtabContents = document.querySelectorAll('.admin-subtab-content');
adminSubtabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const sub = btn.dataset.subtab;
    adminSubtabButtons.forEach(b => b.classList.remove('active'));
    adminSubtabContents.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('admin-subtab-' + sub).classList.add('active');
  });
});

/** Helpers */
function setText(id, text) { document.getElementById(id).textContent = text || ''; }
function fullLabel(p) { return `${p.number} — ${p.fullName} [${p.role}]`; }
function parseCommaList(s) { return String(s || '').split(',').map(x => x.trim()).filter(Boolean); }
function parseTeamsList(s) {
  // allow comma-separated or newline-separated
  const raw = String(s || '').replace(/\r/g, '\n');
  return raw
    .split(/\n|,/)
    .map(x => x.trim())
    .filter(Boolean)
    .slice(0, 60);
}
function contestById(contestId, contestsAll) { return contestsAll.find(x => x.id === contestId); }

/** State */
let contestsAll = [];
let finalsContests = [];
let roundsContests = [];
let roundButtons = [];
let participants = [];

let roundsSelectedHit = null;
let nextSelectedHit = null;

let specialsAll = []; // [{id,name,info,teams:[...] }]
let specialEditId = null;

let importToken = null;

/** Elements */
const finalsContestSelect = document.getElementById('finals-contest-select');
const finalsFirst = document.getElementById('finals-first');
const finalsSecond = document.getElementById('finals-second');
const finalsPreview = document.getElementById('finals-preview');

const roundsContestSelect = document.getElementById('rounds-contest-select');
const roundsPreview = document.getElementById('rounds-preview');
const roundButtonsDiv = document.getElementById('round-buttons');

const nextContestSelect = document.getElementById('next-contest-select');
const nextPreview = document.getElementById('next-preview');
const nextRoundButtonsDiv = document.getElementById('next-round-buttons');
const nextHitRow = document.getElementById('next-hit-row');

// Live: Special
const specialSelect = document.getElementById('special-select');
const specialItemSelect = document.getElementById('special-item-select');
const specialPreview = document.getElementById('special-preview');

// Admin: Special
const specialNameInput = document.getElementById('special-name');
const specialTeamsTextarea = document.getElementById('special-teams');
const specialAddBtn = document.getElementById('special-add-btn');
const specialUpdateBtn = document.getElementById('special-update-btn');
const specialCancelEditBtn = document.getElementById('special-cancel-edit');
const specialListEl = document.getElementById('special-list');

const setupContestSelect = document.getElementById('setup-contest-select');
const setupLeadsDiv = document.getElementById('setup-leads');
const setupFollowsDiv = document.getElementById('setup-follows');

const newContestNameInput = document.getElementById('new-contest-name');
const newContestTypeSelect = document.getElementById('new-contest-type');
const addContestBtn = document.getElementById('add-contest-btn');
const contestListEl = document.getElementById('contest-list');

const roundButtonsInput = document.getElementById('round-buttons-input');
const saveRoundButtonsBtn = document.getElementById('save-round-buttons');

// Import UI
const importFileInput = document.getElementById('import-file');
const importPreviewBtn = document.getElementById('import-preview-btn');
const importConfirmBtn = document.getElementById('import-confirm-btn');
const importMappingDiv = document.getElementById('import-mapping');
const importNumberColSelect = document.getElementById('import-number-col');
const importNameColSelect = document.getElementById('import-name-col');
const importSamplePre = document.getElementById('import-sample');

/** Loaders */
async function loadContests() {
  const res = await fetch(apiBase + '/api/contests?type=all');
  contestsAll = await res.json();
  finalsContests = contestsAll.filter(c => c.type === 'finals');
  roundsContests = contestsAll.filter(c => c.type === 'rounds');
}

async function loadSpecials() {
  const res = await fetch(apiBase + '/api/specials');
  specialsAll = await res.json();
  if (!Array.isArray(specialsAll)) specialsAll = [];
}

function fillSelect(selectEl, list) {
  selectEl.innerHTML = '';
  list.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    selectEl.appendChild(opt);
  });
}

function fillContestList() {
  contestListEl.innerHTML = '';
  contestsAll.forEach(c => {
    const li = document.createElement('li');
    li.textContent = `${c.name} (${c.type})`;
    contestListEl.appendChild(li);
  });
}

function fillSpecialList() {
  specialListEl.innerHTML = '';
  specialsAll.forEach(s => {
    const li = document.createElement('li');
    const items = Array.isArray(s.items) ? s.items.join(' | ') : '';
    li.textContent = `${s.name}${items ? ' — ' + items : ''}`;

    const actions = document.createElement('div');
    actions.style.marginTop = '6px';

    const editBtn = document.createElement('button');
    editBtn.className = 'small-btn';
    editBtn.textContent = 'Редактировать';
    editBtn.addEventListener('click', () => beginEditSpecial(s.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'small-btn';
    delBtn.textContent = 'Удалить';
    delBtn.addEventListener('click', () => deleteSpecial(s.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    li.appendChild(actions);

    specialListEl.appendChild(li);
  });
}

async function loadRoundButtons() {
  const res = await fetch(apiBase + '/api/round-buttons');
  roundButtons = await res.json();
  if (!Array.isArray(roundButtons) || roundButtons.length === 0) roundButtons = ['Hit 1', 'Hit 2', 'Hit 3'];
  roundButtonsInput.value = roundButtons.join(', ');
}

async function loadParticipantsForContest(contestId) {
  const url = contestId ? `/api/participants?contestId=${encodeURIComponent(contestId)}` : '/api/participants';
  const res = await fetch(apiBase + url);
  participants = await res.json();
}

function renderRoundButtons(targetDiv, onSelect, selectedValue) {
  targetDiv.innerHTML = '';
  roundButtons.forEach(lbl => {
    const b = document.createElement('button');
    b.className = 'small-btn' + (selectedValue === lbl ? ' active' : '');
    b.textContent = lbl;
    b.addEventListener('click', () => onSelect(lbl));
    targetDiv.appendChild(b);
  });
}

function updateFinalsPreview() {
  const contestId = finalsContestSelect.value;
  const c = contestById(contestId, contestsAll);
  const a = participants.find(p => p.number === Number(finalsFirst.value));
  const b = participants.find(p => p.number === Number(finalsSecond.value));
  finalsPreview.textContent = (c && a && b) ? `${c.name}\n${a.fullName} — ${b.fullName}` : '';
}

function updateRoundsPreview() {
  const contestId = roundsContestSelect.value;
  const c = contestById(contestId, contestsAll);
  const hitPart = roundsSelectedHit ? ` • ${roundsSelectedHit}` : '';
  roundsPreview.textContent = c ? `${c.name}${hitPart}` : '';
}

function updateNextPreview() {
  const contestId = nextContestSelect.value;
  const c = contestById(contestId, contestsAll);
  if (!c) { nextPreview.textContent = ''; return; }
  const hit = (c.type === 'rounds') ? nextSelectedHit : null;
  const hitPart = hit ? ` • ${hit}` : '';
  nextPreview.textContent = `NEXT: ${c.name}${hitPart}`;
}

function specialById(id) { return specialsAll.find(x => x.id === id); }

function fillSpecialSelect() {
  specialSelect.innerHTML = '';
  specialsAll.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    specialSelect.appendChild(opt);
  });
}

function fillSpecialItemSelect(items) {
  if (!specialItemSelect) return;
  specialItemSelect.innerHTML = '';
  (items || []).forEach((txt, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = txt;
    specialItemSelect.appendChild(opt);
  });
}

function updateSpecialPreview() {
  const specialId = specialSelect.value;
  const s = specialById(specialId);
  if (!s) { specialPreview.textContent = ''; return; }
  const list = Array.isArray(s.items) ? s.items : [];
  const selectedIdx = specialItemSelect ? Number(specialItemSelect.value) : 0;
  const line = Number.isFinite(selectedIdx) ? (list[selectedIdx] || '') : '';
  specialPreview.textContent = line ? `${s.name}\n${line}` : `${s.name}`;
}

/** Live: Finals */
async function refreshFinals() {
  fillSelect(finalsContestSelect, finalsContests);
  if (finalsContests.length === 0) {
    setText('finals-status', 'Нет номинаций типа "Финалы". Добавь через Админ.');
    finalsFirst.innerHTML = ''; finalsSecond.innerHTML = '';
    return;
  }
  const contestId = finalsContestSelect.value || finalsContests[0].id;
  finalsContestSelect.value = contestId;

  await loadParticipantsForContest(contestId);

  finalsFirst.innerHTML = '';
  finalsSecond.innerHTML = '';
  participants.forEach(p => {
    const opt1 = document.createElement('option'); opt1.value = p.number; opt1.textContent = fullLabel(p);
    const opt2 = document.createElement('option'); opt2.value = p.number; opt2.textContent = fullLabel(p);
    finalsFirst.appendChild(opt1); finalsSecond.appendChild(opt2);
  });

  if (participants.length > 1) { finalsFirst.selectedIndex = 0; finalsSecond.selectedIndex = 1; }
  updateFinalsPreview();
  setText('finals-status', 'Готово');
}

document.getElementById('finals-apply').addEventListener('click', async () => {
  const contestId = finalsContestSelect.value;
  const firstNumber = Number(finalsFirst.value);
  const secondNumber = Number(finalsSecond.value);
  setText('finals-status', 'Применение...');
  try {
    const res = await fetch(apiBase + '/api/onair/finals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contestId, firstNumber, secondNumber })
    });
    const data = await res.json();
    if (!res.ok) { setText('finals-status', 'Ошибка: ' + (data.error || 'unknown')); return; }
    setText('finals-status', 'В эфире обновлено');
  } catch {
    setText('finals-status', 'Ошибка связи с сервером');
  }
});

finalsContestSelect.addEventListener('change', refreshFinals);
finalsFirst.addEventListener('change', updateFinalsPreview);
finalsSecond.addEventListener('change', updateFinalsPreview);

/** Live: Rounds */
async function refreshRounds() {
  fillSelect(roundsContestSelect, roundsContests);
  if (roundsContests.length === 0) {
    setText('rounds-status', 'Нет номинаций типа "Отборы". Добавь через Админ.');
    roundButtonsDiv.innerHTML = '';
    return;
  }
  const contestId = roundsContestSelect.value || roundsContests[0].id;
  roundsContestSelect.value = contestId;

  const onSelect = (lbl) => {
    roundsSelectedHit = lbl;
    renderRoundButtons(roundButtonsDiv, onSelect, roundsSelectedHit);
    updateRoundsPreview();
  };
  renderRoundButtons(roundButtonsDiv, onSelect, roundsSelectedHit);

  updateRoundsPreview();
  setText('rounds-status', 'Готово');
}

document.getElementById('rounds-apply').addEventListener('click', async () => {
  const contestId = roundsContestSelect.value;
  setText('rounds-status', 'Применение...');
  try {
    const res = await fetch(apiBase + '/api/onair/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contestId, hitLabel: roundsSelectedHit })
    });
    const data = await res.json();
    if (!res.ok) { setText('rounds-status', 'Ошибка: ' + (data.error || 'unknown')); return; }
    setText('rounds-status', 'В эфире обновлено (пара очищена)');
  } catch {
    setText('rounds-status', 'Ошибка связи с сервером');
  }
});

roundsContestSelect.addEventListener('change', refreshRounds);

/** Live: NEXT */
async function refreshNext() {
  fillSelect(nextContestSelect, contestsAll);
  if (contestsAll.length === 0) { setText('next-status', 'Нет номинаций. Добавь через Админ.'); return; }

  const contestId = nextContestSelect.value || contestsAll[0].id;
  nextContestSelect.value = contestId;

  const c = contestById(contestId, contestsAll);
  const isRounds = c && c.type === 'rounds';
  nextHitRow.style.display = isRounds ? 'block' : 'none';

  const onSelect = (lbl) => {
    nextSelectedHit = lbl;
    renderRoundButtons(nextRoundButtonsDiv, onSelect, nextSelectedHit);
    updateNextPreview();
  };
  renderRoundButtons(nextRoundButtonsDiv, onSelect, nextSelectedHit);

  updateNextPreview();
  setText('next-status', 'Готово');
}

/** Live: Special */
async function refreshSpecial() {
  fillSpecialSelect();
  if (specialsAll.length === 0) {
    setText('special-status', 'Нет Special. Добавь в Админ -> Special.');
    if (specialItemSelect) specialItemSelect.innerHTML = '';
    specialPreview.textContent = '';
    return;
  }
  const specialId = specialSelect.value || specialsAll[0].id;
  specialSelect.value = specialId;
  const s = specialById(specialId);
  const list = (s && Array.isArray(s.items)) ? s.items : [];
  fillSpecialItemSelect(list);
  if (specialItemSelect && specialItemSelect.options.length > 0) specialItemSelect.selectedIndex = 0;
  updateSpecialPreview();
  setText('special-status', 'Готово');
}

specialSelect.addEventListener('change', refreshSpecial);

if (specialItemSelect) {
  specialItemSelect.addEventListener('change', updateSpecialPreview);
}

document.getElementById('special-apply').addEventListener('click', async () => {
  const specialId = specialSelect.value;
  const selectedIdx = specialItemSelect ? Number(specialItemSelect.value) : 0;
  setText('special-status', 'Применение...');
  try {
    const s = specialById(specialId);
    const list = (s && Array.isArray(s.items)) ? s.items : [];
    const itemText = Number.isFinite(selectedIdx) ? (list[selectedIdx] || '') : '';
    const res = await fetch(apiBase + '/api/onair/special', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specialId, itemText })
    });
    const data = await res.json();
    if (!res.ok) { setText('special-status', 'Ошибка: ' + (data.error || 'unknown')); return; }
    setText('special-status', 'В эфире обновлено');
  } catch {
    setText('special-status', 'Ошибка связи с сервером');
  }
});

nextContestSelect.addEventListener('change', refreshNext);

document.getElementById('next-apply').addEventListener('click', async () => {
  const contestId = nextContestSelect.value;
  const c = contestById(contestId, contestsAll);
  const hitLabel = (c && c.type === 'rounds') ? nextSelectedHit : null;
  setText('next-status', 'Применение...');
  try {
    const res = await fetch(apiBase + '/api/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contestId, hitLabel })
    });
    const data = await res.json();
    if (!res.ok) { setText('next-status', 'Ошибка: ' + (data.error || 'unknown')); return; }
    setText('next-status', 'NEXT обновлён');
  } catch {
    setText('next-status', 'Ошибка связи с сервером');
  }
});

/** Resets */
async function resetOnAir() {
  try {
    const res = await fetch(apiBase + '/api/reset/onair', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) return;
    setText('finals-status', 'Эфир сброшен');
    setText('rounds-status', 'Эфир сброшен');
    setText('special-status', 'Эфир сброшен');
  } catch {}
}
async function resetNext() {
  try {
    const res = await fetch(apiBase + '/api/reset/next', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) return;
    setText('next-status', 'NEXT сброшен');
  } catch {}
}
document.getElementById('onair-reset').addEventListener('click', resetOnAir);
document.getElementById('onair-reset-2').addEventListener('click', resetOnAir);
document.getElementById('onair-reset-3').addEventListener('click', resetOnAir);
document.getElementById('next-reset').addEventListener('click', resetNext);

/** Setup (contest participants subset) */
async function loadAllParticipantsForSetup() {
  const res = await fetch(apiBase + '/api/participants');
  return await res.json();
}

async function refreshSetup() {
  fillSelect(setupContestSelect, contestsAll);
  const all = await loadAllParticipantsForSetup();
  setupLeadsDiv.innerHTML = '';
  setupFollowsDiv.innerHTML = '';

  const leads = all.filter(p => p.role === 'lead');
  const follows = all.filter(p => p.role === 'follow');

  leads.forEach(p => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = p.number;
    label.appendChild(cb);
    label.append(` ${p.number} — ${p.fullName}`);
    setupLeadsDiv.appendChild(label);
    setupLeadsDiv.appendChild(document.createElement('br'));
  });

  follows.forEach(p => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = p.number;
    label.appendChild(cb);
    label.append(` ${p.number} — ${p.fullName}`);
    setupFollowsDiv.appendChild(label);
    setupFollowsDiv.appendChild(document.createElement('br'));
  });

  setText('status-setup', 'Отметь участников для выбранного конкурса и нажми "Сохранить".');
}

document.getElementById('save-contest-btn').addEventListener('click', async () => {
  const contestId = setupContestSelect.value;
  const nums = [];
  setupLeadsDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => nums.push(Number(cb.value)));
  setupFollowsDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => nums.push(Number(cb.value)));

  setText('status-setup', 'Сохранение...');
  try {
    const res = await fetch(apiBase + '/api/contest-participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contestId, participantNumbers: nums })
    });
    const data = await res.json();
    if (!res.ok) { setText('status-setup', 'Ошибка: ' + (data.error || 'unknown')); return; }
    setText('status-setup', 'Состав сохранён');
  } catch {
    setText('status-setup', 'Ошибка связи с сервером');
  }
});

/** Admin: add contest */
addContestBtn.addEventListener('click', async () => {
  const name = newContestNameInput.value.trim();
  const type = newContestTypeSelect.value;
  if (!name) { setText('status-admin', 'Введите название'); return; }
  setText('status-admin', 'Добавление...');
  try {
    const res = await fetch(apiBase + '/api/contests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type })
    });
    const data = await res.json();
    if (!res.ok) { setText('status-admin', 'Ошибка: ' + (data.error || 'unknown')); return; }
    setText('status-admin', 'Добавлено');
    newContestNameInput.value = '';
    await fullRefresh();
  } catch {
    setText('status-admin', 'Ошибка связи с сервером');
  }
});

/** Admin: Special */
function setSpecialEditMode(enabled) {
  specialAddBtn.disabled = enabled;
  specialUpdateBtn.disabled = !enabled;
  specialCancelEditBtn.disabled = !enabled;
}

function clearSpecialForm() {
  specialNameInput.value = '';
  specialTeamsTextarea.value = '';
  specialEditId = null;
  setSpecialEditMode(false);
}

function beginEditSpecial(id) {
  const s = specialById(id);
  if (!s) return;
  specialEditId = id;
  specialNameInput.value = s.name || '';
  specialTeamsTextarea.value = Array.isArray(s.items) ? s.items.join('\n') : '';
  setText('special-admin-status', 'Режим редактирования');
  setSpecialEditMode(true);
}

async function deleteSpecial(id) {
  setText('special-admin-status', 'Удаление...');
  try {
    const res = await fetch(apiBase + '/api/specials/' + encodeURIComponent(id), { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { setText('special-admin-status', 'Ошибка: ' + (data.error || 'unknown')); return; }
    setText('special-admin-status', 'Удалено');
    if (specialEditId === id) clearSpecialForm();
    await loadSpecials();
    fillSpecialList();
    await refreshSpecial();
  } catch {
    setText('special-admin-status', 'Ошибка связи с сервером');
  }
}

specialAddBtn.addEventListener('click', async () => {
  const name = specialNameInput.value.trim();
  const items = parseTeamsList(specialTeamsTextarea.value);
  if (!name) { setText('special-admin-status', 'Введите название'); return; }
  if (items.length < 1) { setText('special-admin-status', 'Нужно хотя бы 1 участник/команда'); return; }
  setText('special-admin-status', 'Добавление...');
  try {
    const res = await fetch(apiBase + '/api/specials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, items })
    });
    const data = await res.json();
    if (!res.ok) { setText('special-admin-status', 'Ошибка: ' + (data.error || 'unknown')); return; }
    setText('special-admin-status', 'Добавлено');
    clearSpecialForm();
    await loadSpecials();
    fillSpecialList();
    await refreshSpecial();
  } catch {
    setText('special-admin-status', 'Ошибка связи с сервером');
  }
});

specialUpdateBtn.addEventListener('click', async () => {
  if (!specialEditId) return;
  const name = specialNameInput.value.trim();
  const items = parseTeamsList(specialTeamsTextarea.value);
  if (!name) { setText('special-admin-status', 'Введите название'); return; }
  if (items.length < 1) { setText('special-admin-status', 'Нужно хотя бы 1 участник/команда'); return; }
  setText('special-admin-status', 'Сохранение...');
  try {
    const res = await fetch(apiBase + '/api/specials/' + encodeURIComponent(specialEditId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, items })
    });
    const data = await res.json();
    if (!res.ok) { setText('special-admin-status', 'Ошибка: ' + (data.error || 'unknown')); return; }
    setText('special-admin-status', 'Сохранено');
    clearSpecialForm();
    await loadSpecials();
    fillSpecialList();
    await refreshSpecial();
  } catch {
    setText('special-admin-status', 'Ошибка связи с сервером');
  }
});

specialCancelEditBtn.addEventListener('click', () => {
  clearSpecialForm();
  setText('special-admin-status', '');
});

/** Admin: import participants (preview -> mapping -> confirm) */
importPreviewBtn.addEventListener('click', async () => {
  const file = importFileInput.files[0];
  if (!file) { setText('import-status', 'Выбери файл CSV/XLS/XLSX'); return; }

  setText('import-status', 'Загрузка файла...');
  importMappingDiv.classList.add('hidden');
  importToken = null;

  const form = new FormData();
  form.append('file', file);

  try {
    const res = await fetch(apiBase + '/api/import/participants/preview', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) { setText('import-status', 'Ошибка: ' + (data.error || 'unknown')); return; }

    importToken = data.token;
    const headers = data.headers || [];

    importNumberColSelect.innerHTML = '';
    importNameColSelect.innerHTML = '';
    headers.forEach(h => {
      const o1 = document.createElement('option'); o1.value = h; o1.textContent = h;
      const o2 = document.createElement('option'); o2.value = h; o2.textContent = h;
      importNumberColSelect.appendChild(o1);
      importNameColSelect.appendChild(o2);
    });

    // try to preselect common names
    const preferNumber = ['Bib','BIB','Number','№','No','Bib Number'];
    const preferName = ['B C','Name','FullName','Full Name','Competitor','Participant'];
    const pick = (select, prefs) => {
      const opts = Array.from(select.options).map(o=>o.value);
      const found = prefs.find(p => opts.includes(p));
      if (found) select.value = found;
    };
    pick(importNumberColSelect, preferNumber);
    pick(importNameColSelect, preferName);

    importSamplePre.textContent = JSON.stringify(data.sample || [], null, 2);
    importMappingDiv.classList.remove('hidden');
    setText('import-status', 'Выбери колонки и нажми "Импортировать"');
  } catch {
    setText('import-status', 'Ошибка связи с сервером');
  }
});

importConfirmBtn.addEventListener('click', async () => {
  if (!importToken) { setText('import-status', 'Сначала загрузи файл (превью)'); return; }

  const numberColumn = importNumberColSelect.value;
  const nameColumn = importNameColSelect.value;
  if (!numberColumn || !nameColumn) { setText('import-status', 'Выбери колонки'); return; }

  setText('import-status', 'Импорт...');
  try {
    const res = await fetch(apiBase + '/api/import/participants/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: importToken, numberColumn, nameColumn })
    });
    const data = await res.json();
    if (!res.ok) { setText('import-status', 'Ошибка: ' + (data.error || 'unknown')); return; }

    setText('import-status', `Импортировано: ${data.imported}, пропущено: ${data.skipped}`);
    importToken = null;
    importMappingDiv.classList.add('hidden');
    await fullRefresh();
  } catch {
    setText('import-status', 'Ошибка связи с сервером');
  }
});

/** Admin: save round buttons */
saveRoundButtonsBtn.addEventListener('click', async () => {
  const buttons = parseCommaList(roundButtonsInput.value);
  setText('round-buttons-status', 'Сохранение...');
  try {
    const res = await fetch(apiBase + '/api/round-buttons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buttons })
    });
    const data = await res.json();
    if (!res.ok) { setText('round-buttons-status', 'Ошибка: ' + (data.error || 'unknown')); return; }
    setText('round-buttons-status', 'Сохранено');
    await loadRoundButtons();
    await refreshRounds();
    await refreshNext();
  } catch {
    setText('round-buttons-status', 'Ошибка связи с сервером');
  }
});

async function fullRefresh() {
  await loadContests();
  await loadRoundButtons();
  await loadSpecials();

  fillContestList();
  fillSpecialList();

  await refreshFinals();
  await refreshRounds();
  await refreshSpecial();
  await refreshNext();
  await refreshSetup();
}

// Init
(async function init() {
  await fullRefresh();
})();
