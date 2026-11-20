// Thesis approach animation: cooperative vision perception (boat + drone).
(function () {
  const svg = document.getElementById('thesis-svg');
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.appendChild(n);
    return n;
  };
  const caption = document.getElementById('thesis-caption');
  const steps = document.querySelectorAll('#thesis-steps li');

  const TARGET = { x: 470, y: 110 };
  const BOAT0 = { x: 120, y: 345 };
  const DRONE0 = { x: 560, y: 340 };
  const DRONE1 = { x: 480, y: 150 };

  const defs = el('defs');
  defs.innerHTML = `<pattern id="tw" width="48" height="18" patternUnits="userSpaceOnUse">
      <path d="M0 9 q12 -6 24 0 t24 0" fill="none" stroke="var(--dp-wave)" stroke-width="1.2"/></pattern>
`;
  el('rect', { width: 640, height: 420, fill: 'var(--dp-sea)' });
  el('rect', { width: 640, height: 420, fill: 'url(#tw)', opacity: .5 });

  // island (occluder)
  el('path', { class: 'island', d: 'M250,170 C280,130 350,135 380,165 C410,195 400,250 360,270 C320,290 260,280 240,245 C225,220 230,195 250,170 Z' });
  el('text', { x: 318, y: 215, class: 'lbl', 'text-anchor': 'middle' }).textContent = 'island';

  // target
  const tg = el('g', { transform: `translate(${TARGET.x} ${TARGET.y})` });
  el('circle', { r: 7, class: 'target' }, tg);
  el('text', { x: 14, y: -10, class: 'lbl small-lbl' }, tg).textContent = 'object of interest';

  // boat camera cone + blocked part
  const cone = el('path', { class: 'cone boat-cone' });
  const blocked = el('g', { class: 'blocked' });
  el('line', { x1: -8, y1: -8, x2: 8, y2: 8 }, blocked);
  el('line', { x1: -8, y1: 8, x2: 8, y2: -8 }, blocked);

  // drone footprint
  const foot = el('circle', { r: 72, class: 'cone drone-foot' });

  // uncertainty ellipses
  const eDrone = el('ellipse', { class: 'ell ell-drone', cx: TARGET.x + 8, cy: TARGET.y + 6, rx: 44, ry: 30 });
  const eBoat = el('ellipse', { class: 'ell ell-boat' });
  const eFused = el('ellipse', { class: 'ell ell-fused', cx: TARGET.x + 1, cy: TARGET.y + 1, rx: 12, ry: 9 });

  // comm link
  const link = el('line', { class: 'comm' });
  const pkts = [0, 1, 2].map(() => el('circle', { r: 4, class: 'pkt' }));
  const linkLbl = el('text', { class: 'lbl small-lbl comm-lbl', 'text-anchor': 'middle' });
  linkLbl.textContent = 'ROS 2: detections + poses';

  // planned path
  const pathD = 'M120,345 C200,330 250,320 330,300 C420,280 450,220 462,128';
  const plan = el('path', { class: 'plan', d: pathD });

  // robots
  const boat = el('g', { class: 'robot boat' });
  el('path', { d: 'M0,-16 L9,-4 L9,14 L-9,14 L-9,-4 Z' }, boat);
  const boatLbl = el('text', { class: 'lbl', 'text-anchor': 'middle' });
  boatLbl.textContent = 'boat';

  const drone = el('g', { class: 'robot drone' });
  el('line', { x1: -12, y1: -12, x2: 12, y2: 12 }, drone);
  el('line', { x1: -12, y1: 12, x2: 12, y2: -12 }, drone);
  [[-12, -12], [12, 12], [-12, 12], [12, -12]].forEach(([x, y]) => el('circle', { cx: x, cy: y, r: 6, class: 'rotor' }, drone));
  el('rect', { x: -5, y: -5, width: 10, height: 10, rx: 2 }, drone);
  const droneLbl = el('text', { class: 'lbl', 'text-anchor': 'middle' });
  droneLbl.textContent = 'drone';

  const CAPS = [
    'Step 1, detect: the boat\'s camera is blocked by the island. The drone flies over and sees the object, but only roughly located.',
    'Step 2, share: each robot sends its detections and its own position and heading over ROS 2.',
    'Step 3, fuse: the views are combined into one estimate, tighter than either robot alone.',
    'Step 4, act: the boat plans a route around the island to the fused position, without ever having seen the object itself.',
  ];
  const PHASE = 3.6; // seconds per step
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const show = (n, on) => { n.style.opacity = on ? 1 : 0; };

  const pathLen = plan.getTotalLength();
  plan.style.strokeDasharray = pathLen;

  let t = 0, last = 0, visible = false, curStep = -1;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setStep(i) {
    if (i === curStep) return;
    curStep = i;
    caption.textContent = CAPS[i];
    steps.forEach((s) => s.classList.toggle('on', +s.dataset.step === i));
  }

  function render() {
    const total = PHASE * 4 + 1.5;
    const tt = t % total;
    const step = Math.min(3, Math.floor(tt / PHASE));
    const k = Math.min(1, (tt - step * PHASE) / PHASE);
    setStep(step);

    // drone position
    const dk = step === 0 ? ease(Math.min(1, k * 1.6)) : 1;
    const hover = Math.sin(t * 2) * 2;
    const D = { x: lerp(DRONE0.x, DRONE1.x, dk), y: lerp(DRONE0.y, DRONE1.y, dk) + hover };
    drone.setAttribute('transform', `translate(${D.x.toFixed(1)} ${D.y.toFixed(1)}) rotate(${(t * 40) % 360})`);
    droneLbl.setAttribute('x', D.x.toFixed(0)); droneLbl.setAttribute('y', (D.y + 32).toFixed(0));
    foot.setAttribute('cx', D.x.toFixed(1)); foot.setAttribute('cy', D.y.toFixed(1));

    // boat position (moves along plan in step 3)
    let B = BOAT0, ang = 70;
    let pk = 0;
    if (step === 3) {
      pk = ease(Math.min(1, k * 1.15));
      const p = plan.getPointAtLength(pathLen * pk);
      const p2 = plan.getPointAtLength(Math.min(pathLen, pathLen * pk + 2));
      B = { x: p.x, y: p.y };
      ang = Math.atan2(p2.y - p.y, p2.x - p.x) * 180 / Math.PI + 90;
    }
    boat.setAttribute('transform', `translate(${B.x.toFixed(1)} ${B.y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
    boatLbl.setAttribute('x', B.x.toFixed(0)); boatLbl.setAttribute('y', (B.y + 34).toFixed(0));
    plan.style.strokeDashoffset = step === 3 ? pathLen * (1 - Math.min(1, k * 2)) : pathLen;
    show(plan, step === 3);

    // boat camera cone toward target (blocked by island)
    const dir = Math.atan2(TARGET.y - B.y, TARGET.x - B.x);
    const R = step === 3 ? Math.hypot(TARGET.x - B.x, TARGET.y - B.y) + 20 : 175, half = 0.28;
    const a1 = { x: B.x + R * Math.cos(dir - half), y: B.y + R * Math.sin(dir - half) };
    const a2 = { x: B.x + R * Math.cos(dir + half), y: B.y + R * Math.sin(dir + half) };
    cone.setAttribute('d', `M${B.x},${B.y} L${a1.x.toFixed(1)},${a1.y.toFixed(1)} A${R},${R} 0 0 1 ${a2.x.toFixed(1)},${a2.y.toFixed(1)} Z`);
    const isBlocked = step < 3 || pk < 0.85;
    blocked.setAttribute('transform', `translate(${(B.x + 160 * Math.cos(dir)).toFixed(1)} ${(B.y + 160 * Math.sin(dir)).toFixed(1)})`);
    show(blocked, step < 3);
    cone.classList.toggle('is-blocked', isBlocked);

    // ellipses
    show(eDrone, step >= 0 && dk > 0.9 && step < 3);
    eBoat.setAttribute('cx', 0); show(eBoat, false);
    const fusedOn = step === 2 ? k > 0.35 : step === 3;
    show(eFused, fusedOn);
    eDrone.classList.toggle('dim', step === 2 && k > 0.35);

    // comms
    const commOn = step === 1 || step === 2;
    show(link, commOn); show(linkLbl, commOn);
    setAttrs(link, { x1: D.x, y1: D.y, x2: B.x, y2: B.y });
    linkLbl.setAttribute('x', ((D.x + B.x) / 2 + 30).toFixed(0)); linkLbl.setAttribute('y', ((D.y + B.y) / 2 + 30).toFixed(0));
    pkts.forEach((p, i) => {
      const f = ((t * 0.6 + i / 3) % 1);
      const back = i === 1;
      const ff = back ? 1 - f : f;
      p.setAttribute('cx', lerp(D.x, B.x, ff).toFixed(1));
      p.setAttribute('cy', lerp(D.y, B.y, ff).toFixed(1));
      show(p, commOn);
    });
  }
  const setAttrs = (n, a) => { for (const k in a) n.setAttribute(k, (+a[k]).toFixed(1)); };

  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0.1 }).observe(svg);
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts;
    if (visible && !reduced) { t += dt; render(); }
    requestAnimationFrame(frame);
  }

  // clicking a step jumps to it (and is the only way to advance with reduced motion)
  steps.forEach((s) => {
    s.tabIndex = 0;
    const go = () => { t = +s.dataset.step * PHASE + PHASE * 0.75; render(); };
    s.addEventListener('click', go);
    s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });

  if (reduced) t = PHASE * 2 + PHASE * 0.75;
  render();
  requestAnimationFrame(frame);
})();
