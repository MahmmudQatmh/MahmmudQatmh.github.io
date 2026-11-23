// Shared behaviour for every page.
(function () {
  const EMAILS = [
    { label: 'Main', addr: 'pro4mahmoudqatmh@gmail.com' },
    { label: 'Alternative', addr: 'MahmoudQatma@outlook.com' },
  ];

  // ---- mobile menu ----
  const menuBtn = document.querySelector('.menu-btn');
  const nav = document.querySelector('.nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
  }

  // ---- email dialog (built once, opened by any [data-open-email]) ----
  const dlg = document.createElement('dialog');
  dlg.className = 'email-dialog';
  dlg.setAttribute('aria-labelledby', 'email-title');
  dlg.innerHTML = `
    <form method="dialog" class="email-close-form"><button class="email-close" aria-label="Close">×</button></form>
    <h2 id="email-title">Email me</h2>
    ${EMAILS.map((e, i) => `
      <div class="email-row">
        <div><span class="email-label">${e.label}</span><b>${e.addr}</b></div>
        <div class="email-actions">
          <button type="button" class="btn btn-small btn-ghost" data-copy="${e.addr}">Copy</button>
          <a class="btn btn-small ${i === 0 ? '' : 'btn-ghost'}" href="mailto:${e.addr}">Open mail app</a>
        </div>
      </div>`).join('')}
    <p class="muted small" id="copy-status" aria-live="polite"></p>`;
  document.body.appendChild(dlg);
  const status = dlg.querySelector('#copy-status');
  document.querySelectorAll('[data-open-email]').forEach((b) => b.addEventListener('click', (ev) => {
    ev.preventDefault();
    status.textContent = '';
    if (dlg.showModal) dlg.showModal(); else window.location.href = 'mailto:' + EMAILS[0].addr;
  }));
  dlg.addEventListener('click', (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  });
  dlg.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const text = b.dataset.copy;
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; dlg.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (__) {}
      ta.remove();
    }
    status.textContent = 'Copied ' + text;
    b.textContent = 'Copied ✓';
    setTimeout(() => { b.textContent = 'Copy'; }, 1800);
  }));

  // ---- video tabs ----
  document.querySelectorAll('.player').forEach((player) => {
    const video = player.querySelector('video');
    const caption = player.querySelector('.caption');
    const tabs = player.querySelectorAll('.tabs button');
    tabs.forEach((tab) => tab.addEventListener('click', () => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      video.poster = tab.dataset.poster;
      video.src = tab.dataset.src;
      if (caption) caption.textContent = tab.dataset.caption;
      video.play().catch(() => {});
    }));
  });

  // ---- project filters ----
  const filters = document.querySelectorAll('.filters button');
  if (filters.length) {
    const cards = document.querySelectorAll('[data-tags]');
    filters.forEach((f) => f.addEventListener('click', () => {
      filters.forEach((x) => x.setAttribute('aria-pressed', String(x === f)));
      const tag = f.dataset.filter;
      cards.forEach((c) => { c.hidden = tag !== 'all' && !c.dataset.tags.split(' ').includes(tag); });
    }));
  }

  // ---- reduced motion: pause autoplay loops ----
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) document.querySelectorAll('video[autoplay]').forEach((v) => { v.removeAttribute('autoplay'); v.pause(); });

  // ---- reveal on scroll ----
  const rev = document.querySelectorAll('.reveal');
  if (!reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    rev.forEach((r) => io.observe(r));
  } else rev.forEach((r) => r.classList.add('in'));
})();
