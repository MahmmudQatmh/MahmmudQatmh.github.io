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
