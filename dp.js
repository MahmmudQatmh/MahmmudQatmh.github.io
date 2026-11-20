// Dynamic positioning: interactive top-down animation.
// A simplified planar vessel model with wind, current and wave motion,
// a PD + integral position/heading controller with wind feed-forward,
// and a visual thrust allocation over 2 bow tunnels + 2 aft azimuths.
(function () {
  const svg = document.getElementById('dp-svg');
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.appendChild(n);
    return n;
  };

  const SP = { x: 380, y: 250 };          // setpoint (px)
  const M_PER_PX = 0.2;                   // 1 px = 0.2 m
  const WEATHER = [
    { name: 'Calm', wind: 2.5, wave: 1.2, ms: 5 },
    { name: 'Moderate', wind: 6.5, wave: 2.6, ms: 12 },
    { name: 'Rough', wind: 11, wave: 4.5, ms: 20 },
  ];

  // ---------- static scene ----------
  const defs = el('defs');
  defs.innerHTML = `

    <marker id="ah-t" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#ff8a3d"/></marker>
    <marker id="ah-w" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#9fd8ff"/></marker>
    <marker id="ah-c" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#7be3c8"/></marker>
    <pattern id="waves" width="60" height="22" patternUnits="userSpaceOnUse">
      <path d="M0 11 q15 -7 30 0 t30 0" fill="none" stroke="var(--dp-wave)" stroke-width="1.4"/></pattern>`;

  el('rect', { x: 0, y: 0, width: 800, height: 480, fill: 'var(--dp-sea)' });
  const waveLayer = el('rect', { x: -60, y: -22, width: 920, height: 524, fill: 'url(#waves)', opacity: .55 });

  // seabed hints (HiPAP transponders, taut-wire weight)
  const seabed = el('g', { class: 'dp-seabed' });
  const transponders = [{ x: 250, y: 395 }, { x: 545, y: 410 }, { x: 255, y: 120 }];
  transponders.forEach((p) => {
    el('circle', { cx: p.x, cy: p.y, r: 9, class: 'tp' }, seabed);
    el('circle', { cx: p.x, cy: p.y, r: 3, class: 'tp-core' }, seabed);
  });
  const clump = { x: 470, y: 330 };
  el('rect', { x: clump.x - 6, y: clump.y - 6, width: 12, height: 12, rx: 2, class: 'clump' }, seabed);
  el('text', { x: 250, y: 425, class: 'lbl small-lbl', 'text-anchor': 'middle' }, seabed).textContent = 'seabed transponder';
  el('text', { x: clump.x, y: clump.y + 22, class: 'lbl small-lbl', 'text-anchor': 'middle' }, seabed).textContent = 'taut-wire weight';

  // platform / FPSO for relative sensors
  const plat = el('g', { class: 'platform' });
  el('rect', { x: 690, y: 120, width: 96, height: 250, rx: 10 }, plat);
  el('text', { x: 738, y: 250, 'text-anchor': 'middle', class: 'lbl', transform: 'rotate(90 738 250)' }, plat).textContent = 'PLATFORM / FPSO';
  const targets = [{ x: 692, y: 175 }, { x: 692, y: 315 }];
  targets.forEach((p) => el('circle', { cx: p.x, cy: p.y, r: 5, class: 'reflector' }, plat));

  // satellites
  const sats = [{ x: 60, y: 40 }, { x: 175, y: 22 }, { x: 300, y: 38 }];
  sats.forEach((p) => {
    const g = el('g', { class: 'sat', transform: `translate(${p.x} ${p.y})` });
    el('rect', { x: -5, y: -5, width: 10, height: 10, rx: 2 }, g);
    el('rect', { x: -19, y: -3, width: 11, height: 6 }, g);
    el('rect', { x: 8, y: -3, width: 11, height: 6 }, g);
  });

  // setpoint + tolerance ring
  const spG = el('g', { class: 'setpoint' });
  el('circle', { cx: SP.x, cy: SP.y, r: 25 }, spG);
  el('line', { x1: SP.x - 12, y1: SP.y, x2: SP.x + 12, y2: SP.y }, spG);
  el('line', { x1: SP.x, y1: SP.y - 12, x2: SP.x, y2: SP.y + 12 }, spG);
  el('text', { x: SP.x - 120, y: SP.y - 4, class: 'lbl small-lbl' }, spG).textContent = 'setpoint ±5 m';

  const trail = el('polyline', { class: 'trail', points: '' });

  // sensor link lines (world coords, updated every frame)
  const links = el('g', { class: 'links' });
  const mk = (cls) => el('line', { class: 'link ' + cls }, links);
  const L = {
    gnss: sats.map(() => mk('l-gnss')),
    hipap: transponders.map(() => mk('l-hipap')),
    taut: [mk('l-taut')],
    radascan: targets.map(() => mk('l-radascan')),
    cyscan: targets.map(() => mk('l-cyscan')),
    spottrack: [mk('l-spottrack')],
    radius: targets.map(() => mk('l-radius')),
  };

  // environment arrows (top-left legend)
  const env = el('g', { class: 'env', transform: 'translate(70 420)' });
  el('circle', { r: 34, class: 'env-ring' }, env);
  const windArrow = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, class: 'wind-arrow', 'marker-end': 'url(#ah-w)' }, env);
  const curArrow = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, class: 'cur-arrow', 'marker-end': 'url(#ah-c)' }, env);
  el('text', { x: 44, y: -6, class: 'lbl small-lbl wind-txt' }, env).textContent = 'wind';
  el('text', { x: 44, y: 10, class: 'lbl small-lbl cur-txt' }, env).textContent = 'current';

  // ---------- ship (body frame, bow = -y) ----------
  const ship = el('g', { class: 'ship' });
  const thrusters = el('g', { class: 'thrust' }, ship);
  el('path', { class: 'hull', d: 'M0,-82 C18,-60 22,-30 22,0 L22,70 Q22,80 12,80 L-12,80 Q-22,80 -22,70 L-22,0 C-22,-30 -18,-60 0,-82 Z' }, ship);
  el('rect', { class: 'bridge', x: -16, y: -46, width: 32, height: 26, rx: 4 }, ship);
  el('rect', { class: 'deck', x: -15, y: 0, width: 30, height: 66, rx: 3 }, ship);
  ship.appendChild(thrusters);   // draw thrust arrows on top of the hull

  // thrust arrows (body frame): bow tunnels at y=-62,-50; aft azimuths at (±11, 74)
  const tBow1 = el('line', { class: 't-arrow', 'marker-end': 'url(#ah-t)' }, thrusters);
  const tBow2 = el('line', { class: 't-arrow', 'marker-end': 'url(#ah-t)' }, thrusters);
  const tAz1 = el('line', { class: 't-arrow', 'marker-end': 'url(#ah-t)' }, thrusters);
  const tAz2 = el('line', { class: 't-arrow', 'marker-end': 'url(#ah-t)' }, thrusters);

  // on-board sensor markers (body frame)
  const S = {
    gnss: { b: { x: -8, y: -30 }, label: 'GNSS' },
    gyro: { b: { x: 0, y: -10 }, label: 'Gyro' },
    mru: { b: { x: 0, y: 14 }, label: 'MRU' },
    wind: { b: { x: 8, y: -38 }, label: 'Wind' },
    hipap: { b: { x: 0, y: 34 }, label: 'HiPAP' },
    taut: { b: { x: 22, y: 46 }, label: 'Taut wire' },
    radascan: { b: { x: 12, y: -56 }, label: 'RadaScan' },
    cyscan: { b: { x: 6, y: -62 }, label: 'CyScan' },
    spottrack: { b: { x: -4, y: -64 }, label: 'SpotTrack' },
    radius: { b: { x: 14, y: -48 }, label: 'RADius' },
  };
  const markers = el('g', { class: 'markers' }, ship);
  for (const k in S) {
    const g = el('g', { class: 'mk mk-' + k, transform: `translate(${S[k].b.x} ${S[k].b.y})` }, markers);
    el('circle', { r: 9, class: 'mk-pulse' }, g);
    el('circle', { r: 3.2, class: 'mk-dot' }, g);
    S[k].node = g;
  }

  const shipLabel = el('text', { class: 'lbl ship-lbl', 'text-anchor': 'middle' });

  // ---------- sensor descriptions ----------
  const INFO = {
    gyro: ['Gyrocompass: heading', 'Measures the true heading of the vessel. Heading control and the conversion of every other sensor into north/east coordinates depend on it, so DP class 2 and 3 vessels usually carry three gyros and vote between them.'],
    mru: ['MRU / VRS: roll, pitch and heave', 'A motion reference unit (or vertical reference sensor) measures how the hull rolls, pitches and heaves. The DP uses it to correct the other sensors. For example, a GNSS antenna high on the mast swings metres when the ship rolls, even though the ship hasn\'t moved.'],
    wind: ['Wind sensor: feed-forward', 'Measures wind speed and direction. The controller converts it into an expected wind force and counters it right away (feed-forward), before the gust has pushed the vessel off position.'],
    gnss: ['DGNSS: satellite position', 'GPS and other satellite systems, with differential corrections, give an absolute position on Earth. It\'s the main reference on most vessels, usually from two or more independent receivers. It can be shadowed close to a large platform.'],
    hipap: ['HiPAP: hydroacoustic positioning', 'A transducer under the hull sends acoustic pulses to transponders placed on the seabed and measures the range and direction of the replies. This gives position relative to the seabed, which is ideal for deep-water drilling and subsea work.'],
    taut: ['Taut wire: mechanical reference', 'A weight is lowered to the seabed on a wire kept at constant tension. Sensors measure the wire\'s angle, which together with the water depth gives the vessel\'s offset from the weight. Simple and robust, but best in shallower water.'],
    radascan: ['RadaScan: microwave radar', 'A rotating radar on the vessel measures range and bearing to small responders mounted on the platform or FPSO. The result is the vessel\'s position relative to that structure, which is what counts when working alongside it.'],
    cyscan: ['CyScan: laser', 'A rotating laser measures range and bearing to reflective prisms on the target structure. It\'s a relative reference, widely used on supply vessels working close to platforms.'],
    spottrack: ['SpotTrack: relative reference', 'A Kongsberg relative position reference that tracks a target on the structure the vessel is working next to. It gives the DP an independent relative measurement, adding redundancy alongside radar- or laser-based systems.'],
    radius: ['RADius: radar transponder system', 'A Kongsberg relative positioning system. An interrogator on the vessel measures range and bearing to small transponders on the target, with no moving parts. It works in conditions where lasers struggle, such as fog, rain and reflections.'],
  };
  const info = document.getElementById('sensor-info');
  const defaultInfo = info.innerHTML;
  let selected = null;

  function select(key) {
    selected = selected === key ? null : key;
    svg.classList.toggle('has-sel', !!selected);
    document.querySelectorAll('[data-sensor]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sensor === selected)));
    for (const k in S) S[k].node.classList.toggle('sel', k === selected);
    for (const k in L) L[k].forEach((n) => n.classList.toggle('sel', k === selected));
    svg.classList.toggle('sel-wind', selected === 'wind');
    if (selected) {
      const [t, d] = INFO[selected];
      info.innerHTML = `<b>${t}</b><p>${d}</p>`;
      shipLabel.textContent = S[selected].label;
    } else {
      info.innerHTML = defaultInfo;
      shipLabel.textContent = '';
    }
  }
  document.querySelectorAll('[data-sensor]').forEach((b) => {
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => select(b.dataset.sensor));
  });

  // ---------- simulation ----------
  const st = { x: 0, y: 0, vx: 0, vy: 0, psi: 0, r: 0, ix: 0, iy: 0 };
  let dpOn = true, weather = 1, t = 0, paused = false;
  const pts = [];

  const hud = {
    mode: document.getElementById('hud-mode'),
    pos: document.getElementById('hud-pos'),
    hdg: document.getElementById('hud-hdg'),
    wind: document.getElementById('hud-wind'),
  };

  document.querySelectorAll('[data-dp]').forEach((b) => b.addEventListener('click', () => {
    dpOn = b.dataset.dp === 'on';
    document.querySelectorAll('[data-dp]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    st.ix = st.iy = 0;
  }));
  const wIn = document.getElementById('dp-weather');
  const wOut = document.getElementById('dp-weather-label');
  wIn.addEventListener('input', () => {
    weather = +wIn.value;
    wOut.textContent = WEATHER[weather].name;
    wIn.setAttribute('aria-valuetext', WEATHER[weather].name);
  });
  const pauseBtn = document.getElementById('dp-pause');
  pauseBtn.addEventListener('click', () => { paused = !paused; pauseBtn.textContent = paused ? 'Play' : 'Pause'; });
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { paused = true; pauseBtn.textContent = 'Play'; }

  const setLine = (n, x1, y1, x2, y2) => {
    n.setAttribute('x1', x1.toFixed(1)); n.setAttribute('y1', y1.toFixed(1));
    n.setAttribute('x2', x2.toFixed(1)); n.setAttribute('y2', y2.toFixed(1));
  };

  function step(dt) {
    t += dt;
    const W = WEATHER[weather];
    const windTo = 0.35 + 0.35 * Math.sin(t * 0.05);           // blowing toward ~east-south-east
    const gust = 1 + 0.35 * Math.sin(t * 0.9) + 0.2 * Math.sin(t * 2.3 + 1);
    const Fw = W.wind * gust;
    const fwx = Fw * Math.cos(windTo), fwy = Fw * Math.sin(windTo);
    const cur = { x: 1.2, y: -0.9 };                              // steady current
    const hdgDir = st.psi - Math.PI / 2;
    const Menv = 0.02 * Fw * Math.sin(windTo - hdgDir);

    let fcx = 0, fcy = 0, mc = 0;
    if (dpOn) {
      st.ix = Math.max(-40, Math.min(40, st.ix + st.x * dt));
      st.iy = Math.max(-40, Math.min(40, st.iy + st.y * dt));
      fcx = -1.1 * st.x - 2.1 * st.vx - 0.12 * st.ix - fwx;   // PD + I + wind feed-forward
      fcy = -1.1 * st.y - 2.1 * st.vy - 0.12 * st.iy - fwy;
      const mag = Math.hypot(fcx, fcy), lim = 18;
      if (mag > lim) { fcx *= lim / mag; fcy *= lim / mag; }
      mc = -1.6 * st.psi - 2.4 * st.r - Menv;
    }
    const c = 0.45;
    st.vx += (fwx + cur.x + fcx - c * st.vx) * dt;
    st.vy += (fwy + cur.y + fcy - c * st.vy) * dt;
    st.r += (Menv + mc - 0.6 * st.r) * dt;
    st.x += st.vx * dt; st.y += st.vy * dt; st.psi += st.r * dt;

    const d = Math.hypot(st.x, st.y), maxD = 230;
    if (d > maxD) { st.x *= maxD / d; st.y *= maxD / d; st.vx *= 0.5; st.vy *= 0.5; }
    st.psi = Math.max(-1.2, Math.min(1.2, st.psi));

    return { fcx, fcy, mc, windTo, Fw, cur, W };
  }

  function render(s) {
    const wave = s.W.wave * Math.sin(t * 1.4);                 // wave-frequency motion (filtered by DP)
    const X = SP.x + st.x + wave * 0.6, Y = SP.y + st.y + wave * 0.4;
    const deg = st.psi * 180 / Math.PI;
    ship.setAttribute('transform', `translate(${X.toFixed(1)} ${Y.toFixed(1)}) rotate(${deg.toFixed(2)})`);
    waveLayer.setAttribute('transform', `translate(${((t * 18) % 60).toFixed(1)} ${((t * 6) % 22).toFixed(1)})`);

    // body->world helper
    const cs = Math.cos(st.psi), sn = Math.sin(st.psi);
    const w = (b) => ({ x: X + b.x * cs - b.y * sn, y: Y + b.x * sn + b.y * cs });

    // trail
    if (pts.length === 0 || Math.hypot(pts[pts.length - 1].x - X, pts[pts.length - 1].y - Y) > 2) {
      pts.push({ x: X, y: Y }); if (pts.length > 160) pts.shift();
      trail.setAttribute('points', pts.map((p) => p.x.toFixed(0) + ',' + p.y.toFixed(0)).join(' '));
    }

    // thrust allocation (body frame) — visual only
    const fbx = s.fcx * cs + s.fcy * sn;           // body x (starboard)
    const fby = -s.fcx * sn + s.fcy * cs;          // body y (aft)
    const Lb = 1.6;
    const bow = fbx * 0.5 + s.mc * 6 / Lb;         // tunnels take sway + yaw
    const aftSway = fbx * 0.5 - s.mc * 6 / Lb;
    const k = 7;
    const tl = (n, x, y, dx, dy) => {
      const m = Math.hypot(dx, dy);
      n.style.opacity = m < 0.4 ? 0 : 1;
      setLine(n, x, y, x + dx * k, y + dy * k);
    };
    tl(tBow1, 0, -62, bow / 2, 0);
    tl(tBow2, 0, -50, bow / 2, 0);
    tl(tAz1, -11, 74, aftSway / 2, fby / 2);
    tl(tAz2, 11, 74, aftSway / 2, fby / 2);

    // sensor links
    const P = (k) => w(S[k].b);
    const g = P('gnss'); L.gnss.forEach((n, i) => setLine(n, g.x, g.y, sats[i].x, sats[i].y));
    const h = P('hipap'); L.hipap.forEach((n, i) => setLine(n, h.x, h.y, transponders[i].x, transponders[i].y));
    const tw = P('taut'); setLine(L.taut[0], tw.x, tw.y, clump.x, clump.y);
    ['radascan', 'cyscan', 'radius'].forEach((key) => {
      const p = P(key); L[key].forEach((n, i) => setLine(n, p.x, p.y, targets[i].x, targets[i].y));
    });
    const sp = P('spottrack'); setLine(L.spottrack[0], sp.x, sp.y, targets[0].x, targets[0].y);
    if (selected) { const p = P(selected); shipLabel.setAttribute('x', p.x.toFixed(0)); shipLabel.setAttribute('y', (p.y - 16).toFixed(0)); }

    // environment legend
    const wl = Math.min(56, 18 + s.Fw * 3);
    setLine(windArrow, -Math.cos(s.windTo) * wl / 2, -Math.sin(s.windTo) * wl / 2, Math.cos(s.windTo) * wl / 2, Math.sin(s.windTo) * wl / 2);
    setLine(curArrow, -s.cur.x * 6, -s.cur.y * 6, s.cur.x * 6, s.cur.y * 6);

    // HUD (estimated position = filtered, i.e. without wave motion)
    const err = Math.hypot(st.x, st.y) * M_PER_PX;
    hud.mode.textContent = dpOn ? 'ON · auto position' : 'OFF · drifting';
    hud.mode.parentElement.classList.toggle('warn', !dpOn);
    hud.pos.textContent = err.toFixed(1) + ' m';
    hud.pos.parentElement.classList.toggle('warn', err > 5);
    hud.hdg.textContent = (st.psi * 180 / Math.PI).toFixed(1) + '°';
    hud.wind.textContent = Math.round(s.W.ms * (s.Fw / s.W.wind)) + ' m/s';
  }

  // run only while visible
  let visible = false, last = 0, lastS = step(0);
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0.05 }).observe(svg);
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts;
    if (visible && !paused) {
      // two sub-steps per frame, simulation runs ~1.5x real time
      lastS = step(dt * 0.75); lastS = step(dt * 0.75);
      render(lastS);
    }
    requestAnimationFrame(frame);
  }
  render(lastS);
  requestAnimationFrame(frame);
})();
