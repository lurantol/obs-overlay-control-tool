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

// "HEAT" is the correct term for rounds in competitions (not "HEAT")
let roundsSelectedHeat = null;
let nextSelectedHeat = null;

let specialsAll = []; // [{id,name,info,teams:[...] }]
let specialEditId = null;

let importToken = null;

/** Elements */
const finalsContestSelect = document.getElementById('finals-contest-select');
const finalsFirst = document.getElementById('finals-first');
const finalsSecond = document.getElementById('finals-second');
const finalsNoPair = document.getElementById('finals-no-pair');
const finalsPreview = document.getElementById('finals-preview');

const roundsContestSelect = document.getElementById('rounds-contest-select');
const roundsPreview = document.getElementById('rounds-preview');
const roundButtonsDiv = document.getElementById('round-buttons');
const roundsClearHeatBtn = document.getElementById('rounds-clear-heat');

const nextContestSelect = document.getElementById('next-contest-select');
const nextPreview = document.getElementById('next-preview');
const nextRoundButtonsDiv = document.getElementById('next-round-buttons');
const nextHeatRow = document.getElementById('next-heat-row');
const nextClearHeatBtn = document.getElementById('next-clear-heat');

// Service links (Browser Source)
const serviceCurrentUrlInput = document.getElementById('service-current-url');
const serviceNextUrlInput = document.getElementById('service-next-url');
const copyCurrentUrlBtn = document.getElementById('copy-current-url');
const copyNextUrlBtn = document.getElementById('copy-next-url');

// Overlay settings UI (Browser Overlay appearance)
const overlayTitleFontSelect = document.getElementById('overlay-title-font');
const overlayPairFontSelect = document.getElementById('overlay-pair-font');
const overlayFontUploadInput = document.getElementById('overlay-font-upload');
const overlayFontUploadBtn = document.getElementById('overlay-font-upload-btn');
const overlayPreviewFrame = document.getElementById('overlay-preview');
const overlayTitleSizeInput = document.getElementById('overlay-title-size');
const overlayPairSizeInput = document.getElementById('overlay-pair-size');
const overlayTitleColorInput = document.getElementById('overlay-title-color');
const overlayPairColorInput = document.getElementById('overlay-pair-color');
const overlayTitleAnimSelect = document.getElementById("overlay-title-anim");
const overlayTitleAnimMsInput = document.getElementById("overlay-title-anim-ms");
const overlayLeaderAnimSelect = document.getElementById("overlay-leader-anim");
const overlayLeaderAnimMsInput = document.getElementById("overlay-leader-anim-ms");
const overlayFollowerAnimSelect = document.getElementById("overlay-follower-anim");
const overlayFollowerAnimMsInput = document.getElementById("overlay-follower-anim-ms");

const presetSelect = document.getElementById("preset-select");
const presetNameInput = document.getElementById("preset-name");
const presetSaveBtn = document.getElementById("preset-save");
const presetApplyBtn = document.getElementById("preset-apply");
const presetDeleteBtn = document.getElementById("preset-delete");

const overlaySaveBtn = document.getElementById('overlay-save');
const overlayStatusEl = document.getElementById('overlay-status');

// Live: Special
const specialSelect = document.getElementById('special-select');
const specialItemSelect = document.getElementById('special-item-select');
const specialPreview = document.getElementById('special-preview');
const specialNoPair = document.getElementById('special-no-pair');

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
const importLeaderOdd = document.getElementById('import-leader-odd');
const importLeaderEven = document.getElementById('import-leader-even');
function importLeaderParity() {
  return (importLeaderEven && importLeaderEven.checked) ? 'even' : 'odd';
}
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

// Fill a <select> with contests and preserve selection when possible.
// Some browsers reset the selected value to the first option when we rebuild
// the option list, which makes it look like the contest "cannot be selected".
function fillSelect(selectEl, list, preferredValue) {
  if (!selectEl) return;
  const current = (preferredValue !== undefined) ? preferredValue : selectEl.value;
  selectEl.innerHTML = '';
  list.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    selectEl.appendChild(opt);
  });
  // Restore selection if the option still exists.
  if (current) {
    const exists = Array.from(selectEl.options).some(o => o.value === current);
    if (exists) selectEl.value = current;
  }
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
  if (!Array.isArray(roundButtons) || roundButtons.length === 0) roundButtons = ['Heat 1', 'Heat 2', 'Heat 3', 'Heat 4'];
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
  const noPair = finalsNoPair && finalsNoPair.checked;
  if (!c) { finalsPreview.textContent = ''; return; }
  if (noPair) {
    finalsPreview.textContent = `${c.name}`;
    return;
  }
  const a = participants.find(p => p.number === Number(finalsFirst.value));
  const b = participants.find(p => p.number === Number(finalsSecond.value));
  finalsPreview.textContent = (a && b) ? `${c.name}
${a.fullName} — ${b.fullName}` : `${c.name}`;
}

function updateRoundsPreview() {
  const contestId = roundsContestSelect.value;
  const c = contestById(contestId, contestsAll);
  const heatPart = roundsSelectedHeat ? ` • ${roundsSelectedHeat}` : '';
  roundsPreview.textContent = c ? `${c.name}${heatPart}` : '';
}

function updateNextPreview() {
  const contestId = nextContestSelect.value;
  const c = contestById(contestId, contestsAll);
  if (!c) { nextPreview.textContent = ''; return; }
  const heat = (c.type === 'rounds') ? nextSelectedHeat : null;
  const heatPart = heat ? ` • ${heat}` : '';
  nextPreview.textContent = `NEXT: ${c.name}${heatPart}`;
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
  const noPair = specialNoPair && specialNoPair.checked;
  if (noPair) {
    specialPreview.textContent = `${s.name}`;
    return;
  }
  const list = Array.isArray(s.items) ? s.items : [];
  const selectedIdx = specialItemSelect ? Number(specialItemSelect.value) : 0;
  const line = Number.isFinite(selectedIdx) ? (list[selectedIdx] || '') : '';
  specialPreview.textContent = line ? `${s.name}
${line}` : `${s.name}`;
}

/** Service links (Browser Source) */
function fillServiceLinks() {
  if (!serviceCurrentUrlInput || !serviceNextUrlInput) return;
  const origin = window.location.origin;
  serviceCurrentUrlInput.value = `${origin}/overlay.html?mode=current`;
  serviceNextUrlInput.value = `${origin}/overlay.html?mode=next`;
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  // Fallback (some browsers / insecure contexts)
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch {}
  document.body.removeChild(ta);
  return true;
}

if (copyCurrentUrlBtn) {
  copyCurrentUrlBtn.addEventListener('click', async () => {
    const ok = await copyToClipboard(serviceCurrentUrlInput?.value || '');
    if (ok) copyCurrentUrlBtn.textContent = 'Скопировано';
    setTimeout(() => { copyCurrentUrlBtn.textContent = 'Копировать'; }, 800);
  });
}

if (copyNextUrlBtn) {
  copyNextUrlBtn.addEventListener('click', async () => {
    const ok = await copyToClipboard(serviceNextUrlInput?.value || '');
    if (ok) copyNextUrlBtn.textContent = 'Скопировано';
    setTimeout(() => { copyNextUrlBtn.textContent = 'Копировать'; }, 800);
  });
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

  if (!Array.isArray(participants) || participants.length === 0) {
    finalsFirst.innerHTML = '';
    finalsSecond.innerHTML = '';
    finalsPreview.textContent = '';
    setText('finals-status', 'В этом конкурсе пока не выбраны участники (Админ → Настройки конкурса).');
    return;
  }

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
      body: JSON.stringify({ contestId, firstNumber, secondNumber, noPair: !!(finalsNoPair && finalsNoPair.checked) })
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
if (finalsNoPair) finalsNoPair.addEventListener('change', updateFinalsPreview);

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
    roundsSelectedHeat = lbl;
    renderRoundButtons(roundButtonsDiv, onSelect, roundsSelectedHeat);
    updateRoundsPreview();
  };
  renderRoundButtons(roundButtonsDiv, onSelect, roundsSelectedHeat);

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
      body: JSON.stringify({ contestId, heatLabel: roundsSelectedHeat })
    });
    const data = await res.json();
    if (!res.ok) { setText('rounds-status', 'Ошибка: ' + (data.error || 'unknown')); return; }
    setText('rounds-status', 'В эфире обновлено (пара очищена)');
  } catch {
    setText('rounds-status', 'Ошибка связи с сервером');
  }
});

roundsContestSelect.addEventListener('change', refreshRounds);

if (roundsClearHeatBtn) {
  roundsClearHeatBtn.addEventListener('click', () => {
    roundsSelectedHeat = null;
    refreshRounds();
  });
}

/** Live: NEXT */
async function refreshNext() {
  fillSelect(nextContestSelect, contestsAll);
  if (contestsAll.length === 0) { setText('next-status', 'Нет номинаций. Добавь через Админ.'); return; }

  const contestId = nextContestSelect.value || contestsAll[0].id;
  nextContestSelect.value = contestId;

  const c = contestById(contestId, contestsAll);
  const isRounds = c && c.type === 'rounds';
  nextHeatRow.style.display = isRounds ? 'block' : 'none';

  const onSelect = (lbl) => {
    nextSelectedHeat = lbl;
    renderRoundButtons(nextRoundButtonsDiv, onSelect, nextSelectedHeat);
    updateNextPreview();
  };
  renderRoundButtons(nextRoundButtonsDiv, onSelect, nextSelectedHeat);

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
if (specialNoPair) specialNoPair.addEventListener('change', updateSpecialPreview);
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
      body: JSON.stringify({ specialId, itemText, noPair: !!(specialNoPair && specialNoPair.checked) })
    });
    const data = await res.json();
    if (!res.ok) { setText('special-status', 'Ошибка: ' + (data.error || 'unknown')); return; }
    setText('special-status', 'В эфире обновлено');
  } catch {
    setText('special-status', 'Ошибка связи с сервером');
  }
});

nextContestSelect.addEventListener('change', refreshNext);

if (nextClearHeatBtn) {
  nextClearHeatBtn.addEventListener('click', () => {
    nextSelectedHeat = null;
    refreshNext();
  });
}

document.getElementById('next-apply').addEventListener('click', async () => {
  const contestId = nextContestSelect.value;
  const c = contestById(contestId, contestsAll);
  const heatLabel = (c && c.type === 'rounds') ? nextSelectedHeat : null;
  setText('next-status', 'Применение...');
  try {
    const res = await fetch(apiBase + '/api/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contestId, heatLabel })
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

  // Load already saved subset for selected contest (if any)
  const contestId = setupContestSelect.value || (contestsAll[0] && contestsAll[0].id);
  if (contestId) setupContestSelect.value = contestId;
  let savedSet = null; // null = not set yet
  try {
    const r = await fetch(apiBase + `/api/contest-participants?contestId=${encodeURIComponent(contestId)}`, { cache: 'no-store' });
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d.participantNumbers)) savedSet = new Set(d.participantNumbers.map(Number));
    }
  } catch {}

  const leads = all.filter(p => p.role === 'lead');
  const follows = all.filter(p => p.role === 'follow');

  leads.forEach(p => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = p.number;
    if (savedSet && savedSet.has(p.number)) cb.checked = true;
    label.appendChild(cb);
    label.append(` ${p.number} — ${p.fullName}`);
    setupLeadsDiv.appendChild(label);
    setupLeadsDiv.appendChild(document.createElement('br'));
  });

  follows.forEach(p => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = p.number;
    if (savedSet && savedSet.has(p.number)) cb.checked = true;
    label.appendChild(cb);
    label.append(` ${p.number} — ${p.fullName}`);
    setupFollowsDiv.appendChild(label);
    setupFollowsDiv.appendChild(document.createElement('br'));
  });

  if (savedSet === null) {
    setText('status-setup', 'Не удалось загрузить состав конкурса (ошибка связи).');
  } else if (savedSet.size === 0) {
    setText('status-setup', 'Состав конкурса пустой: в эфире список участников будет ПУСТЫМ. Отметь участников и нажми "Сохранить".');
  } else {
    setText('status-setup', `Состав конкурса загружен: выбрано ${savedSet.size}. Можно изменить и нажать "Сохранить".`);
  }
}

// Refresh setup when contest changes
if (setupContestSelect) setupContestSelect.addEventListener('change', refreshSetup);

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
      body: JSON.stringify({ token: importToken, numberColumn, nameColumn, leaderParity: importLeaderParity() })
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

/** Browser Overlay appearance settings */
async function loadOverlayFontsUI() {
  if (!overlayTitleFontSelect || !overlayPairFontSelect) return;
  try {
    const res = await fetch(apiBase + '/api/fonts', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const fonts = Array.isArray(data.fonts) ? data.fonts : [];

    function fillSelect(select) {
      const current = select.value;
      select.innerHTML = '';
      for (const f of fonts) {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        // Lightweight preview inside the dropdown
        opt.style.fontFamily = f;
        select.appendChild(opt);
      }
      if (current && fonts.includes(current)) select.value = current;
    }

    fillSelect(overlayTitleFontSelect);
    fillSelect(overlayPairFontSelect);
  } catch {
    // ignore
  }
}

async function loadOverlaySettingsUI() {
  if (!overlayTitleFontSelect || !overlayPairFontSelect) return;
  try {
    const res = await fetch(apiBase + '/api/overlay-settings', { cache: 'no-store' });
    if (!res.ok) return;
    const s = await res.json();

    const titleFont = String(s.titleFontFamily || 'system-ui');
    const pairFont = String(s.pairFontFamily || 'system-ui');

    // If the saved font isn't in the dropdown list (e.g. old config), add it.
    function ensureOption(select, value) {
      if (!value) return;
      const exists = Array.from(select.options).some(o => o.value === value);
      if (!exists) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        opt.style.fontFamily = value;
        select.appendChild(opt);
      }
    }
    ensureOption(overlayTitleFontSelect, titleFont);
    ensureOption(overlayPairFontSelect, pairFont);

    overlayTitleFontSelect.value = titleFont;
    overlayPairFontSelect.value = pairFont;
    overlayTitleSizeInput.value = Number(s.titleSizePx || 48);
    overlayPairSizeInput.value = Number(s.pairSizePx || 40);
    overlayTitleColorInput.value = String(s.titleColor || '#ffffff');
    overlayPairColorInput.value = String(s.pairColor || '#ffffff');
    if (overlayTitleAnimSelect) overlayTitleAnimSelect.value = String(s.titleAnimType || "none");
    if (overlayTitleAnimMsInput) overlayTitleAnimMsInput.value = Number(s.titleAnimMs ?? 500);
    if (overlayLeaderAnimSelect) overlayLeaderAnimSelect.value = String(s.leaderAnimType || "none");
    if (overlayLeaderAnimMsInput) overlayLeaderAnimMsInput.value = Number(s.leaderAnimMs ?? 500);
    if (overlayFollowerAnimSelect) overlayFollowerAnimSelect.value = String(s.followerAnimType || "none");
    if (overlayFollowerAnimMsInput) overlayFollowerAnimMsInput.value = Number(s.followerAnimMs ?? 500);

    setText('overlay-status', '');
  } catch {
    setText('overlay-status', 'Ошибка связи с сервером');
  }
}

if (overlaySaveBtn) {
  overlaySaveBtn.addEventListener('click', async () => {
    setText('overlay-status', 'Сохранение...');
    try {
      const payload = {
        titleFontFamily: overlayTitleFontSelect.value,
        pairFontFamily: overlayPairFontSelect.value,
        titleSizePx: Number(overlayTitleSizeInput.value),
        pairSizePx: Number(overlayPairSizeInput.value),
        titleColor: overlayTitleColorInput.value,
        pairColor: overlayPairColorInput.value,
        titleAnimType: overlayTitleAnimSelect ? overlayTitleAnimSelect.value : "none",
        titleAnimMs: overlayTitleAnimMsInput ? Number(overlayTitleAnimMsInput.value) : 500,
        leaderAnimType: overlayLeaderAnimSelect ? overlayLeaderAnimSelect.value : "none",
        leaderAnimMs: overlayLeaderAnimMsInput ? Number(overlayLeaderAnimMsInput.value) : 500,
        followerAnimType: overlayFollowerAnimSelect ? overlayFollowerAnimSelect.value : "none",
        followerAnimMs: overlayFollowerAnimMsInput ? Number(overlayFollowerAnimMsInput.value) : 500,

      };

      const res = await fetch(apiBase + '/api/overlay-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) { setText('overlay-status', 'Ошибка: ' + (data.error || 'unknown')); return; }
      setText('overlay-status', 'Сохранено. OBS Browser Source обновит стиль автоматически.');
      await loadOverlaySettingsUI();

      // Force refresh preview iframe immediately
      if (overlayPreviewFrame) {
        const base = '/overlay.html?mode=current&preview=1&hideEmpty=0';
        overlayPreviewFrame.src = base + `&t=${Date.now()}`;
      }
    } catch {
      setText('overlay-status', 'Ошибка связи с сервером');
    }
  });
}

if (overlayFontUploadBtn) {
  overlayFontUploadBtn.addEventListener('click', async () => {
    if (!overlayFontUploadInput || !overlayFontUploadInput.files || overlayFontUploadInput.files.length === 0) {
      setText('overlay-status', 'Выбери файл шрифта для загрузки');
      return;
    }
    const file = overlayFontUploadInput.files[0];
    setText('overlay-status', 'Загрузка шрифта...');
    try {
      const fd = new FormData();
      fd.append('font', file);
      const res = await fetch(apiBase + '/api/fonts/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setText('overlay-status', 'Ошибка: ' + (data.error || 'upload failed'));
        return;
      }
      await loadOverlayFontsUI();
      // Auto-select uploaded font for both dropdowns (user can change later)
      if (data.font && data.font.name) {
        overlayTitleFontSelect.value = data.font.name;
        overlayPairFontSelect.value = data.font.name;
      }
      setText('overlay-status', 'Шрифт загружен. Не забудь нажать «Сохранить настройки»');
    } catch {
      setText('overlay-status', 'Ошибка связи с сервером');
    }
  });
}

// Presets UI (Stage 5)
async function loadPresetsUI() {
  if (!presetSelect) return;
  try {
    const res = await fetch(apiBase + "/api/presets", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const list = Array.isArray(data.presets) ? data.presets : [];
    const current = presetSelect.value;
    presetSelect.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "—";
    presetSelect.appendChild(empty);
    for (const p of list) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      presetSelect.appendChild(opt);
    }
    if (current) presetSelect.value = current;
  } catch { /* ignore */ }
}

async function createPresetFromCurrent() {
  const name = String(presetNameInput?.value || "").trim();
  if (!name) { setText("overlay-status", "Введите имя пресета"); return; }
  const settings = {
    titleFontFamily: overlayTitleFontSelect?.value || "system-ui",
    pairFontFamily: overlayPairFontSelect?.value || "system-ui",
    titleSizePx: Number(overlayTitleSizeInput?.value || 48),
    pairSizePx: Number(overlayPairSizeInput?.value || 40),
    titleColor: overlayTitleColorInput?.value || "#ffffff",
    pairColor: overlayPairColorInput?.value || "#ffffff",
    titleAnimType: overlayTitleAnimSelect ? overlayTitleAnimSelect.value : "none",
    titleAnimMs: overlayTitleAnimMsInput ? Number(overlayTitleAnimMsInput.value) : 500,
    leaderAnimType: overlayLeaderAnimSelect ? overlayLeaderAnimSelect.value : "none",
    leaderAnimMs: overlayLeaderAnimMsInput ? Number(overlayLeaderAnimMsInput.value) : 500,
    followerAnimType: overlayFollowerAnimSelect ? overlayFollowerAnimSelect.value : "none",
    followerAnimMs: overlayFollowerAnimMsInput ? Number(overlayFollowerAnimMsInput.value) : 500
  };

  setText("overlay-status", "Сохранение пресета...");
  try {
    const res = await fetch(apiBase + "/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, settings })
    });
    const data = await res.json();
    if (!res.ok) { setText("overlay-status", "Ошибка: " + (data.error || "unknown")); return; }
    setText("overlay-status", "Пресет сохранён");
    if (presetNameInput) presetNameInput.value = "";
    await loadPresetsUI();
  } catch {
    setText("overlay-status", "Ошибка связи с сервером");
  }
}

async function applyPreset() {
  const id = String(presetSelect?.value || "");
  if (!id) { setText("overlay-status", "Выберите пресет"); return; }
  setText("overlay-status", "Применение пресета...");
  try {
    const res = await fetch(apiBase + "/api/presets/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (!res.ok) { setText("overlay-status", "Ошибка: " + (data.error || "unknown")); return; }
    setText("overlay-status", "Пресет применён. Нажмите «Сохранить настройки», чтобы закрепить (или продолжайте работать)." );
    await loadOverlaySettingsUI();
    if (overlayPreviewFrame) overlayPreviewFrame.src = "/overlay.html?mode=current&preview=1&hideEmpty=0&t=" + Date.now();
  } catch {
    setText("overlay-status", "Ошибка связи с сервером");
  }
}

async function deletePreset() {
  const id = String(presetSelect?.value || "");
  if (!id) { setText("overlay-status", "Выберите пресет"); return; }
  if (!confirm("Удалить пресет?")) return;
  try {
    const res = await fetch(apiBase + "/api/presets/" + encodeURIComponent(id), { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setText("overlay-status", "Ошибка: " + (data.error || "unknown")); return; }
    setText("overlay-status", "Пресет удалён");
    await loadPresetsUI();
  } catch {
    setText("overlay-status", "Ошибка связи с сервером");
  }
}

if (presetSaveBtn) presetSaveBtn.addEventListener("click", createPresetFromCurrent);
if (presetApplyBtn) presetApplyBtn.addEventListener("click", applyPreset);
if (presetDeleteBtn) presetDeleteBtn.addEventListener("click", deletePreset);

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
  await loadOverlayFontsUI();
  await loadOverlaySettingsUI();
  await loadPresetsUI();
}

// Init
(async function init() {
  fillServiceLinks();
  await fullRefresh();
})();
