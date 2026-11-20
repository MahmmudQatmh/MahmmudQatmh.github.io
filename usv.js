// Thesis illustration: catamaran USV collision avoidance with a camera, a 2D LiDAR
// (world-fixed obstacle map with memory) and a High-Order Control Barrier Function
// safety filter written in thrust force T and yaw moment N on a surge-yaw model.
//
// Simplified browser re-implementation for illustration only — not the thesis code.
(function () {
  const svg = document.getElementById('usv-svg');
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.appendChild(n);
    return n;
  };

  // ---------- world (metres) ----------
  const S = 40;                    // px per metre; scene = 20 m x 11 m
  const W = 20, H = 11;
  const X = (m) => (m * S).toFixed(1);

  // vessel (heavy small catamaran) — true model
  const VES = { m: 30, I: 5, Du: 8, Dr: 6, Tmax: 25, Tmin: -15, Nmax: 9, L: 1.2, beam: 0.62 };
  // seven-disc hull cover along the centreline
  const DISCS = Array.from({ length: 7 }, (_, i) => ({ l: -0.5 + i * (1.0 / 6), r: 0.33 }));
  const MARGIN = 0.15;             // extra clearance (m)
  const START = { x: 1.3, y: 5.6, psi: 0 };
  const GOAL = { x: 18.6, y: 5.3 };
  const OBS = [
    { x: 6.2, y: 5.72, r: 0.32, kind: 'buoy' },
    { x: 9.6, y: 4.55, r: 0.32, kind: 'buoy' },
    { x: 10.0, y: 6.75, r: 0.16, kind: 'post' },
    { x: 13.4, y: 5.05, r: 0.32, kind: 'buoy' },
    { x: 15.6, y: 4.0, r: 0.16, kind: 'post' },
    { x: 4.2, y: 7.6, r: 0.16, kind: 'post' },
    { x: 7.8, y: 3.0, r: 0.16, kind: 'post' },
    { x: 16.6, y: 7.1, r: 0.32, kind: 'buoy' },
  ];
  const LIDAR = { range: 8, step: 3 };          // degrees between rays
  const CAM = { fov: 70 * Math.PI / 180, range: 7 };

  // ---------- scene ----------
  const defs = el('defs');
  defs.innerHTML = `
    <pattern id="uw" width="60" height="22" patternUnits="userSpaceOnUse">
      <path d="M0 11 q15 -7 30 0 t30 0" fill="none" stroke="var(--dp-wave)" stroke-width="1.2"/></pattern>
    <marker id="ua-n" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#b8c7d6"/></marker>
    <marker id="ua-s" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#3ee08f"/></marker>`;
  el('rect', { width: 800, height: 440, fill: 'var(--dp-sea)' });
  const waves = el('rect', { x: -60, y: -22, width: 920, height: 484, fill: 'url(#uw)', opacity: .45 });
  // quays
  el('rect', { x: 0, y: 0, width: 800, height: 34, class: 'quay' });
  el('rect', { x: 0, y: 406, width: 800, height: 34, class: 'quay' });
  for (let i = 40; i < 800; i += 80) { el('rect', { x: i, y: 26, width: 14, height: 8, class: 'bollard' }); el('rect', { x: i + 40, y: 406, width: 14, height: 8, class: 'bollard' }); }
  el('text', { x: 12, y: 22, class: 'lbl small-lbl quay-lbl' }).textContent = 'HARBOUR QUAY';

  // goal
  const goal = el('g', { class: 'goal', transform: `translate(${X(GOAL.x)} ${X(GOAL.y)})` });
  el('circle', { r: 14 }, goal);
  el('circle', { r: 4 }, goal);
  el('text', { x: 0, y: -22, 'text-anchor': 'middle', class: 'lbl small-lbl' }, goal).textContent = 'goal';

  const camLayer = el('g', { class: 'layer-camera' });
  const camCone = el('path', { class: 'cam-cone' }, camLayer);
  const camRings = el('g', {}, camLayer);
  const camLbl = el('text', { class: 'lbl small-lbl cam-lbl' }, camLayer);
  camLbl.textContent = 'camera depth × LiDAR scale';

  const lidarLayer = el('g', { class: 'layer-lidar' });
  const nRays = Math.round(360 / LIDAR.step);
  const rays = Array.from({ length: nRays }, () => el('line', { class: 'ray' }, lidarLayer));

  const mapLayer = el('g', { class: 'layer-map' });
  const mapPath = el('path', { class: 'map-pts' }, mapLayer);

  const trail = el('polyline', { class: 'usv-trail' });

  // obstacles
  OBS.forEach((o) => {
    const g = el('g', { class: 'obs obs-' + o.kind, transform: `translate(${X(o.x)} ${X(o.y)})` });
    el('circle', { r: ((o.r + MARGIN) * S).toFixed(1), class: 'obs-safe' }, g);
    el('circle', { r: (o.r * S).toFixed(1), class: 'obs-body' }, g);
    o.node = g;
  });

  const stopBar = el('line', { class: 'stop-bar' });
  const nomArrow = el('line', { class: 'cmd-nom', 'marker-end': 'url(#ua-n)' });
  const safeArrow = el('line', { class: 'cmd-safe', 'marker-end': 'url(#ua-s)' });

  // catamaran (body frame: +x forward)
  const boat = el('g', { class: 'usv' });
  const discLayer = el('g', { class: 'layer-discs' }, boat);
  DISCS.forEach((d) => el('circle', { cx: (d.l * S).toFixed(1), cy: 0, r: (d.r * S).toFixed(1), class: 'hull-disc' }, discLayer));
  const hl = VES.L * S, hb = 0.16 * S, off = (VES.beam / 2 - 0.08) * S;
  [-off, off].forEach((y) => el('rect', { x: (-hl / 2).toFixed(1), y: (y - hb / 2).toFixed(1), width: hl.toFixed(1), height: hb.toFixed(1), rx: (hb / 2).toFixed(1), class: 'pontoon' }, boat));
  el('rect', { x: (-hl * 0.32).toFixed(1), y: (-off).toFixed(1), width: (hl * 0.6).toFixed(1), height: (2 * off).toFixed(1), rx: 3, class: 'usv-deck' }, boat);
  el('circle', { cx: (hl * 0.22).toFixed(1), cy: 0, r: 3.5, class: 'usv-cam' }, boat);
  el('circle', { cx: 0, cy: 0, r: 4.5, class: 'usv-lidar' }, boat);

  const crash = el('circle', { r: 0, class: 'crash' });

  // ---------- UI ----------
  let mode = 'mass';
  const hud = {
    mode: document.getElementById('usv-mode'),
    speed: document.getElementById('usv-speed'),
    clear: document.getElementById('usv-clear'),
    status: document.getElementById('usv-status'),
  };
  document.querySelectorAll('[data-usv]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.usv;
    document.querySelectorAll('[data-usv]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    reset();
  }));
  document.querySelectorAll('[data-layer]').forEach((c) => c.addEventListener('change', () => {
    svg.classList.toggle('hide-' + c.dataset.layer, !c.checked);
  }));
  document.getElementById('usv-restart').addEventListener('click', () => reset());

  // ---------- state ----------
  let st, known, mapPts, mapKeys, pts, minClear, status, holdT;
  function reset() {
    st = { x: START.x, y: START.y, psi: START.psi, u: 0, r: 0 };
    known = new Set();
    mapPts = []; mapKeys = new Set();
    pts = []; minClear = Infinity; status = 'run'; holdT = 0;
    mapPath.setAttribute('d', '');
    crash.setAttribute('r', 0);
    OBS.forEach((o) => o.node.classList.remove('known', 'hit'));
  }

  // ---------- sensing ----------
  function rayCircle(ox, oy, dx, dy, c) {
    const fx = ox - c.x, fy = oy - c.y;
    const b = fx * dx + fy * dy, cc = fx * fx + fy * fy - c.r * c.r;
    const disc = b * b - cc;
    if (disc < 0) return Infinity;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? t : Infinity;
  }
  function sense() {
    const ox = st.x, oy = st.y;
    for (let i = 0; i < nRays; i++) {
      const a = st.psi + (i * LIDAR.step) * Math.PI / 180;
      const dx = Math.cos(a), dy = Math.sin(a);
      let best = LIDAR.range, hit = -1;
      OBS.forEach((o, k) => { const t = rayCircle(ox, oy, dx, dy, o); if (t < best) { best = t; hit = k; } });
      setLine(rays[i], ox, oy, ox + dx * best, oy + dy * best);
      rays[i].classList.toggle('hit', hit >= 0);
      if (hit >= 0) {
        known.add(hit);
        const px = ox + dx * best, py = oy + dy * best;
        const key = Math.round(px * 12) + ':' + Math.round(py * 12);
        if (!mapKeys.has(key)) { mapKeys.add(key); mapPts.push([px, py]); }
      }
    }
    // camera cone
    const a1 = st.psi - CAM.fov / 2, a2 = st.psi + CAM.fov / 2, R = CAM.range;
    camCone.setAttribute('d', `M${X(ox)},${X(oy)} L${X(ox + R * Math.cos(a1))},${X(oy + R * Math.sin(a1))} A${R * S},${R * S} 0 0 1 ${X(ox + R * Math.cos(a2))},${X(oy + R * Math.sin(a2))} Z`);
    camLbl.setAttribute('x', X(ox + 2.2 * Math.cos(st.psi) + 0.4)); camLbl.setAttribute('y', X(oy + 2.2 * Math.sin(st.psi) - 1.1));
    // obstacles inside the camera view get a depth ring
    camRings.textContent = '';
    OBS.forEach((o) => {
      const dx = o.x - ox, dy = o.y - oy, d = Math.hypot(dx, dy);
      let da = Math.atan2(dy, dx) - st.psi; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (d < R && Math.abs(da) < CAM.fov / 2) {
        el('circle', { cx: X(o.x), cy: X(o.y), r: ((o.r + 0.22) * S).toFixed(1), class: 'cam-ring', style: `opacity:${(1 - d / R * 0.7).toFixed(2)}` }, camRings);
      }
    });
    OBS.forEach((o, k) => o.node.classList.toggle('known', known.has(k)));
    // map memory
    if (mapPts.length) {
      mapPath.setAttribute('d', mapPts.map(([x, y]) => `M${X(x)} ${X(y)}h0.01`).join(''));
    }
  }

  // ---------- control ----------
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function nominal(vLimit) {
    let psiD = Math.atan2(GOAL.y - st.y, GOAL.x - st.x);
    // deadlock breaker: when slowed down by an obstacle in the corridor ahead,
    // the nominal planner picks the side with more room (the filter still guarantees safety)
    if (st.u < 0.35) {
      let best = null;
      known.forEach((idx) => {
        const o = OBS[idx];
        const dx = o.x - st.x, dy = o.y - st.y;
        const along = dx * Math.cos(psiD) + dy * Math.sin(psiD);
        const across = -dx * Math.sin(psiD) + dy * Math.cos(psiD);
        if (along > 0 && along < 2.8 && Math.abs(across) < o.r + 0.33 + MARGIN + 0.2 && (!best || along < best.along)) best = { o, along, across };
      });
      if (best) {
        const side = best.across >= 0 ? -1 : 1;           // pass on the far side
        psiD += side * Math.atan2(best.o.r + 0.9, Math.max(0.3, best.along));
      }
    }
    const dGoal = Math.hypot(GOAL.x - st.x, GOAL.y - st.y);
    let uD = Math.min(1.4, 0.6 * dGoal);
    uD = Math.min(uD, vLimit);
    const T = VES.m * 1.2 * (uD - st.u) + VES.Du * st.u * Math.abs(st.u);
    const N = VES.I * (2.2 * wrap(psiD - st.psi) - 2.0 * st.r) + VES.Dr * st.r;
    return { T, N, uD };
  }

  // Hildreth's dual coordinate ascent: min ½||z - z0||² s.t. G z ≤ h
  function qp(z0, G, h) {
    const lam = new Float64Array(G.length);
    const z = z0.slice();
    for (let it = 0; it < 120; it++) {
      let change = 0;
      for (let i = 0; i < G.length; i++) {
        const g = G[i], gg = g[0] * g[0] + g[1] * g[1];
        if (gg < 1e-12) continue;
        const viol = (g[0] * z[0] + g[1] * z[1] - h[i]) / gg;
        const nl = Math.max(0, lam[i] + viol);
        const dl = nl - lam[i];
        if (dl !== 0) { z[0] -= dl * g[0]; z[1] -= dl * g[1]; lam[i] = nl; change += Math.abs(dl); }
      }
      if (change < 1e-7) break;
    }
    return z;
  }

  function filter(nom) {
    // model the filter believes in
    const M = mode === 'mass' ? VES : { m: 1, I: 1, Du: 0, Dr: 0 };
    const k = 1.6, a1 = 2 * k, a0 = k * k;
    const sT = 20, sN = 8;                 // scaling of decision variables
    const G = [], hh = [];
    const c = Math.cos(st.psi), s = Math.sin(st.psi);
    const e = [c, s], ep = [-s, c];
    const udot0 = -M.Du * st.u * Math.abs(st.u) / M.m;
    const rdot0 = -M.Dr * st.r / M.I;
    let minH = Infinity;
    known.forEach((idx) => {
      const o = OBS[idx];
      DISCS.forEach((dk) => {
        const l = dk.l * VES.L;
        const px = st.x + l * c, py = st.y + l * s;
        const rx = px - o.x, ry = py - o.y, d = Math.hypot(rx, ry);
        if (d > 5) return;
        const n = [rx / d, ry / d];
        const h = d - (o.r + dk.r + MARGIN);
        minH = Math.min(minH, d - (o.r + dk.r));
        const v = [st.u * e[0] + st.r * l * ep[0], st.u * e[1] + st.r * l * ep[1]];
        const hd = n[0] * v[0] + n[1] * v[1];
        const ne = n[0] * e[0] + n[1] * e[1], nep = n[0] * ep[0] + n[1] * ep[1];
        const curv = (v[0] * v[0] + v[1] * v[1] - hd * hd) / d;
        const c0 = ne * udot0 + nep * st.u * st.r + l * nep * rdot0 - st.r * st.r * l * ne + curv;
        const aT = ne / M.m, aN = l * nep / M.I;
        // aT*T + aN*N + c0 + a1*hd + a0*h >= 0   ->   -aT*T - aN*N <= c0 + a1*hd + a0*h
        G.push([-aT * sT, -aN * sN]);
        hh.push(c0 + a1 * hd + a0 * h);
      });
    });
    // actuator box (the mass-aware filter knows the real limits)
    const Tmax = mode === 'mass' ? VES.Tmax : 1e3, Tmin = mode === 'mass' ? VES.Tmin : -1e3;
    const Nmax = mode === 'mass' ? VES.Nmax : 1e3;
    G.push([1, 0]); hh.push(Tmax / sT);
    G.push([-1, 0]); hh.push(-Tmin / sT);
    G.push([0, 1]); hh.push(Nmax / sN);
    G.push([0, -1]); hh.push(Nmax / sN);
    const z = qp([nom.T / sT, nom.N / sN], G, hh);
    return { T: z[0] * sT, N: z[1] * sN, minH };
  }

  function stoppingLimit() {
    // speed limit from stopping distance to the nearest known obstacle ahead
    const aB = (-VES.Tmin) / VES.m;   // braking from reverse thrust only (conservative)
    let dAhead = Infinity;
    known.forEach((idx) => {
      const o = OBS[idx];
      const dx = o.x - st.x, dy = o.y - st.y;
      const along = dx * Math.cos(st.psi) + dy * Math.sin(st.psi);
      const across = Math.abs(-dx * Math.sin(st.psi) + dy * Math.cos(st.psi));
      if (along > 0 && across < o.r + 0.45 + MARGIN) dAhead = Math.min(dAhead, along - VES.L / 2 - o.r - MARGIN);
    });
    return Math.sqrt(2 * aB * Math.max(0, dAhead - 0.1));
  }

  // ---------- step ----------
  let last = { nom: { T: 0, N: 0 }, cmd: { T: 0, N: 0 } };
  function step(dt) {
    if (status !== 'run') { holdT += dt; if (holdT > 2.4) reset(); return; }
    sense();
    const vLim = mode === 'mass' ? stoppingLimit() : Infinity;
    const nom = nominal(vLim);
    const f = filter(nom);
    // actuators saturate on the real vessel regardless of what the filter assumed
    const T = Math.max(VES.Tmin, Math.min(VES.Tmax, f.T));
    const N = Math.max(-VES.Nmax, Math.min(VES.Nmax, f.N));
    last = { nom, cmd: { T, N } };

    const udot = (T - VES.Du * st.u * Math.abs(st.u)) / VES.m;
    const rdot = (N - VES.Dr * st.r) / VES.I;
    st.u += udot * dt; st.r += rdot * dt;
    st.psi += st.r * dt;
    st.x += st.u * Math.cos(st.psi) * dt; st.y += st.u * Math.sin(st.psi) * dt;

    // true clearance (all obstacles, not only known ones)
    let clear = Infinity, hitIdx = -1;
    OBS.forEach((o, k) => DISCS.forEach((dk) => {
      const l = dk.l * VES.L;
      const d = Math.hypot(st.x + l * Math.cos(st.psi) - o.x, st.y + l * Math.sin(st.psi) - o.y) - o.r - dk.r;
      if (d < clear) { clear = d; if (d < 0) hitIdx = k; }
    }));
    minClear = Math.min(minClear, clear);
    if (hitIdx >= 0) {
      status = 'hit';
      OBS[hitIdx].node.classList.add('hit');
      crash.setAttribute('cx', X(st.x)); crash.setAttribute('cy', X(st.y)); crash.setAttribute('r', 34);
    } else if (Math.hypot(GOAL.x - st.x, GOAL.y - st.y) < 0.45) {
      status = 'goal';
    }
  }

  function setLine(n, x1, y1, x2, y2) {
    n.setAttribute('x1', X(x1)); n.setAttribute('y1', X(y1));
    n.setAttribute('x2', X(x2)); n.setAttribute('y2', X(y2));
  }

  function render(t) {
    const deg = st.psi * 180 / Math.PI;
    boat.setAttribute('transform', `translate(${X(st.x)} ${X(st.y)}) rotate(${deg.toFixed(2)})`);
    waves.setAttribute('transform', `translate(${((t * 10) % 60).toFixed(1)} 0)`);
    const last2 = pts[pts.length - 1];
    if (!last2 || Math.hypot(last2[0] - st.x, last2[1] - st.y) > 0.08) {
      pts.push([st.x, st.y]); if (pts.length > 400) pts.shift();
      trail.setAttribute('points', pts.map(([x, y]) => X(x) + ',' + X(y)).join(' '));
    }
    // command arrows from the bow: length ~ thrust, angle ~ yaw moment
    const bow = { x: st.x + 0.62 * Math.cos(st.psi), y: st.y + 0.62 * Math.sin(st.psi) };
    const arrow = (n, T, N) => {
      const len = 0.25 + Math.max(0, T) / VES.Tmax * 1.4;
      const a = st.psi + Math.max(-1, Math.min(1, N / VES.Nmax)) * 0.9;
      setLine(n, bow.x, bow.y, bow.x + len * Math.cos(a), bow.y + len * Math.sin(a));
    };
    arrow(nomArrow, last.nom.T, last.nom.N);
    arrow(safeArrow, last.cmd.T, last.cmd.N);
    const aB = (-VES.Tmin) / VES.m;
    const sd = st.u > 0 ? (st.u * st.u) / (2 * aB) : 0;
    setLine(stopBar, bow.x, bow.y, bow.x + sd * Math.cos(st.psi), bow.y + sd * Math.sin(st.psi));

    hud.mode.textContent = mode === 'mass' ? 'Mass-aware HOCBF' : 'Accel-based (no mass)';
    hud.speed.textContent = st.u.toFixed(2) + ' m/s';
    hud.clear.textContent = isFinite(minClear) ? (Math.max(0, minClear)).toFixed(2) + ' m' : '–';
    hud.status.textContent = status === 'run' ? 'Running' : status === 'goal' ? 'Goal reached ✓' : 'Collision ✕';
    hud.status.parentElement.classList.toggle('warn', status === 'hit');
    hud.clear.parentElement.classList.toggle('warn', minClear < 0.05);
  }

  // ---------- loop ----------
  reset();
  sense();
  render(0);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = false, lastTs = 0, time = 0, started = !reduced;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0.1 }).observe(svg);
  if (reduced) {
    const b = document.getElementById('usv-restart');
    b.textContent = 'Play run';
    b.addEventListener('click', () => { started = true; });
  }
  function frame(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    if (visible && started) {
      const sub = 4, h = dt * 1.6 / sub;     // runs ~1.6x real time
      for (let i = 0; i < sub; i++) step(h);
      time += dt;
      render(time);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // expose for quick testing in the console
  window.__usv = { get state() { return { ...st, status, minClear }; }, setMode: (m) => { mode = m; reset(); },
    simulate: (secs) => { const h = 0.01; for (let i = 0; i < secs / h && status === 'run'; i++) step(h); render(time); return { status, minClear: +minClear.toFixed(3), x: +st.x.toFixed(2), y: +st.y.toFixed(2) }; } };
})();
