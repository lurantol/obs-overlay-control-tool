/*
  OBS Browser Source overlay.
  Polls /api/state and renders currentTitle/currentPair.

  URL params:
    - mode=current|next   (default current)
    - interval=...ms      (default 300)
    - hideEmpty=1         (default 1)
    - titleSize=48px
    - pairSize=40px

  Examples:
    http://127.0.0.1:3000/overlay.html?mode=current
    http://127.0.0.1:3000/overlay.html?mode=next&hideEmpty=1
*/

(function () {
  const qs = new URLSearchParams(window.location.search);
  const mode = (qs.get('mode') || 'current').toLowerCase();
  const interval = Number(qs.get('interval') || 300);
  const hideEmpty = (qs.get('hideEmpty') ?? '1') !== '0';
  const preview = (qs.get('preview') ?? '0') === '1';

  // Optional quick sizing from URL
  const titleSize = qs.get('titleSize');
  const pairSize = qs.get('pairSize');
  if (titleSize) document.documentElement.style.setProperty('--title-size', titleSize);
  if (pairSize) document.documentElement.style.setProperty('--pair-size', pairSize);

  const elTitle = document.getElementById('title');
  const elPair = document.getElementById('pair');

  let lastTitle = null;
  let lastPair = null;
  let timer = null;

  function setVisible(el, isVisible) {
    if (!hideEmpty) return;
    el.classList.toggle('hidden', !isVisible);
  }

  function render(title, pair) {
    if (title !== lastTitle) {
      elTitle.textContent = title;
      lastTitle = title;
    }
    if (pair !== lastPair) {
      elPair.textContent = pair;
      lastPair = pair;
    }
    setVisible(elTitle, Boolean(String(title).trim()));
    setVisible(elPair, Boolean(String(pair).trim()));
  }

  async function tick() {
    try {
      if (preview) {
        // In preview mode we don't depend on live state (use sample text)
        if (mode === 'next') {
          render('NEXT', '');
        } else {
          render('TITLE / DIVISION', 'Leader - Follower');
        }
        return;
      }

      const res = await fetch('/api/state', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();

      if (mode === 'next') {
        // nextTitle only
        render(String(data.nextTitle || ''), '');
        return;
      }

      render(String(data.currentTitle || ''), String(data.currentPair || ''));
    } catch {
      // ignore temporary network errors
    }
  }

  async function loadOverlaySettings() {
    try {
      const res = await fetch('/api/overlay-settings', { cache: 'no-store' });
      if (!res.ok) return;
      const s = await res.json();
      if (s && typeof s === 'object') {
        if (s.titleFontFamily) document.documentElement.style.setProperty('--title-font-family', String(s.titleFontFamily));
        if (s.pairFontFamily) document.documentElement.style.setProperty('--pair-font-family', String(s.pairFontFamily));
        if (s.titleSizePx) document.documentElement.style.setProperty('--title-size', `${Number(s.titleSizePx)}px`);
        if (s.pairSizePx) document.documentElement.style.setProperty('--pair-size', `${Number(s.pairSizePx)}px`);
        if (s.titleColor) document.documentElement.style.setProperty('--title-color', String(s.titleColor));
        if (s.pairColor) document.documentElement.style.setProperty('--pair-color', String(s.pairColor));
      }
    } catch {
      // ignore
    }
  }

  function start() {
    if (timer) clearInterval(timer);
    loadOverlaySettings().finally(() => tick());
    timer = setInterval(tick, Math.max(100, Math.min(2000, interval)));

    // In preview mode, also poll settings periodically so iframe reflects saved changes.
    if (preview) {
      setInterval(loadOverlaySettings, 500);
    }
  }

  start();
})();
