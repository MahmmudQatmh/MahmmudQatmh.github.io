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

  // ---- contact dialogs (email + phone), built once per page ----
  const PHONE = { display: '+358 44 951 2657', tel: '+358449512657' };

  function makeDialog(id, title, sub, rows) {
    const dlg = document.createElement('dialog');
    dlg.className = 'contact-dialog';
    dlg.setAttribute('aria-labelledby', id + '-title');
    dlg.innerHTML = `
      <form method="dialog"><button class="dialog-close" aria-label="Close">×</button></form>
      <h2 id="${id}-title">${title}</h2>
      <p class="sub">${sub}</p>
      ${rows.map((r) => `
        <div class="contact-row">
          <span class="contact-label">${r.label}:</span>
          <span class="contact-value">${r.value}</span>
          <div class="contact-actions">
            <button type="button" class="btn btn-small btn-ghost" data-copy="${r.value}">Copy</button>
            <a class="btn btn-small${r.primary ? '' : ' btn-ghost'}" href="${r.href}">${r.action}</a>
          </div>
        </div>`).join('')}
      <p class="copy-status" aria-live="polite"></p>`;
    document.body.appendChild(dlg);
    const status = dlg.querySelector('.copy-status');
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
      status.textContent = 'Copied: ' + text;
      b.textContent = 'Copied ✓';
      setTimeout(() => { b.textContent = 'Copy'; }, 1800);
    }));
    return { open: () => { status.textContent = ''; dlg.showModal ? dlg.showModal() : null; return !!dlg.showModal; } };
  }

  const emailDlg = makeDialog('email', 'Email me', 'Please use the main address; the alternative also reaches me.', EMAILS.map((e, i) => (
    { label: e.label, value: e.addr, href: 'mailto:' + e.addr, action: 'Open mail app', primary: i === 0 })));
  document.querySelectorAll('[data-open-email]').forEach((b) => b.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (!emailDlg.open()) window.location.href = 'mailto:' + EMAILS[0].addr;
  }));

  // Phone: on touch phones let tel: dial directly; on desktop show the number with Copy.
  const phoneDlg = makeDialog('phone', 'Call me', 'Based in Turku, Finland (EET, UTC+2).',
    [{ label: 'Mobile', value: PHONE.display, href: 'tel:' + PHONE.tel, action: 'Call with an app', primary: true }]);
  const isPhone = () => window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(max-width: 900px)').matches;
  document.querySelectorAll('[data-open-phone]').forEach((b) => b.addEventListener('click', (ev) => {
    if (isPhone()) return;          // follow the tel: link
    ev.preventDefault();
    phoneDlg.open();
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
