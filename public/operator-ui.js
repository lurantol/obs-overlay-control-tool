// Operator Mode (Stages 2-5)
// - Standalone page: /operator
// - OBS WebSocket status + Program/Preview screenshots via server APIs
// - Finals-only quick dancer pick
// - History Undo/Redo
// - Apply leader/follower separately (animations handled by Browser Overlay)

(function () {
  const $ = (id) => document.getElementById(id);

  // Subtabs
  const subtabBtns = document.querySelectorAll('.operator-tab-btn');
  const subtabs = document.querySelectorAll('.operator-subtab');
  subtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sub = btn.dataset.subtab;
      subtabBtns.forEach(b => b.classList.remove('active'));
      subtabs.forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      const el = document.getElementById('operator-subtab-' + sub);
      if (el) el.classList.add('active');
    });
  });

  // Modal
  const openBtn = $('op-choose');
  const closeBtn = $('op-modal-close');
  const cancelBtn = $('op-modal-cancel');
  const modal = $('op-modal-backdrop');

  function openModal() {
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
  if (openBtn) openBtn.addEventListener('click', () => {
    openModal();
    // lazy load data each time
    loadFinals().catch(() => {});
  });
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });
  }

  // Elements
  const obsStateEl = $('op-obs-state');
  const obsPillEl = $('op-obs-pill');

  const programBox = $('op-program-preview');
  const previewBox = $('op-preview-preview');
  const programSceneEl = $('op-program-scene');
  const previewSceneEl = $('op-preview-scene');
  const programUpdatedEl = $('op-program-updated');
  const previewUpdatedEl = $('op-preview-updated');

  const hostEl = $('op-host') || $('op-obs-host');
  const portEl = $('op-port') || $('op-obs-port');
  const passEl = $('op-password') || $('op-obs-password');
  const testBtn = $('op-test-conn') || $('op-test');
  const saveBtn = $('op-save-settings') || $('op-save');
  const reconnectBtn = $('op-reconnect');

  const intervalEl = $('op-interval') || $('op-shot-interval');
  const qualityEl = $('op-quality') || $('op-shot-quality');
  const resEl = $('op-resolution') || $('op-shot-resolution');
  const previewOnlyEl = $('op-preview-only-studio');
  const autoRefreshEl = $('op-auto-refresh');

  const hintEl = $('op-conn-hint');

  // Operator controls
  const btnUndo = $('op-prev');
  const btnRedo = $('op-next');
  const btnClear = $('op-clear');
  const btnHide = $('op-hide');
  const btnApply = $('op-apply');

  // Modal elements
  const divisionSelect = $('op-division-select');
  const withoutPairEl = $('op-without-pair');
  const leaderSearchEl = $('op-leader-search');
  const followerSearchEl = $('op-follower-search');
  const leaderListEl = $('op-leader-list');
  const followerListEl = $('op-follower-list');
  const selectedPairEl = $('op-selected-pair');
  const btnSwap = $('op-swap');
  const btnApplyLeader = $('op-apply-leader');
  const btnApplyFollower = $('op-apply-follower');
  const btnApplyBoth = $('op-apply-both');

  const historyEl = $('op-history');

  // State
  let settings = null;
  let timer = null;
  let programObjUrl = null;
  let previewObjUrl = null;

  let finals = []; // [{id,name,leaders,followers}]
  let selected = {
    divisionId: '',
    withoutPair: false,
    leaderNumber: null,
    followerNumber: null,
    leaderName: '',
    followerName: ''
  };

  let lastOverlayState = null;

  function setObsPill(stateText, kind) {
    if (obsStateEl) obsStateEl.textContent = stateText;
    if (!obsPillEl) return;
    obsPillEl.classList.remove('ok', 'warn', 'bad');
    if (kind) obsPillEl.classList.add(kind);
  }

  async function apiGet(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  async function apiPost(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        const j = await r.json();
        if (j && j.error) msg = j.error;
      } catch {}
      throw new Error(msg);
    }
    return await r.json();
  }

  function currentSettingsFromForm() {
    const resolution = (resEl && resEl.value) ? resEl.value : '1280x720';
    let width = 1280;
    let height = 720;
    if (resolution && resolution.includes('x') && resolution !== 'custom') {
      const [w, h] = resolution.split('x').map(x => parseInt(x, 10));
      if (Number.isFinite(w) && Number.isFinite(h)) {
        width = w; height = h;
      }
    }

    return {
      obsHost: hostEl ? hostEl.value.trim() : 'localhost',
      obsPort: portEl ? Number(portEl.value) : 4455,
      obsPassword: passEl ? passEl.value : '',
      screenshotIntervalSec: intervalEl ? Number(intervalEl.value) : 1,
      screenshotQuality: qualityEl ? Number(qualityEl.value) : 70,
      screenshotWidth: width,
      screenshotHeight: height,
      previewOnlyIfStudioMode: previewOnlyEl ? Boolean(previewOnlyEl.checked) : true,
      autoRefreshScreenshots: autoRefreshEl ? Boolean(autoRefreshEl.checked) : true
    };
  }

  function applySettingsToForm(s) {
    if (!s) return;
    if (hostEl) hostEl.value = s.obsHost || 'localhost';
    if (portEl) portEl.value = String(s.obsPort ?? 4455);
    if (passEl) passEl.value = s.obsPassword || '';

    if (intervalEl) intervalEl.value = String(s.screenshotIntervalSec ?? 1);
    if (qualityEl) qualityEl.value = String(s.screenshotQuality ?? 70);

    const res = `${s.screenshotWidth ?? 1280}x${s.screenshotHeight ?? 720}`;
    if (resEl) {
      const opts = Array.from(resEl.options).map(o => o.value);
      if (opts.includes(res)) resEl.value = res;
      else resEl.value = opts[0] || '1280x720';
    }

    if (previewOnlyEl) previewOnlyEl.checked = Boolean(s.previewOnlyIfStudioMode);
    if (autoRefreshEl) autoRefreshEl.checked = Boolean(s.autoRefreshScreenshots);
  }

  function ensurePreviewImg(containerEl, id) {
    if (!containerEl) return null;
    let img = containerEl.querySelector('img');
    if (!img) {
      containerEl.innerHTML = '';
      img = document.createElement('img');
      img.id = id;
      img.alt = id;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      containerEl.appendChild(img);
    }
    return img;
  }

  async function fetchAndShowImage(url, kind) {
    const box = kind === 'program' ? programBox : previewBox;
    const sceneEl = kind === 'program' ? programSceneEl : previewSceneEl;
    const updEl = kind === 'program' ? programUpdatedEl : previewUpdatedEl;

    if (!box) return;

    const r = await fetch(url, { cache: 'no-store' });
    if (r.status === 204) {
      box.innerHTML = '<div class="operator-preview-placeholder">Studio Mode is OFF</div>';
      if (sceneEl) sceneEl.textContent = '—';
      if (updEl) updEl.textContent = '—';
      return;
    }
    if (!r.ok) {
      box.innerHTML = `<div class="operator-preview-placeholder">${kind.toUpperCase()} unavailable</div>`;
      if (sceneEl) sceneEl.textContent = '—';
      if (updEl) updEl.textContent = '—';
      return;
    }

    const sceneHeader = r.headers.get('x-obs-scene');
    const sceneName = sceneHeader ? decodeURIComponent(sceneHeader) : '—';
    const blob = await r.blob();

    const img = ensurePreviewImg(box, kind === 'program' ? 'op-program-img' : 'op-preview-img');
    if (!img) return;

    const objUrl = URL.createObjectURL(blob);
    if (kind === 'program') {
      if (programObjUrl) URL.revokeObjectURL(programObjUrl);
      programObjUrl = objUrl;
    } else {
      if (previewObjUrl) URL.revokeObjectURL(previewObjUrl);
      previewObjUrl = objUrl;
    }
    img.src = objUrl;

    if (sceneEl) sceneEl.textContent = sceneName || '—';
    if (updEl) updEl.textContent = new Date().toLocaleTimeString();
  }

  async function refreshStatus() {
    try {
      const st = await apiGet('/api/operator/obs-status');
      if (!st.obsAvailable) {
        setObsPill('server missing obs-websocket-js', 'bad');
        return;
      }
      if (!st.connected) {
        const msg = st.lastErrorMessage ? `disconnected (${st.lastErrorMessage})` : 'disconnected';
        setObsPill(msg, 'bad');
        return;
      }
      if (st.stale) setObsPill('connected (stale)', 'warn');
      else setObsPill('connected', 'ok');
    } catch {
      setObsPill('status error', 'bad');
    }
  }

  function restartScreenshotLoop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    const intervalSec = Math.max(0.25, Number(settings?.screenshotIntervalSec || 1));
    const auto = Boolean(settings?.autoRefreshScreenshots);
    if (!auto) return;

    fetchAndShowImage('/api/operator/program.jpg', 'program').catch(() => {});
    fetchAndShowImage('/api/operator/preview.jpg', 'preview').catch(() => {});

    timer = setInterval(() => {
      fetchAndShowImage('/api/operator/program.jpg', 'program').catch(() => {});
      fetchAndShowImage('/api/operator/preview.jpg', 'preview').catch(() => {});
    }, Math.round(intervalSec * 1000));
  }

  async function loadSettings() {
    try {
      const s = await apiGet('/api/operator/settings');
      settings = s;
      applySettingsToForm(settings);
      restartScreenshotLoop();
    } catch {}
  }

  async function saveSettings() {
    const s = currentSettingsFromForm();
    try {
      await apiPost('/api/operator/settings', s);
      settings = s;
      if (hintEl) hintEl.textContent = 'Saved';
      restartScreenshotLoop();
    } catch (e) {
      if (hintEl) hintEl.textContent = String(e.message || e);
    }
  }

  async function testConnection() {
    const s = currentSettingsFromForm();
    try {
      const r = await apiPost('/api/operator/test-connection', s);
      if (hintEl) hintEl.textContent = r.studioModeEnabled ? 'OK (Studio Mode ON)' : 'OK (Studio Mode OFF)';
      await refreshStatus();
    } catch (e) {
      if (hintEl) hintEl.textContent = String(e.message || e);
      await refreshStatus();
    }
  }

  async function doReconnect() {
    try { await apiPost('/api/operator/reconnect', {}); } catch {}
    await refreshStatus();
  }

  function renderHistory(items, index) {
    if (!historyEl) return;
    if (!Array.isArray(items) || items.length === 0) {
      historyEl.innerHTML = '<div class="operator-history-item">—</div>';
      return;
    }
    const html = items
      .slice(Math.max(0, items.length - 25))
      .map((it, iOff) => {
        const i = items.length - Math.min(items.length, 25) + iOff;
        const active = i === index;
        const t = (it.hidden ? '[HIDDEN] ' : '') + (it.title || '(no title)');
        const p = it.withoutPair ? (it.leader || it.follower || '') : ((it.leader && it.follower) ? `${it.leader} — ${it.follower}` : (it.leader || it.follower || ''));
        return `<div class="operator-history-item ${active ? 'active' : ''}"><div class="h-title">${escapeHtml(t)}</div><div class="h-pair">${escapeHtml(p)}</div></div>`;
      })
      .join('');
    historyEl.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function refreshHistory() {
    try {
      const h = await apiGet('/api/operator/history');
      renderHistory(h.items, h.index);
    } catch {}
  }

  async function refreshOverlayState() {
    try {
      lastOverlayState = await apiGet('/api/overlay-state');
      if (btnHide) {
        btnHide.textContent = lastOverlayState?.hidden ? 'Show' : 'Hide';
      }
    } catch {}
  }

  async function actionUndo() {
    try { await apiPost('/api/operator/undo', {}); } catch {}
    await refreshHistory();
    await refreshOverlayState();
  }
  async function actionRedo() {
    try { await apiPost('/api/operator/redo', {}); } catch {}
    await refreshHistory();
    await refreshOverlayState();
  }
  async function actionClear() {
    try { await apiPost('/api/operator/clear', {}); } catch {}
    await refreshHistory();
    await refreshOverlayState();
  }
  async function actionHideToggle() {
    try {
      if (lastOverlayState?.hidden) await apiPost('/api/operator/show', {});
      else await apiPost('/api/operator/hide', {});
    } catch {}
    await refreshHistory();
    await refreshOverlayState();
  }

  async function applySelection(action) {
    if (!selected.divisionId) return;
    try {
      await apiPost('/api/operator/set', {
        action,
        divisionId: selected.divisionId,
        withoutPair: selected.withoutPair,
        leaderNumber: selected.leaderNumber,
        followerNumber: selected.followerNumber
      });
    } catch {}
    await refreshHistory();
    await refreshOverlayState();
  }

  async function loadFinals() {
    const r = await apiGet('/api/operator/finals');
    finals = Array.isArray(r.finals) ? r.finals : [];

    if (divisionSelect) {
      divisionSelect.innerHTML = finals.map(f => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join('');
      if (!selected.divisionId && finals[0]) selected.divisionId = finals[0].id;
      divisionSelect.value = selected.divisionId || (finals[0]?.id || '');
    }

    renderLists();
  }

  function getCurrentFinal() {
    return finals.find(f => f.id === selected.divisionId) || finals[0] || null;
  }

  function renderLists() {
    const f = getCurrentFinal();
    const leaders = (f?.leaders || []);
    const followers = (f?.followers || []);

    const lq = String(leaderSearchEl?.value || '').toLowerCase();
    const fq = String(followerSearchEl?.value || '').toLowerCase();

    const leadersFiltered = leaders.filter(p => {
      const t = `${p.number} ${p.fullName}`.toLowerCase();
      return t.includes(lq);
    });

    const followersFiltered = followers.filter(p => {
      const t = `${p.number} ${p.fullName}`.toLowerCase();
      return t.includes(fq);
    });

    if (leaderListEl) leaderListEl.innerHTML = renderPickList(leadersFiltered, 'leader');
    if (followerListEl) followerListEl.innerHTML = renderPickList(followersFiltered, 'follower');

    bindPickHandlers();
    updateSelectedText();
  }

  function renderPickList(items, kind) {
    if (!Array.isArray(items) || items.length === 0) {
      return '<div class="operator-list-empty">(no dancers configured)</div>';
    }
    return items.map(p => {
      const active = (kind === 'leader')
        ? (Number(selected.leaderNumber) === Number(p.number))
        : (Number(selected.followerNumber) === Number(p.number));
      return `<button class="operator-list-item ${active ? 'active' : ''}" data-kind="${kind}" data-number="${p.number}" data-name="${escapeHtml(p.fullName)}">${escapeHtml(p.number)}. ${escapeHtml(p.fullName)}</button>`;
    }).join('');
  }

  function bindPickHandlers() {
    const btns = modal ? modal.querySelectorAll('.operator-list-item') : [];
    btns.forEach(b => {
      b.addEventListener('click', () => {
        const kind = b.dataset.kind;
        const num = Number(b.dataset.number);
        const name = b.dataset.name ? decodeHtmlEntities(b.dataset.name) : '';
        if (kind === 'leader') {
          selected.leaderNumber = num;
          selected.leaderName = name;
        } else {
          selected.followerNumber = num;
          selected.followerName = name;
        }
        renderLists();
      });
    });
  }

  function decodeHtmlEntities(str) {
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
  }

  function updateSelectedText() {
    selected.withoutPair = Boolean(withoutPairEl?.checked);
    const title = getCurrentFinal()?.name || '';
    const l = selected.leaderName || '';
    const f = selected.followerName || '';

    let pairText = '';
    if (selected.withoutPair) pairText = l || f;
    else pairText = (l && f) ? `${l} — ${f}` : (l || f);

    if (selectedPairEl) {
      selectedPairEl.textContent = title ? `${title}: ${pairText || '—'}` : (pairText || '—');
    }
  }

  function swap() {
    const ln = selected.leaderNumber;
    const fn = selected.followerNumber;
    const lname = selected.leaderName;
    const fname = selected.followerName;
    selected.leaderNumber = fn;
    selected.followerNumber = ln;
    selected.leaderName = fname;
    selected.followerName = lname;
    renderLists();
  }

  // Wire events
  if (divisionSelect) {
    divisionSelect.addEventListener('change', () => {
      selected.divisionId = divisionSelect.value;
      // reset picks if not present in new list
      selected.leaderNumber = null; selected.followerNumber = null;
      selected.leaderName = ''; selected.followerName = '';
      renderLists();
    });
  }
  if (leaderSearchEl) leaderSearchEl.addEventListener('input', renderLists);
  if (followerSearchEl) followerSearchEl.addEventListener('input', renderLists);
  if (withoutPairEl) withoutPairEl.addEventListener('change', updateSelectedText);

  if (btnSwap) btnSwap.addEventListener('click', swap);

  if (btnApplyLeader) btnApplyLeader.addEventListener('click', () => applySelection('setLeader'));
  if (btnApplyFollower) btnApplyFollower.addEventListener('click', () => applySelection('setFollower'));
  if (btnApplyBoth) btnApplyBoth.addEventListener('click', () => applySelection('setBoth'));

  if (btnUndo) btnUndo.addEventListener('click', actionUndo);
  if (btnRedo) btnRedo.addEventListener('click', actionRedo);
  if (btnClear) btnClear.addEventListener('click', actionClear);
  if (btnHide) btnHide.addEventListener('click', actionHideToggle);
  if (btnApply) btnApply.addEventListener('click', () => applySelection('setBoth'));

  if (testBtn) testBtn.addEventListener('click', testConnection);
  if (saveBtn) saveBtn.addEventListener('click', saveSettings);
  if (reconnectBtn) reconnectBtn.addEventListener('click', doReconnect);

  // init
  loadSettings().finally(() => {
    refreshStatus();
    setInterval(refreshStatus, 2000);
    refreshHistory();
    refreshOverlayState();
    setInterval(refreshHistory, 1500);
    setInterval(refreshOverlayState, 1500);
  });
})();
