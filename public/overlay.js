/*
  OBS Browser Source overlay.

  Polls:
    - /api/overlay-settings (font/size/color + animation settings)
    - /api/overlay-state (current texts + applyId)

  URL params:
    - mode=current|next   (currently only current is used by operator UI)
    - interval=...ms      (default 250)
    - hideEmpty=1         (default 1)
    - preview=1           (demo text)

  Animation:
    Each field (title / leader / follower) animates only when its text changes.
*/

(function () {
  const qs = new URLSearchParams(window.location.search);
  const mode = (qs.get('mode') || 'current').toLowerCase();
  const interval = Number(qs.get('interval') || 250);
  const hideEmpty = (qs.get('hideEmpty') ?? '1') !== '0';
  const preview = (qs.get('preview') ?? '0') === '1';

  if (preview) document.body.classList.add('preview');

  const elTitle = document.getElementById('title');
  const elPair = document.getElementById('pair');
  const elPairLeader = document.getElementById('pair-leader');
  const elPairTail = document.getElementById('pair-tail');
  const elPairFollower = document.getElementById('pair-follower');

  let settings = null;
  let lastApplyId = null;
  let last = { title: null, leader: null, follower: null, withoutPair: false, hidden: false };

  function setVisible(el, isVisible) {
    if (!hideEmpty) return;
    el.classList.toggle('hidden', !isVisible);
  }

  function applyAnim(el, type, ms) {
    const t = String(type || 'none');
    const dur = Math.max(0, Number(ms || 0));
    el.style.setProperty('--anim-ms', `${dur}ms`);
    el.setAttribute('data-anim', t);
    // Restart animation
    el.classList.remove('play');
    // force reflow
    void el.offsetWidth;
    el.classList.add('play');
  }

  function render(state) {
    const hidden = Boolean(state.hidden);
    const title = hidden ? '' : String(state.title || '');
    const leader = hidden ? '' : String(state.leader || '');
    const follower = hidden ? '' : String(state.follower || '');
    const withoutPair = Boolean(state.withoutPair);

    const titleChanged = title !== last.title;
    const leaderChanged = leader !== last.leader;
    const followerChanged = follower !== last.follower;
    const withoutPairChanged = withoutPair !== last.withoutPair;

    if (titleChanged) {
      elTitle.textContent = title;
      if (settings && settings.titleAnimType && settings.titleAnimType !== 'none') {
        applyAnim(elTitle, settings.titleAnimType, settings.titleAnimMs);
      }
      last.title = title;
    }

    // Pair line: show "Leader" first, then when follower appears show " — Follower".
    // If withoutPair is enabled, show only the single name.
    if (leaderChanged || followerChanged || withoutPairChanged) {
      if (elPairLeader) elPairLeader.textContent = leader;

      const showTail = Boolean(!withoutPair && follower && follower.trim().length > 0);
      if (elPairTail) {
        elPairTail.classList.toggle('hidden', !showTail);
      }
      if (elPairFollower) elPairFollower.textContent = showTail ? follower : '';

      // Animate only the changed part.
      if (leaderChanged && leader && settings && settings.leaderAnimType && settings.leaderAnimType !== 'none') {
        applyAnim(elPairLeader, settings.leaderAnimType, settings.leaderAnimMs);
      }
      if (followerChanged && showTail && settings && settings.followerAnimType && settings.followerAnimType !== 'none') {
        applyAnim(elPairTail, settings.followerAnimType, settings.followerAnimMs);
      }

      last.leader = leader;
      last.follower = follower;
      last.withoutPair = withoutPair;
    }

    setVisible(elTitle, Boolean(title.trim()));
    const pairVisible = Boolean((leader && leader.trim()) || (!withoutPair && follower && follower.trim()));
    setVisible(elPair, pairVisible);
  }

  async function loadOverlaySettings() {
    try {
      const res = await fetch('/api/overlay-settings', { cache: 'no-store' });
      if (!res.ok) return;
      const s = await res.json();
      settings = s;

      if (s && typeof s === 'object') {
        if (s.titleFontFamily) document.documentElement.style.setProperty('--title-font-family', String(s.titleFontFamily));
        if (s.pairFontFamily) document.documentElement.style.setProperty('--pair-font-family', String(s.pairFontFamily));
        if (Number.isFinite(Number(s.titleSizePx))) document.documentElement.style.setProperty('--title-size', `${Number(s.titleSizePx)}px`);
        if (Number.isFinite(Number(s.pairSizePx))) document.documentElement.style.setProperty('--pair-size', `${Number(s.pairSizePx)}px`);
        if (s.titleColor) document.documentElement.style.setProperty('--title-color', String(s.titleColor));
        if (s.pairColor) document.documentElement.style.setProperty('--pair-color', String(s.pairColor));
      }
    } catch {
      // ignore
    }
  }

  async function tick() {
    try {
      if (preview) {
        render({
          hidden: false,
          title: mode === 'next' ? 'NEXT' : 'Jack & Jill All Star Finals',
          leader: 'Vasya Ivanov',
          follower: 'Masha Ivanova',
          withoutPair: false
        });
        return;
      }

      const res = await fetch('/api/overlay-state', { cache: 'no-store' });
      if (!res.ok) return;
      const state = await res.json();
      if (!state || typeof state !== 'object') return;

      // Only rerender when applyId changes OR if something drifted
      const applyId = Number(state.applyId || 0);
      if (lastApplyId === null || applyId !== lastApplyId) {
        render(state);
        lastApplyId = applyId;
      }
    } catch {
      // ignore temporary network errors
    }
  }

  function start() {
    loadOverlaySettings().finally(() => tick());
    setInterval(tick, Math.max(100, Math.min(2000, interval)));
    // Refresh settings periodically (OBS browser source caches styles hard)
    setInterval(loadOverlaySettings, 1000);
  }

  start();
})();
