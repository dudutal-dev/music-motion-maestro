/* ============================================================
   performer.js — THE CROWN JEWEL
   A character that actually plays: the fretting hand lands on the
   real chord shape at the real fret, the pianist's fingers press
   the real keys, and the body rides the real beat grid.

   Accuracy notes:
   - Fret spacing uses the true rule d(n) = S * (1 - 2^(-n/12)),
     so the drawn fretboard is geometrically correct, not evenly
     spaced. Finger dots sit between frets like real fingers do.
   - Arms are solved with 2-bone IK, so the hand reaching fret 1
     and the hand reaching fret 8 produce genuinely different arm
     poses instead of a canned wiggle.
   ============================================================ */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const MM = global.MM;

  const el = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /** Two-bone IK: returns elbow point so that hand reaches target. */
  function solveIK(sx, sy, tx, ty, l1, l2, bend) {
    let dx = tx - sx, dy = ty - sy;
    let d = Math.hypot(dx, dy);
    const max = (l1 + l2) * 0.999;
    if (d > max) { const k = max / d; dx *= k; dy *= k; d = max; }
    if (d < 1e-3) d = 1e-3;
    const base = Math.atan2(dy, dx);
    const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    const a = Math.acos(cosA);
    const ang = base + a * (bend || 1);
    return {
      ex: sx + l1 * Math.cos(ang),
      ey: sy + l1 * Math.sin(ang),
      hx: sx + dx, hy: sy + dy
    };
  }

  /* ============================================================
     GUITAR SCENE
     ============================================================ */
  const G = {
    nut:  { x: 762, y: 228 },      // neck points up-right, body over the lap
    heel: { x: 400, y: 372 },
    head: { x: 400, y: 140, r: 52 },
    shFret:  { x: 478, y: 262 },   // fretting-arm shoulder (viewer right)
    shStrum: { x: 322, y: 262 },   // strumming-arm shoulder (viewer left)
    hip:  { x: 400, y: 486 },
    upper: 146, fore: 139,
    frets: 14
  };
  // neck basis
  G.L = Math.hypot(G.heel.x - G.nut.x, G.heel.y - G.nut.y);
  G.ux = (G.heel.x - G.nut.x) / G.L;   // along neck, nut -> heel
  G.uy = (G.heel.y - G.nut.y) / G.L;
  G.px = -G.uy; G.py = G.ux;           // perpendicular ("up" side = +)
  G.scale = G.L / (1 - Math.pow(2, -G.frets / 12));
  G.angle = Math.atan2(G.uy, G.ux) * 180 / Math.PI;

  const fretDist = n => G.scale * (1 - Math.pow(2, -n / 12));
  const halfWidth = dist => lerp(26, 38, clamp(dist / G.L, 0, 1));
  function neckPoint(dist, off) {
    return {
      x: G.nut.x + G.ux * dist + G.px * (off || 0),
      y: G.nut.y + G.uy * dist + G.py * (off || 0)
    };
  }
  // The body is built along the same axis as the neck, so the instrument
  // reads as one object instead of a neck glued to a blob.
  G.upperBout = () => neckPoint(G.L + 42);
  G.lowerBout = () => neckPoint(G.L + 132);
  G.soundhole = () => neckPoint(G.L + 64);
  G.bridge    = () => neckPoint(G.L + 122);
  /** string i: 0 = low E (visually top) .. 5 = high e */
  const stringOff = (i, dist) => ((2.5 - i) / 2.5) * halfWidth(dist);
  /** where a finger sits for string i pressed at fret n */
  function fingerPoint(i, n) {
    const d = (fretDist(n - 1) + fretDist(n)) / 2;
    return neckPoint(d, stringOff(i, d));
  }

  /* ============================================================
     PIANO SCENE
     ============================================================ */
  const P = {
    x0: 54, y: 330, whiteW: 36, whiteH: 155, blackW: 22, blackH: 100,
    startMidi: 48, octaves: 3,          // C3 .. C6
    head: { x: 450, y: 118, r: 46 },
    shL: { x: 385, y: 208 }, shR: { x: 515, y: 208 },
    upper: 128, fore: 120
  };
  const isBlack = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

  /** Build the key layout once: [{midi, black, x, w, h}] */
  function pianoKeys() {
    const keys = [];
    const total = P.octaves * 12 + 1;
    let wi = 0;
    for (let k = 0; k < total; k++) {
      const midi = P.startMidi + k;
      if (!isBlack(midi)) {
        keys.push({ midi, black: false, x: P.x0 + wi * P.whiteW, w: P.whiteW, h: P.whiteH });
        wi++;
      } else {
        // black key sits between the previous and next white
        const x = P.x0 + wi * P.whiteW - P.blackW / 2;
        keys.push({ midi, black: true, x, w: P.blackW, h: P.blackH });
      }
    }
    return keys;
  }
  const keyCenter = k => k.x + k.w / 2;

  /* ============================================================
     Performer factory
     ============================================================ */
  function create(container) {
    let instrument = 'guitar';
    let svg = null;
    const refs = {};
    let keys = [];
    let currentChord = null;
    let smoothSway = 0, smoothStrum = 0;

    function defs() {
      const d = el('defs');
      d.innerHTML = `
        <linearGradient id="mm-wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#3a2416"/><stop offset="55%" stop-color="#5a3a22"/>
          <stop offset="100%" stop-color="#2a1810"/>
        </linearGradient>
        <linearGradient id="mm-body" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stop-color="#d98b3a"/><stop offset="45%" stop-color="#b8641f"/>
          <stop offset="100%" stop-color="#6d3410"/>
        </linearGradient>
        <linearGradient id="mm-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f2c9a4"/><stop offset="100%" stop-color="#d9a276"/>
        </linearGradient>
        <linearGradient id="mm-cloth" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stop-color="#2b3550"/><stop offset="100%" stop-color="#141a2a"/>
        </linearGradient>
        <linearGradient id="mm-white" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff"/><stop offset="88%" stop-color="#e8e8ec"/>
          <stop offset="100%" stop-color="#c9c9d2"/>
        </linearGradient>
        <linearGradient id="mm-black" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2a2a30"/><stop offset="100%" stop-color="#0b0b0e"/>
        </linearGradient>
        <radialGradient id="mm-spot" cx="50%" cy="10%" r="75%">
          <stop offset="0%" stop-color="rgba(0,229,208,.16)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
        </radialGradient>
        <filter id="mm-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="mm-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="#000" flood-opacity=".55"/>
        </filter>`;
      return d;
    }

    function limb(cls, w, color) {
      const g = el('g', { class: cls });
      const a = el('line', { 'stroke-width': w, stroke: color, 'stroke-linecap': 'round' });
      const b = el('line', { 'stroke-width': w * 0.85, stroke: color, 'stroke-linecap': 'round' });
      g.appendChild(a); g.appendChild(b);
      return { g, a, b };
    }

    /* ---------- guitar build ---------- */
    function buildGuitar() {
      svg = el('svg', { viewBox: '0 0 900 560', preserveAspectRatio: 'xMidYMid meet' });
      svg.appendChild(defs());
      svg.appendChild(el('rect', { x: 0, y: 0, width: 900, height: 560, fill: 'url(#mm-spot)' }));
      // floor glow
      svg.appendChild(el('ellipse', { cx: 340, cy: 528, rx: 210, ry: 20, fill: 'rgba(0,229,208,.07)' }));

      /* body group (sways) */
      const body = el('g', { id: 'mm-bodyg' });
      refs.body = body;
      // torso: shoulders -> waist -> hips, with rounded shoulder caps
      const sl = G.shStrum, sr = G.shFret, hp = G.hip;
      // neck first so the torso overlaps its base — no floating head
      body.appendChild(el('rect', {
        x: G.head.x - 18, y: G.head.y + 30, width: 36, height: 62, rx: 15, fill: 'url(#mm-skin)'
      }));
      body.appendChild(el('path', {
        d: `M ${sl.x - 4} ${sl.y - 26}
            C ${sl.x - 40} ${sl.y - 18}, ${sl.x - 46} ${sl.y + 60}, ${hp.x - 72} ${hp.y - 6}
            L ${hp.x - 64} ${hp.y + 30} L ${hp.x + 64} ${hp.y + 30} L ${hp.x + 72} ${hp.y - 6}
            C ${sr.x + 46} ${sr.y + 60}, ${sr.x + 40} ${sr.y - 18}, ${sr.x + 4} ${sr.y - 26}
            Q ${G.head.x} ${sl.y - 44}, ${sl.x - 4} ${sl.y - 26} Z`,
        fill: 'url(#mm-cloth)', stroke: 'rgba(255,255,255,.1)', 'stroke-width': 1.5
      }));
      body.appendChild(el('circle', { cx: sl.x, cy: sl.y - 8, r: 30, fill: 'url(#mm-cloth)' }));
      body.appendChild(el('circle', { cx: sr.x, cy: sr.y - 8, r: 30, fill: 'url(#mm-cloth)' }));
      const head = el('g', { id: 'mm-head' });
      head.appendChild(el('ellipse', { cx: G.head.x, cy: G.head.y, rx: G.head.r * .82, ry: G.head.r, fill: 'url(#mm-skin)' }));
      head.appendChild(el('path', {
        d: `M ${G.head.x - 41} ${G.head.y - 8} C ${G.head.x - 46} ${G.head.y - 58}, ${G.head.x + 46} ${G.head.y - 60}, ${G.head.x + 40} ${G.head.y - 6}
            C ${G.head.x + 30} ${G.head.y - 34}, ${G.head.x - 28} ${G.head.y - 36}, ${G.head.x - 41} ${G.head.y - 8} Z`,
        fill: '#241a14'
      }));
      head.appendChild(el('circle', { cx: G.head.x - 15, cy: G.head.y + 2, r: 3.4, fill: '#1a1410' }));
      head.appendChild(el('circle', { cx: G.head.x + 15, cy: G.head.y + 2, r: 3.4, fill: '#1a1410' }));
      refs.mouth = el('path', { d: `M ${G.head.x - 9} ${G.head.y + 22} q 9 6 18 0`, stroke: '#1a1410', 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round' });
      head.appendChild(refs.mouth);
      refs.head = head;
      body.appendChild(head);
      svg.appendChild(body);

      /* guitar (static — keeps the fretboard exactly readable) */
      const gtr = el('g', { filter: 'url(#mm-soft)' });
      const lb = G.lowerBout(), ub = G.upperBout(), sh = G.soundhole(), br = G.bridge();
      // bouts, rotated onto the neck axis so the whole instrument reads as one object
      gtr.appendChild(el('ellipse', {
        cx: lb.x, cy: lb.y, rx: 96, ry: 84, fill: 'url(#mm-body)',
        transform: `rotate(${G.angle} ${lb.x} ${lb.y})`
      }));
      gtr.appendChild(el('ellipse', {
        cx: ub.x, cy: ub.y, rx: 74, ry: 66, fill: 'url(#mm-body)',
        transform: `rotate(${G.angle} ${ub.x} ${ub.y})`
      }));
      gtr.appendChild(el('circle', { cx: sh.x, cy: sh.y, r: 27, fill: '#120904' }));
      gtr.appendChild(el('circle', { cx: sh.x, cy: sh.y, r: 30.5, fill: 'none', stroke: '#e0b070', 'stroke-width': 2.5, opacity: .5 }));
      // neck
      const nHalfN = halfWidth(0) + 6, nHalfH = halfWidth(G.L) + 6;
      const c1 = neckPoint(0, nHalfN), c2 = neckPoint(0, -nHalfN);
      const c3 = neckPoint(G.L + 16, -nHalfH), c4 = neckPoint(G.L + 16, nHalfH);
      gtr.appendChild(el('path', {
        d: `M ${c1.x} ${c1.y} L ${c2.x} ${c2.y} L ${c3.x} ${c3.y} L ${c4.x} ${c4.y} Z`,
        fill: 'url(#mm-wood)'
      }));
      // headstock
      const h1 = neckPoint(-14, nHalfN + 7), h2 = neckPoint(-14, -nHalfN - 7);
      const h3 = neckPoint(-62, -nHalfN - 11), h4 = neckPoint(-62, nHalfN + 11);
      gtr.appendChild(el('path', {
        d: `M ${h1.x} ${h1.y} L ${h2.x} ${h2.y} L ${h3.x} ${h3.y} L ${h4.x} ${h4.y} Z`,
        fill: '#2a1810', stroke: 'rgba(0,0,0,.5)'
      }));
      // frets + markers
      for (let n = 0; n <= G.frets; n++) {
        const d = fretDist(n), hw = halfWidth(d);
        const a = neckPoint(d, hw + 2), b = neckPoint(d, -hw - 2);
        gtr.appendChild(el('line', {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          stroke: n === 0 ? '#f0ead8' : '#b9bcc4',
          'stroke-width': n === 0 ? 5 : 2.2, 'stroke-linecap': 'round'
        }));
        if ([3, 5, 7, 9, 12].includes(n)) {
          const md = (fretDist(n - 1) + d) / 2;
          const pt = neckPoint(md, 0);
          gtr.appendChild(el('circle', { cx: pt.x, cy: pt.y, r: n === 12 ? 4 : 3.4, fill: 'rgba(255,255,255,.5)' }));
        }
      }
      // bridge, then strings running nut -> bridge (refs kept for vibration)
      gtr.appendChild(el('rect', {
        x: br.x - 46, y: br.y - 6, width: 92, height: 12, rx: 4, fill: '#1a0f08',
        transform: `rotate(${G.angle + 90} ${br.x} ${br.y})`
      }));
      refs.strings = [];
      for (let i = 0; i < 6; i++) {
        const a = neckPoint(-52, stringOff(i, 0) * 0.72);
        const b = neckPoint(G.L + 122, stringOff(i, G.L) * 0.46);
        const s = el('line', {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          stroke: i < 3 ? '#c9a86a' : '#dfe4ec',
          'stroke-width': 1 + (5 - i) * 0.34, opacity: .95
        });
        refs.strings.push(s); gtr.appendChild(s);
      }
      svg.appendChild(gtr);

      /* finger markers are created here but appended last: the fingering is the
         whole point of this view, so nothing may occlude it. */
      refs.fingers = el('g', { id: 'mm-fingers' });

      /* arms on top */
      refs.armFret = limb('arm-fret', 21, 'url(#mm-skin)');
      refs.armStrum = limb('arm-strum', 21, 'url(#mm-skin)');
      svg.appendChild(refs.armStrum.g);
      svg.appendChild(refs.armFret.g);
      refs.handFret = el('ellipse', { rx: 17, ry: 13, fill: 'url(#mm-skin)', stroke: 'rgba(0,0,0,.25)' });
      refs.handStrum = el('ellipse', { rx: 15, ry: 12, fill: 'url(#mm-skin)', stroke: 'rgba(0,0,0,.25)' });
      svg.appendChild(refs.handFret);
      svg.appendChild(refs.handStrum);
      refs.pick = el('path', { d: 'M -6 -7 L 6 -7 L 0 8 Z', fill: '#ffd166', opacity: .95 });
      svg.appendChild(refs.pick);
      svg.appendChild(refs.fingers);   // always the top layer

      container.innerHTML = '';
      container.appendChild(svg);
    }

    /* ---------- piano build ---------- */
    function buildPiano() {
      svg = el('svg', { viewBox: '0 0 900 560', preserveAspectRatio: 'xMidYMid meet' });
      svg.appendChild(defs());
      svg.appendChild(el('rect', { x: 0, y: 0, width: 900, height: 560, fill: 'url(#mm-spot)' }));

      /* body (sways) */
      const body = el('g', { id: 'mm-bodyg' });
      refs.body = body;
      body.appendChild(el('rect', {
        x: P.head.x - 17, y: P.head.y + 28, width: 34, height: 72, rx: 14, fill: 'url(#mm-skin)'
      }));
      body.appendChild(el('path', {
        d: `M ${P.shL.x - 22} ${P.shL.y} C ${P.shL.x - 46} ${P.shL.y + 70}, ${P.shL.x - 40} ${P.y}, ${P.shL.x - 30} ${P.y + 10}
            L ${P.shR.x + 30} ${P.y + 10} C ${P.shR.x + 40} ${P.y}, ${P.shR.x + 46} ${P.shR.y + 70}, ${P.shR.x + 22} ${P.shR.y} Z`,
        fill: 'url(#mm-cloth)', stroke: 'rgba(255,255,255,.09)', 'stroke-width': 1.5
      }));
      body.appendChild(el('circle', { cx: P.shL.x, cy: P.shL.y + 4, r: 28, fill: 'url(#mm-cloth)' }));
      body.appendChild(el('circle', { cx: P.shR.x, cy: P.shR.y + 4, r: 28, fill: 'url(#mm-cloth)' }));

      const head = el('g');
      head.appendChild(el('ellipse', { cx: P.head.x, cy: P.head.y, rx: P.head.r * .82, ry: P.head.r, fill: 'url(#mm-skin)' }));
      head.appendChild(el('path', {
        d: `M ${P.head.x - 39} ${P.head.y - 8} C ${P.head.x - 44} ${P.head.y - 56}, ${P.head.x + 44} ${P.head.y - 58}, ${P.head.x + 38} ${P.head.y - 6}
            C ${P.head.x + 28} ${P.head.y - 32}, ${P.head.x - 26} ${P.head.y - 34}, ${P.head.x - 39} ${P.head.y - 8} Z`,
        fill: '#241a14'
      }));
      head.appendChild(el('circle', { cx: P.head.x - 14, cy: P.head.y + 2, r: 3.3, fill: '#1a1410' }));
      head.appendChild(el('circle', { cx: P.head.x + 14, cy: P.head.y + 2, r: 3.3, fill: '#1a1410' }));
      refs.head = head;
      body.appendChild(head);
      svg.appendChild(body);

      /* piano case */
      const piano = el('g', { filter: 'url(#mm-soft)' });
      piano.appendChild(el('rect', { x: P.x0 - 20, y: P.y - 52, width: P.octaves * 7 * P.whiteW + 41, height: 52, rx: 7, fill: '#15151a', stroke: 'rgba(255,255,255,.08)' }));
      piano.appendChild(el('rect', { x: P.x0 - 20, y: P.y - 10, width: P.octaves * 7 * P.whiteW + 41, height: 14, rx: 4, fill: '#0c0c10' }));
      svg.appendChild(piano);

      /* keys */
      keys = pianoKeys();
      refs.keyEls = {};
      const whites = el('g'), blacks = el('g');
      for (const k of keys) {
        const r = el('rect', {
          x: k.x, y: P.y, width: k.w, height: k.h, rx: k.black ? 3 : 4,
          fill: k.black ? 'url(#mm-black)' : 'url(#mm-white)',
          stroke: k.black ? '#000' : 'rgba(0,0,0,.35)', 'stroke-width': k.black ? 1 : .8
        });
        refs.keyEls[k.midi] = r;
        (k.black ? blacks : whites).appendChild(r);
      }
      svg.appendChild(whites); svg.appendChild(blacks);

      /* arms over the case, then hands, then finger numbers on top so the
         fingering stays readable even under a hand */
      refs.armL = limb('arm-l', 19, 'url(#mm-skin)');
      refs.armR = limb('arm-r', 19, 'url(#mm-skin)');
      svg.appendChild(refs.armL.g); svg.appendChild(refs.armR.g);

      refs.handL = el('ellipse', { rx: 24, ry: 13, fill: 'url(#mm-skin)', stroke: 'rgba(0,0,0,.25)' });
      refs.handR = el('ellipse', { rx: 24, ry: 13, fill: 'url(#mm-skin)', stroke: 'rgba(0,0,0,.25)' });
      svg.appendChild(refs.handL); svg.appendChild(refs.handR);

      refs.pianoMarks = el('g');   // finger numbers
      svg.appendChild(refs.pianoMarks);

      container.innerHTML = '';
      container.appendChild(svg);
    }

    /* ---------- chord change: place the fingers ---------- */
    function setChord(name) {
      if (name === currentChord) return;
      currentChord = name;
      if (instrument === 'guitar') placeGuitarFingers(name);
      else placePianoFingers(name);
    }

    function placeGuitarFingers(name) {
      const g = refs.fingers;
      if (!g) return;
      while (g.firstChild) g.removeChild(g.firstChild);
      const f = name ? MM.guitarFingering(name) : null;
      refs.fretTarget = null;
      if (!f) return;

      // barre bar
      if (f.barre) {
        const d = (fretDist(f.baseFret - 1) + fretDist(f.baseFret)) / 2;
        const hw = halfWidth(d);
        const a = neckPoint(d, hw), b = neckPoint(d, -hw);
        g.appendChild(el('line', {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#00e5d0',
          'stroke-width': 15, 'stroke-linecap': 'round', opacity: .92, filter: 'url(#mm-glow)'
        }));
      }
      const pressed = [];
      f.shape.forEach((fret, i) => {
        if (fret === 'x') {
          const p = neckPoint(-46, stringOff(i, 0) * .75);
          g.appendChild(el('text', {
            x: p.x, y: p.y + 4, fill: 'rgba(255,255,255,.45)', 'font-size': 13,
            'text-anchor': 'middle', 'font-weight': 700
          })).textContent = '✕';
        } else if (fret === 0) {
          const p = neckPoint(-46, stringOff(i, 0) * .75);
          g.appendChild(el('circle', { cx: p.x, cy: p.y, r: 5.5, fill: 'none', stroke: '#ffffff', 'stroke-width': 2, opacity: .8 }));
        } else {
          const p = fingerPoint(i, fret);
          pressed.push(p);
          if (!(f.barre && fret === f.baseFret)) {
            // Adjacent strings put fingertips almost on top of each other — true to
            // life, so an outline keeps them readable as separate fingers.
            g.appendChild(el('circle', {
              cx: p.x, cy: p.y, r: 7.8, fill: '#00e5d0',
              stroke: '#00201d', 'stroke-width': 1.6
            }));
          }
          const fin = f.fingers[i];
          if (fin > 0) {
            const t = el('text', {
              x: p.x, y: p.y + 4.2, fill: '#00201d', 'font-size': 10,
              'text-anchor': 'middle', 'font-weight': 800
            });
            t.textContent = fin;
            g.appendChild(t);
          }
        }
      });
      // Palm sits just under the neck at the pressed cluster, fingers reaching over.
      const under = 36;   // along -p, i.e. the underside of the neck
      if (pressed.length) {
        const cx = pressed.reduce((s, p) => s + p.x, 0) / pressed.length;
        const cy = pressed.reduce((s, p) => s + p.y, 0) / pressed.length;
        refs.fretTarget = { x: cx - G.px * under, y: cy - G.py * under };
      } else {
        const p = neckPoint(fretDist(1), 0);
        refs.fretTarget = { x: p.x - G.px * under, y: p.y - G.py * under };
      }
    }

    function placePianoFingers(name) {
      if (!refs.keyEls) return;
      for (const m in refs.keyEls) {
        const k = keys.find(x => x.midi === +m);
        refs.keyEls[m].setAttribute('fill', k.black ? 'url(#mm-black)' : 'url(#mm-white)');
        refs.keyEls[m].setAttribute('y', P.y);
      }
      const marks = refs.pianoMarks;
      while (marks.firstChild) marks.removeChild(marks.firstChild);
      refs.activeKeys = []; refs.bassKey = null;

      const v = name ? MM.pianoVoicing(name, 4) : null;
      if (!v) { refs.rightTarget = null; refs.leftTarget = null; return; }

      const place = (midi, finger, isBass) => {
        const k = keys.find(x => x.midi === midi);
        if (!k) return null;
        const r = refs.keyEls[midi];
        r.setAttribute('fill', isBass ? '#35a0ff' : '#00e5d0');
        const t = el('text', {
          x: keyCenter(k), y: P.y + (k.black ? P.blackH - 14 : P.whiteH - 16),
          fill: '#00201d', 'font-size': 12, 'font-weight': 800, 'text-anchor': 'middle'
        });
        t.textContent = finger;
        marks.appendChild(t);
        const lbl = el('text', {
          x: keyCenter(k), y: P.y + P.whiteH + 18, fill: 'rgba(255,255,255,.55)',
          'font-size': 10.5, 'font-weight': 700, 'text-anchor': 'middle'
        });
        lbl.textContent = MM.PITCHES_HE[MM.PITCHES[((midi % 12) + 12) % 12]] || '';
        marks.appendChild(lbl);
        return k;
      };

      const active = [];
      for (const k of v.keys) {
        const kk = place(k.midi, k.finger, false);
        if (kk) active.push(kk);
      }
      refs.activeKeys = active;
      // bass: same pitch class, low register, inside our range
      let bassMidi = v.keys[0].midi - 12;
      while (bassMidi < P.startMidi) bassMidi += 12;
      const bk = place(bassMidi, 5, true);
      refs.bassKey = bk;

      refs.rightTarget = active.length
        ? { x: active.reduce((s, k) => s + keyCenter(k), 0) / active.length, y: P.y + 26 }
        : null;
      refs.leftTarget = bk ? { x: keyCenter(bk), y: P.y + 26 } : null;
    }

    /* ---------- per-frame update ---------- */
    /**
     * @param {object} s  { chord, beat:{phase,isDown,index}, playing, energy }
     */
    function update(s) {
      if (!svg) return;
      const beat = s.beat || { phase: 0, isDown: false, index: 0 };
      const energy = clamp(s.energy == null ? .6 : s.energy, .15, 1);
      const active = !!s.playing;

      setChord(s.chord || null);

      // Body sway: one full cycle per bar, plus a dip on each beat.
      const barPhase = ((beat.index % 4) + beat.phase) / 4;
      const swayTarget = active ? Math.sin(barPhase * Math.PI * 2) * (3.2 + energy * 3.4) : 0;
      smoothSway += (swayTarget - smoothSway) * 0.18;
      // beat "pump" — a quick downward accent right at the onset
      const pump = active ? Math.max(0, 1 - beat.phase * 5) * (beat.isDown ? 7 : 3.6) * energy : 0;

      if (instrument === 'guitar') updateGuitar(beat, energy, active, pump);
      else updatePiano(beat, energy, active, pump);
    }

    function updateGuitar(beat, energy, active, pump) {
      const hip = G.hip;
      refs.body.setAttribute('transform',
        `rotate(${smoothSway.toFixed(2)} ${hip.x} ${hip.y}) translate(0 ${pump.toFixed(2)})`);
      refs.head.setAttribute('transform',
        `rotate(${(-smoothSway * 0.5).toFixed(2)} ${G.head.x} ${G.head.y + 40})`);

      // rotated shoulder positions (they ride the body)
      const rot = (pt) => {
        const a = smoothSway * Math.PI / 180;
        const dx = pt.x - hip.x, dy = pt.y - hip.y;
        return { x: hip.x + dx * Math.cos(a) - dy * Math.sin(a), y: hip.y + dx * Math.sin(a) + dy * Math.cos(a) + pump };
      };
      const shF = rot(G.shFret), shS = rot(G.shStrum);

      // fretting hand -> the chord's palm position
      const ft = refs.fretTarget || neckPoint(fretDist(1), 22);
      const ik1 = solveIK(shF.x, shF.y, ft.x, ft.y, G.upper, G.fore, 1);
      refs.armFret.a.setAttribute('x1', shF.x); refs.armFret.a.setAttribute('y1', shF.y);
      refs.armFret.a.setAttribute('x2', ik1.ex); refs.armFret.a.setAttribute('y2', ik1.ey);
      refs.armFret.b.setAttribute('x1', ik1.ex); refs.armFret.b.setAttribute('y1', ik1.ey);
      refs.armFret.b.setAttribute('x2', ik1.hx); refs.armFret.b.setAttribute('y2', ik1.hy);
      refs.handFret.setAttribute('cx', ik1.hx); refs.handFret.setAttribute('cy', ik1.hy);
      refs.handFret.setAttribute('transform', `rotate(${G.angle + 90} ${ik1.hx} ${ik1.hy})`);

      // strumming hand: a real sweep across the strings, down on the beat
      const sweepRaw = beat.phase < 0.5 ? beat.phase * 2 : (1 - beat.phase) * 2;
      const sweep = active ? (sweepRaw * sweepRaw * (3 - 2 * sweepRaw)) : 0.5;  // smoothstep
      smoothStrum += (sweep - smoothStrum) * 0.5;
      const amp = 34 * energy * (beat.isDown ? 1.25 : 1);
      const sh = G.soundhole();
      // travel across the strings = along the perpendicular of the neck
      const sx = sh.x + G.px * (amp * 0.5 - smoothStrum * amp);
      const sy = sh.y + G.py * (amp * 0.5 - smoothStrum * amp);
      const ik2 = solveIK(shS.x, shS.y, sx, sy, G.upper, G.fore, 1);
      refs.armStrum.a.setAttribute('x1', shS.x); refs.armStrum.a.setAttribute('y1', shS.y);
      refs.armStrum.a.setAttribute('x2', ik2.ex); refs.armStrum.a.setAttribute('y2', ik2.ey);
      refs.armStrum.b.setAttribute('x1', ik2.ex); refs.armStrum.b.setAttribute('y1', ik2.ey);
      refs.armStrum.b.setAttribute('x2', ik2.hx); refs.armStrum.b.setAttribute('y2', ik2.hy);
      refs.handStrum.setAttribute('cx', ik2.hx); refs.handStrum.setAttribute('cy', ik2.hy);
      refs.pick.setAttribute('transform', `translate(${ik2.hx - 4} ${ik2.hy + 12}) rotate(${-18 + smoothStrum * 30})`);

      // string vibration right after the stroke passes
      const hit = active ? Math.max(0, 1 - beat.phase * 6) : 0;
      refs.strings.forEach((st, i) => {
        const wob = hit * (1.6 + i * .28) * Math.sin((beat.index * 7 + i) * 1.7);
        st.setAttribute('transform', `translate(0 ${wob.toFixed(2)})`);
        st.setAttribute('opacity', (0.75 + hit * 0.25).toFixed(2));
      });
      refs.mouth.setAttribute('d',
        `M ${G.head.x - 9} ${G.head.y + 22} q 9 ${4 + hit * 5} 18 0`);
    }

    function updatePiano(beat, energy, active, pump) {
      const pivotX = P.head.x, pivotY = P.y;
      refs.body.setAttribute('transform',
        `rotate(${(smoothSway * .8).toFixed(2)} ${pivotX} ${pivotY}) translate(0 ${pump.toFixed(2)})`);
      refs.head.setAttribute('transform',
        `rotate(${(-smoothSway * .5).toFixed(2)} ${P.head.x} ${P.head.y + 40})`);

      const rot = (pt) => {
        const a = smoothSway * .8 * Math.PI / 180;
        const dx = pt.x - pivotX, dy = pt.y - pivotY;
        return { x: pivotX + dx * Math.cos(a) - dy * Math.sin(a), y: pivotY + dx * Math.sin(a) + dy * Math.cos(a) + pump };
      };
      const shL = rot(P.shL), shR = rot(P.shR);

      // key attack: press on the beat onset, release through the beat
      const attack = active ? Math.max(0, 1 - beat.phase * 4.5) : 0;
      const dip = attack * 5;

      const rt = refs.rightTarget || { x: P.x0 + 380, y: P.y + 26 };
      const lt = refs.leftTarget || { x: P.x0 + 120, y: P.y + 26 };
      const ikR = solveIK(shR.x, shR.y, rt.x, rt.y + dip, P.upper, P.fore, -1);
      const ikL = solveIK(shL.x, shL.y, lt.x, lt.y + dip * (beat.isDown ? 1 : .5), P.upper, P.fore, 1);

      const wire = (limbRef, sh, ik, hand) => {
        limbRef.a.setAttribute('x1', sh.x); limbRef.a.setAttribute('y1', sh.y);
        limbRef.a.setAttribute('x2', ik.ex); limbRef.a.setAttribute('y2', ik.ey);
        limbRef.b.setAttribute('x1', ik.ex); limbRef.b.setAttribute('y1', ik.ey);
        limbRef.b.setAttribute('x2', ik.hx); limbRef.b.setAttribute('y2', ik.hy);
        hand.setAttribute('cx', ik.hx); hand.setAttribute('cy', ik.hy);
      };
      wire(refs.armR, shR, ikR, refs.handR);
      wire(refs.armL, shL, ikL, refs.handL);

      // physically depress the sounding keys
      const press = attack * 4;
      (refs.activeKeys || []).forEach(k => {
        const r = refs.keyEls[k.midi];
        if (r) r.setAttribute('y', P.y + press);
      });
      if (refs.bassKey) {
        const r = refs.keyEls[refs.bassKey.midi];
        if (r) r.setAttribute('y', P.y + (beat.isDown ? press : press * .4));
      }
    }

    /* ---------- public ---------- */
    function setInstrument(inst) {
      instrument = inst === 'piano' ? 'piano' : 'guitar';
      currentChord = null;
      if (instrument === 'guitar') buildGuitar(); else buildPiano();
    }

    setInstrument('guitar');
    return {
      update, setInstrument,
      get instrument() { return instrument; },
      refreshChord() { const c = currentChord; currentChord = null; setChord(c); }
    };
  }

  /* ============================================================
     Static diagrams (used by lessons + character panels)
     ============================================================ */
  function chordDiagramSVG(name, size) {
    const f = MM.guitarFingering(name);
    const W = size || 150, H = W * 1.3;
    if (!f) return `<svg width="${W}" height="${H}"></svg>`;
    const padX = W * .16, padTop = H * .18, gw = W - padX * 2, gh = H - padTop - H * .1;
    const nStr = 6, nFret = 5;
    const sx = gw / (nStr - 1), sy = gh / nFret;
    const startFret = f.baseFret > 4 ? f.baseFret : 1;
    let s = `<svg class="fretboard-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    // nut / position marker
    if (startFret === 1) s += `<rect x="${padX - 2}" y="${padTop - 5}" width="${gw + 4}" height="5" rx="2" fill="#e8e8ee"/>`;
    else s += `<text x="${padX - 10}" y="${padTop + sy * .7}" fill="rgba(255,255,255,.6)" font-size="11" text-anchor="end" font-weight="700">${startFret}</text>`;
    for (let i = 0; i <= nFret; i++)
      s += `<line x1="${padX}" y1="${padTop + i * sy}" x2="${padX + gw}" y2="${padTop + i * sy}" stroke="rgba(255,255,255,.22)" stroke-width="1.2"/>`;
    for (let i = 0; i < nStr; i++)
      s += `<line x1="${padX + i * sx}" y1="${padTop}" x2="${padX + i * sx}" y2="${padTop + gh}" stroke="rgba(255,255,255,.28)" stroke-width="1.2"/>`;
    // barre
    if (f.barre) {
      const row = f.baseFret - startFret;
      s += `<rect x="${padX - 6}" y="${padTop + row * sy + sy * .5 - 7}" width="${gw + 12}" height="14" rx="7" fill="#00e5d0" opacity=".92"/>`;
    }
    f.shape.forEach((fr, i) => {
      // string 0 (low E) drawn leftmost in a standard chart
      const x = padX + i * sx;
      if (fr === 'x') s += `<text x="${x}" y="${padTop - 10}" fill="rgba(255,255,255,.5)" font-size="12" text-anchor="middle" font-weight="700">✕</text>`;
      else if (fr === 0) s += `<circle cx="${x}" cy="${padTop - 14}" r="5" fill="none" stroke="#fff" stroke-width="1.8" opacity=".85"/>`;
      else {
        const row = fr - startFret;
        if (row < 0 || row >= nFret) return;
        const cy = padTop + row * sy + sy * .5;
        if (!(f.barre && fr === f.baseFret))
          s += `<circle cx="${x}" cy="${cy}" r="${Math.min(sx, sy) * .38}" fill="#00e5d0"/>`;
        const fin = f.fingers[i];
        if (fin > 0) s += `<text x="${x}" y="${cy + 4}" fill="#00201d" font-size="11" text-anchor="middle" font-weight="800">${fin}</text>`;
      }
    });
    s += `<text x="${W / 2}" y="${H - 3}" fill="rgba(255,255,255,.75)" font-size="13" text-anchor="middle" font-weight="800">${name}</text>`;
    return s + '</svg>';
  }

  function keyboardDiagramSVG(name, width) {
    const v = MM.pianoVoicing(name, 4);
    const W = width || 300, whiteN = 14, ww = W / whiteN, H = ww * 3.4;
    let s = `<svg class="keyboard-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    const start = 48; // C3
    const midis = [];
    for (let m = start; midis.length < 24; m++) midis.push(m);
    const active = v ? v.keys.map(k => k.midi) : [];
    const fingerOf = m => { const k = v && v.keys.find(x => x.midi === m); return k ? k.finger : null; };
    let wi = 0;
    const whites = [], blacks = [];
    for (const m of midis) {
      if (wi >= whiteN) break;
      if (!isBlack(m)) { whites.push({ m, x: wi * ww }); wi++; }
      else blacks.push({ m, x: wi * ww - ww * .3 });
    }
    for (const k of whites) {
      const on = active.includes(k.m);
      s += `<rect x="${k.x + .5}" y="0" width="${ww - 1}" height="${H}" rx="3" fill="${on ? '#00e5d0' : '#f2f2f5'}" stroke="rgba(0,0,0,.4)"/>`;
      const fg = fingerOf(k.m);
      if (fg) s += `<text x="${k.x + ww / 2}" y="${H - 9}" fill="#00201d" font-size="11" text-anchor="middle" font-weight="800">${fg}</text>`;
    }
    for (const k of blacks) {
      const on = active.includes(k.m);
      s += `<rect x="${k.x}" y="0" width="${ww * .6}" height="${H * .62}" rx="2" fill="${on ? '#00b9a8' : '#15151a'}" stroke="#000"/>`;
      const fg = fingerOf(k.m);
      if (fg) s += `<text x="${k.x + ww * .3}" y="${H * .62 - 7}" fill="#00201d" font-size="10" text-anchor="middle" font-weight="800">${fg}</text>`;
    }
    return s + '</svg>';
  }

  global.Performer = { create, chordDiagramSVG, keyboardDiagramSVG };
})(window);
