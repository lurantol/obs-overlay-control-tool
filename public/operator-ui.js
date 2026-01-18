// Operator Mode (Stage 2)
// - Standalone page: /operator
// - OBS WebSocket status + Program/Preview screenshots via server APIs

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

  // Modal (UI only for now)
  const openBtn = $('op-choose');
  const closeBtn = $('op-modal-close') || $('op-choose-close');
  const cancelBtn = $('op-choose-cancel');
  const modal = $('op-modal-backdrop') || $('op-choose-modal');

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
  if (openBtn) openBtn.addEventListener('click', openModal);
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

  const hostEl = $('op-obs-host');
  const portEl = $('op-obs-port');
  const passEl = $('op-obs-password');
  const testBtn = $('op-test');
  const saveBtn = $('op-save');
  const reconnectBtn = $('op-reconnect');

  const intervalEl = $('op-shot-interval');
  const qualityEl = $('op-shot-quality');
  const resEl = $('op-shot-resolution');
  const previewOnlyEl = $('op-preview-only-studio');
  const autoRefreshEl = $('op-auto-refresh');

  // State
  let settings = null;
  let timer = null;
  let programObjUrl = null;
  let previewObjUrl = null;

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

    // Resolution select supports 1280x720 and 1920x1080 presets
    const res = `${s.screenshotWidth ?? 1280}x${s.screenshotHeight ?? 720}`;
    if (resEl) {
      const opts = Array.from(resEl.options).map(o => o.value);
      if (opts.includes(res)) resEl.value = res;
      else resEl.value = 'custom';
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

    // For preview endpoint it can be 204 (no preview)
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
      if (st.stale) {
        setObsPill('connected (stale)', 'warn');
      } else {
        setObsPill('connected', 'ok');
      }
    } catch (e) {
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

    // Immediate
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
    } catch (e) {
      // Keep UI usable even if server lacks settings
    }
  }

  // Actions
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      try {
        const next = currentSettingsFromForm();
        const r = await apiPost('/api/operator/settings', next);
        settings = r.operatorSettings;
        restartScreenshotLoop();
      } catch (e) {
        alert('Save failed: ' + (e?.message || e));
      }
    });
  }

  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      try {
        const next = currentSettingsFromForm();
        await apiPost('/api/operator/test-connection', next);
        await refreshStatus();
        // Update images once
        fetchAndShowImage('/api/operator/program.jpg', 'program').catch(() => {});
        fetchAndShowImage('/api/operator/preview.jpg', 'preview').catch(() => {});
      } catch (e) {
        alert('Connection failed: ' + (e?.message || e));
      }
    });
  }

  if (reconnectBtn) {
    reconnectBtn.addEventListener('click', async () => {
      try {
        await apiPost('/api/operator/reconnect', {});
        await refreshStatus();
      } catch (e) {
        alert('Reconnect failed: ' + (e?.message || e));
      }
    });
  }

  // When screenshot-related controls change, update local settings and restart loop
  const inputsToWatch = [intervalEl, qualityEl, resEl, previewOnlyEl, autoRefreshEl];
  inputsToWatch.forEach(el => {
    if (!el) return;
    el.addEventListener('change', () => {
      settings = { ...(settings || {}), ...currentSettingsFromForm() };
      restartScreenshotLoop();
    });
  });

  // Poll status
  setInterval(refreshStatus, 1500);

  // Initial load
  loadSettings().finally(() => refreshStatus());
})();
