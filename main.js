// BlueSim video tabs
(function () {
  const video = document.getElementById('bluesim-video');
  const caption = document.getElementById('bluesim-caption');
  const tabs = document.querySelectorAll('.tabs button');
  if (!video) return;

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      video.poster = tab.dataset.poster;
      video.src = tab.dataset.src;
      caption.textContent = tab.dataset.caption;
      video.play().catch(() => {});
    });
  });

  // Respect reduced-motion: pause the autoplaying hero loop.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('video[autoplay]').forEach((v) => { v.removeAttribute('autoplay'); v.pause(); });
  }
})();

// Email dialog: both addresses, copy buttons (mailto alone does nothing without a mail app)
(function () {
  const dlg = document.getElementById('email-dialog');
  if (!dlg) return;
  const status = document.getElementById('copy-status');
  document.querySelectorAll('[data-open-email]').forEach((b) => b.addEventListener('click', () => {
    status.textContent = '';
    if (dlg.showModal) dlg.showModal(); else window.location.href = 'mailto:pro4mahmoudqatmh@gmail.com';
  }));
  dlg.addEventListener('click', (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dlg.close();   // click on the backdrop
  });
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const text = b.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; dlg.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (__) {}
      ta.remove();
    }
    status.textContent = 'Copied ' + text;
    b.textContent = 'Copied ✓';
    setTimeout(() => { b.textContent = 'Copy'; }, 1800);
  }));
})();
