// Operator Mode (Stage 1): UI only
// NOTE: No OBS connection / API calls here yet.

(function () {
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

  // Mock OBS status for Stage 1
  const stateEl = document.getElementById('op-obs-state');
  if (stateEl) stateEl.textContent = 'UI only';

  // Modal
  const openBtn = document.getElementById('op-choose');
  const closeBtn = document.getElementById('op-choose-close');
  const cancelBtn = document.getElementById('op-choose-cancel');
  const modal = document.getElementById('op-choose-modal');

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
})();
