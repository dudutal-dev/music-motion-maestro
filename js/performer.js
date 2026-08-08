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

  /* Wardrobe colours per character palette, keyed by the palette string the
     character carries. Two stops each: lit side, shadow side. */
  const WARDROBE = {
    'deep teal, magenta, near-black':      ['#1d5f5c', '#0d2422'],
    'amber gold, warm cream, dusty brown': ['#8a6432', '#3b2a14'],
    'midnight blue, ice white, soft cyan': ['#2b3550', '#141a2a'],
    'crimson red, charcoal, bone white':   ['#7a2230', '#2a1015'],
    'blush pink, mint, pale sand':         ['#b58497', '#5c3f4a'],
    'black, white, single accent gray':    ['#3a3a3f', '#161618'],
    _default:                              ['#2b3550', '#141a2a']
  };

  const el = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /**
   * A human head, shared by both scenes.
   *
   * Jaw narrowing to a chin rather than an ellipse; hair with a hairline
   * instead of a cap; brows, ears and a nose. The features are low-contrast
   * and sit on the classical thirds, so the face reads as a face rather than
   * as a smiley drawn on a circle.
   */
  function buildHead(el, cx, cy, r) {
    const g = el('g', { class: 'mm-head' });
    g.appendChild(el('path', {
      d: `M ${cx - r * .86} ${cy - r * .18}
          C ${cx - r * .92} ${cy - r * .95}, ${cx + r * .92} ${cy - r * .95}, ${cx + r * .86} ${cy - r * .18}
          C ${cx + r * .84} ${cy + r * .42}, ${cx + r * .44} ${cy + r * .96}, ${cx} ${cy + r * .99}
          C ${cx - r * .44} ${cy + r * .96}, ${cx - r * .84} ${cy + r * .42}, ${cx - r * .86} ${cy - r * .18} Z`,
      fill: 'url(#mm-skin)'
    }));
    g.appendChild(el('ellipse', { cx: cx - r * .88, cy: cy + r * .10, rx: r * .13, ry: r * .23, fill: '#dda87e' }));
    g.appendChild(el('ellipse', { cx: cx + r * .88, cy: cy + r * .10, rx: r * .13, ry: r * .23, fill: '#dda87e' }));
    g.appendChild(el('path', {
      d: `M ${cx - r * .90} ${cy + r * .06}
          C ${cx - r * 1.02} ${cy - r * 1.10}, ${cx + r * 1.02} ${cy - r * 1.10}, ${cx + r * .90} ${cy + r * .06}
          C ${cx + r * .86} ${cy - r * .30}, ${cx + r * .60} ${cy - r * .52}, ${cx + r * .10} ${cy - r * .46}
          C ${cx - r * .40} ${cy - r * .40}, ${cx - r * .78} ${cy - r * .30}, ${cx - r * .90} ${cy + r * .06} Z`,
      fill: '#2a1d15'
    }));
    const eyeY = cy + r * .06, ex = r * .34, bw = r * .22;
    g.appendChild(el('path', {
      d: `M ${cx - ex - bw} ${eyeY - r * .30} q ${bw} ${-r * .10} ${bw * 2} ${-r * .03}`,
      stroke: '#3b2a1e', 'stroke-width': r * .075, fill: 'none', 'stroke-linecap': 'round'
    }));
    g.appendChild(el('path', {
      d: `M ${cx + ex - bw} ${eyeY - r * .33} q ${bw} ${-r * .08} ${bw * 2} ${r * .03}`,
      stroke: '#3b2a1e', 'stroke-width': r * .075, fill: 'none', 'stroke-linecap': 'round'
    }));
    g.appendChild(el('ellipse', { cx: cx - ex, cy: eyeY, rx: r * .105, ry: r * .08, fill: '#2b211a' }));
    g.appendChild(el('ellipse', { cx: cx + ex, cy: eyeY, rx: r * .105, ry: r * .08, fill: '#2b211a' }));
    g.appendChild(el('path', {
      d: `M ${cx - r * .05} ${cy + r * .30} q ${r * .10} ${r * .15} ${-r * .03} ${r * .22}`,
      stroke: '#c08f66', 'stroke-width': r * .06, fill: 'none', 'stroke-linecap': 'round'
    }));
    const mouth = el('path', {
      d: `M ${cx - r * .20} ${cy + r * .62} q ${r * .20} ${r * .10} ${r * .40} 0`,
      stroke: '#a8705a', 'stroke-width': r * .065, fill: 'none', 'stroke-linecap': 'round'
    });
    g.appendChild(mouth);
    return { g, mouth };
  }

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
    // A head about one seventh of the standing figure, rather than the third
    // that reads as a cartoon. Shoulders sit wider than the head, not on it.
    head: { x: 400, y: 156, r: 40 },
    shFret:  { x: 492, y: 250 },   // fretting-arm shoulder (viewer right)
    shStrum: { x: 308, y: 250 },   // strumming-arm shoulder (viewer left)
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
    let paletteKey = null;

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

    /**
     * An arm that tapers.
     *
     * Two round-capped lines of constant width read as plumbing, not as a
     * limb. A real arm is widest at the deltoid, narrows through the elbow and
     * narrows again to the wrist, so each segment is a quad whose two ends
     * have different widths, with a joint disc at the elbow to keep the bend
     * from showing a corner.
     */
    function limb(cls, w, color) {
      const g = el('g', { class: cls });
      const upper = el('path', { fill: color });
      const joint = el('circle', { r: w * 0.40, fill: color });
      const fore = el('path', { fill: color });
      const shoulder = el('circle', { r: w * 0.52, fill: color });
      g.appendChild(shoulder); g.appendChild(upper);
      g.appendChild(joint); g.appendChild(fore);

      /** Quad from (x1,y1) width w1 to (x2,y2) width w2. */
      const taper = (x1, y1, x2, y2, w1, w2) => {
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const a1 = w1 / 2, a2 = w2 / 2;
        return `M ${x1 + nx * a1} ${y1 + ny * a1} L ${x2 + nx * a2} ${y2 + ny * a2} ` +
               `L ${x2 - nx * a2} ${y2 - ny * a2} L ${x1 - nx * a1} ${y1 - ny * a1} Z`;
      };

      return {
        g,
        /** sh -> elbow -> hand, tapering along the way */
        set(sx, sy, ex, ey, hx, hy) {
          upper.setAttribute('d', taper(sx, sy, ex, ey, w * 1.02, w * 0.80));
          fore.setAttribute('d', taper(ex, ey, hx, hy, w * 0.80, w * 0.56));
          joint.setAttribute('cx', ex); joint.setAttribute('cy', ey);
          shoulder.setAttribute('cx', sx); shoulder.setAttribute('cy', sy);
        }
      };
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
      const sl = G.shStrum, sr = G.shFret, hp = G.hip, hd = G.head;

      /* Seated: thighs run forward from the hips, which is what the guitar
         actually rests on. Without a lap the instrument floats. */
      body.appendChild(el('path', {
        d: `M ${hp.x - 74} ${hp.y - 4} Q ${hp.x - 96} ${hp.y + 54}, ${hp.x - 86} ${hp.y + 76}
            L ${hp.x + 92} ${hp.y + 76} Q ${hp.x + 104} ${hp.y + 40}, ${hp.x + 78} ${hp.y - 4} Z`,
        fill: 'url(#mm-cloth)', opacity: .85
      }));

      // Neck, drawn before the torso so the collar overlaps its base.
      body.appendChild(el('path', {
        d: `M ${hd.x - 15} ${hd.y + 22} L ${hd.x - 17} ${hd.y + 62}
            L ${hd.x + 17} ${hd.y + 62} L ${hd.x + 15} ${hd.y + 22} Z`,
        fill: '#d3a077'
      }));

      /* Torso: a shoulder line that slopes down and out from the neck, a
         waist that comes in, and hips that go back out. The old shape ran
         straight from shoulder to hip, which is what made it a block. */
      body.appendChild(el('path', {
        d: `M ${hd.x - 20} ${sl.y - 38}
            C ${sl.x - 6} ${sl.y - 34}, ${sl.x - 24} ${sl.y - 22}, ${sl.x - 30} ${sl.y + 4}
            C ${sl.x - 30} ${sl.y + 46}, ${hp.x - 62} ${hp.y - 74}, ${hp.x - 56} ${hp.y - 22}
            L ${hp.x - 62} ${hp.y + 20} L ${hp.x + 66} ${hp.y + 20} L ${hp.x + 60} ${hp.y - 22}
            C ${hp.x + 66} ${hp.y - 74}, ${sr.x + 30} ${sr.y + 46}, ${sr.x + 30} ${sr.y + 4}
            C ${sr.x + 24} ${sr.y - 22}, ${sr.x + 6} ${sr.y - 34}, ${hd.x + 20} ${sl.y - 38} Z`,
        fill: 'url(#mm-cloth)'
      }));
      // Collar, which is what tells you there is a garment and not a shape.
      body.appendChild(el('path', {
        d: `M ${hd.x - 21} ${sl.y - 39} Q ${hd.x} ${sl.y - 20}, ${hd.x + 21} ${sl.y - 39}`,
        fill: 'none', stroke: 'rgba(0,0,0,.30)', 'stroke-width': 3.5, 'stroke-linecap': 'round'
      }));
      // Deltoids: rounded, and set slightly below the shoulder line.
      body.appendChild(el('ellipse', { cx: sl.x - 6, cy: sl.y + 2, rx: 26, ry: 24, fill: 'url(#mm-cloth)' }));
      body.appendChild(el('ellipse', { cx: sr.x + 6, cy: sr.y + 2, rx: 26, ry: 24, fill: 'url(#mm-cloth)' }));

      const hg = buildHead(el, hd.x, hd.y, hd.r);
      const head = hg.g;
      refs.mouth = hg.mouth;
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
      /* The fretting hand is split across the guitar so it reads as gripping
         the neck rather than floating on top of it. What is anatomically
         behind the neck — the palm and the whole length of the thumb — is
         drawn first and the neck paints over it, leaving only the thumb tip
         showing above the far edge. The fingers, which really do come over
         the near edge onto the strings, are drawn after. */
      refs.handBack = el('g', { id: 'mm-hand-back' });
      svg.appendChild(refs.handBack);      // painted first, so the neck covers it

      /* The fretting arm reaches the neck from behind the instrument, so it
         belongs under it too. Drawn on top it laid a bar of forearm straight
         across the fretboard and hid the frets it is supposed to be playing. */
      refs.armFret = limb('arm-fret', 25, 'url(#mm-skin)');
      svg.appendChild(refs.armFret.g);

      svg.appendChild(gtr);

      /* finger markers are created here but appended last: the fingering is the
         whole point of this view, so nothing may occlude it. */
      refs.fingers = el('g', { id: 'mm-fingers' });

      /* The strumming arm does rest over the front of the body, so it stays
         on top — only the fretting arm goes behind. */
      refs.armStrum = limb('arm-strum', 25, 'url(#mm-skin)');
      svg.appendChild(refs.armStrum.g);
      // The fingers that come over the near edge of the neck onto the strings.
      refs.handFront = el('g', { id: 'mm-hand-front' });
      svg.appendChild(refs.handFront);
      refs.handStrum = el('ellipse', { rx: 15, ry: 12, fill: 'url(#mm-skin)', stroke: 'rgba(0,0,0,.25)' });
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

      const ph = buildHead(el, P.head.x, P.head.y, P.head.r);
      const head = ph.g;
      refs.mouth = ph.mouth;
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
          // Carry the fret and string along: the hand geometry needs to know
          // which finger reaches where, not just the bare point.
          pressed.push({ x: p.x, y: p.y, fret, string: i });
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
      buildFrettingHand(f, pressed);
    }

    /**
     * Draws the hand that is holding the neck, in two halves so the neck can
     * come between them.
     *
     * A hand laid flat on top of the fretboard is the giveaway that nobody is
     * really holding anything. A real grip wraps: the palm is under the neck,
     * the thumb runs along the back of it and only its tip clears the far
     * edge, and the fingers arch over the near edge and come down on the
     * strings. So the palm and thumb go behind the guitar and the fingers in
     * front of it, and the occlusion does the rest.
     */
    function buildFrettingHand(f, pressed) {
      const back = refs.handBack, front = refs.handFront;
      if (!back || !front) return;
      while (back.firstChild) back.removeChild(back.firstChild);
      while (front.firstChild) front.removeChild(front.firstChild);
      if (!f) return;

      // Where along the neck the hand is: the pressed cluster, or first
      // position when the chord is all open strings.
      const dists = pressed.length
        ? pressed.map(p => (fretDist(p.fret - 1) + fretDist(p.fret)) / 2)
        : [(fretDist(0) + fretDist(1)) / 2];
      const dPalm = dists.reduce((s, d) => s + d, 0) / dists.length;
      const hw = halfWidth(dPalm);
      const skin = 'url(#mm-skin)';
      const edge = 'rgba(0,0,0,.28)';

      /* ---- behind the neck ---- */
      // Palm: sits below the near edge and reaches up past it, so the neck
      // cuts its top and the hand reads as being *around* the neck.
      const palm = neckPoint(dPalm + 6, -(hw + 15));
      back.appendChild(el('ellipse', {
        cx: palm.x, cy: palm.y, rx: 34, ry: 25, fill: skin, stroke: edge,
        transform: `rotate(${G.angle} ${palm.x} ${palm.y})`
      }));
      // Wrist: without it the forearm ends in mid-air next to the palm.
      const wrist = neckPoint(dPalm + 30, -(hw + 26));
      back.appendChild(el('line', {
        x1: wrist.x, y1: wrist.y, x2: palm.x, y2: palm.y,
        stroke: skin, 'stroke-width': 26, 'stroke-linecap': 'round'
      }));
      // Thumb: runs up the back of the neck, crossing it. Only the part past
      // the far edge survives the guitar being painted over this group.
      const tA = neckPoint(dPalm - 2, -(hw - 2));
      const tB = neckPoint(dPalm - 16, hw + 9);
      back.appendChild(el('line', {
        x1: tA.x, y1: tA.y, x2: tB.x, y2: tB.y,
        stroke: edge, 'stroke-width': 16.5, 'stroke-linecap': 'round', opacity: .5
      }));
      back.appendChild(el('line', {
        x1: tA.x, y1: tA.y, x2: tB.x, y2: tB.y,
        stroke: skin, 'stroke-width': 15, 'stroke-linecap': 'round'
      }));

      /* ---- in front of the neck ---- */
      // One finger per pressed string, fanned from the knuckle row under the
      // near edge. A barre is a single finger laid flat instead.
      if (f.barre) {
        const a = neckPoint((fretDist(f.baseFret - 1) + fretDist(f.baseFret)) / 2, hw + 3);
        const b = neckPoint((fretDist(f.baseFret - 1) + fretDist(f.baseFret)) / 2, -(hw + 12));
        front.appendChild(el('line', {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          stroke: edge, 'stroke-width': 14.5, 'stroke-linecap': 'round', opacity: .35
        }));
        front.appendChild(el('line', {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          stroke: skin, 'stroke-width': 13, 'stroke-linecap': 'round'
        }));
      }
      /* The fingers this chord does not use still exist. Drawing only the ones
         that press left Em with a two-fingered hand, which is the sort of thing
         you stop being able to unsee. They curl in against the palm, clear of
         the strings — the same posture the image prompts ask for. */
      const usedNums = new Set((f.fingers || []).filter(n => n > 0));
      const idle = [1, 2, 3, 4].filter(n => !usedNums.has(n) && !(f.barre && n === 1));
      idle.forEach((n, k) => {
        const along = dPalm + (n - 2.5) * 12 + 6;
        const kn = neckPoint(along, -(hw + 11));
        // Curled: short, and stopping well below the near edge of the neck.
        const tip = neckPoint(along + 7, -(hw + 30 + (4 - n) * 2));
        const mx = (kn.x + tip.x) / 2 - G.px * 12;
        const my = (kn.y + tip.y) / 2 - G.py * 12;
        const d = `M ${kn.x} ${kn.y} Q ${mx} ${my} ${tip.x} ${tip.y}`;
        front.appendChild(el('path', {
          d, fill: 'none', stroke: edge, 'stroke-width': 11, 'stroke-linecap': 'round', opacity: .3
        }));
        front.appendChild(el('path', {
          d, fill: 'none', stroke: skin, 'stroke-width': 9.5, 'stroke-linecap': 'round'
        }));
      });

      const arch = pressed.filter(p => !(f.barre && p.fret === f.baseFret));
      arch.forEach((p, k) => {
        // Knuckles fan along the neck so the fingers are not a parallel comb.
        const spread = (k - (arch.length - 1) / 2) * 11;
        const kn = neckPoint(dPalm + spread + 6, -(hw + 11));
        // Control point pulls the curve outward, giving the arched knuckle.
        const mx = (kn.x + p.x) / 2 - G.px * 9 + G.ux * 3;
        const my = (kn.y + p.y) / 2 - G.py * 9 + G.uy * 3;
        const d = `M ${kn.x} ${kn.y} Q ${mx} ${my} ${p.x} ${p.y}`;
        front.appendChild(el('path', {
          d, fill: 'none', stroke: edge, 'stroke-width': 12, 'stroke-linecap': 'round', opacity: .32
        }));
        front.appendChild(el('path', {
          d, fill: 'none', stroke: skin, 'stroke-width': 10.5, 'stroke-linecap': 'round'
        }));
      });
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
      refs.armFret.set(shF.x, shF.y, ik1.ex, ik1.ey, ik1.hx, ik1.hy);
      // The fretting hand is drawn from the chord geometry, not moved per
      // frame: it is gripping a neck that does not move, so it must not drift.
      // The arm reaches the same palm point, which is what fretTarget is.

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
      refs.armStrum.set(shS.x, shS.y, ik2.ex, ik2.ey, ik2.hx, ik2.hy);
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
        limbRef.set(sh.x, sh.y, ik.ex, ik.ey, ik.hx, ik.hy);
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
      applyPalette();      // the rebuild replaces the defs, so re-tint after it
    }

    /* Choosing a character used to change nothing on stage unless it also
       changed the instrument, which made the picker look broken. The drawn
       performer cannot carry a likeness, but it can carry the character's
       colours, so the choice is at least visible. */
    function applyPalette() {
      if (!svg) return;
      const cloth = svg.querySelector('#mm-cloth');
      if (!cloth) return;
      const stops = cloth.querySelectorAll('stop');
      if (stops.length < 2) return;
      const pair = WARDROBE[paletteKey] || WARDROBE._default;
      stops[0].setAttribute('stop-color', pair[0]);
      stops[1].setAttribute('stop-color', pair[1]);
    }
    function setPalette(colors) { paletteKey = colors; applyPalette(); }

    setInstrument('guitar');
    return {
      update, setInstrument, setPalette,
      get instrument() { return instrument; },
      refreshChord() { const c = currentChord; currentChord = null; setChord(c); }
    };
  }

  /* ============================================================
     Static diagrams (used by lessons + character panels)
     ============================================================ */
  /* The chart is laid out the way the guitar is actually seen rather than the
     way chord books print it: the neck runs across, the nut sits at the right
     end and the low E is the top string — a standard vertical chart given a
     quarter turn clockwise. It is built in this orientation instead of being
     rotated after the fact, because rotating the finished drawing would lay
     every finger number and the chord name on their sides. */
  const DIAGRAM_ASPECT = 0.8;          // height ÷ width

  function chordDiagramSVG(name, size) {
    const f = MM.guitarFingering(name);
    const W = size || 150, H = Math.round(W * DIAGRAM_ASPECT);
    if (!f) return `<svg width="${W}" height="${H}"></svg>`;
    const nStr = 6, nFret = 5;
    const padL = W * .06, padR = W * .18;       // the right pad holds the ○ / ✕
    const padTop = H * .11, padBot = H * .20;   // the name sits under the board
    const bw = W - padL - padR;                 // along the neck
    const bh = H - padTop - padBot;             // across the strings
    const nutX = W - padR;
    const sx = bw / nFret, sy = bh / (nStr - 1);
    const frettedAll = f.shape.filter(x => typeof x === 'number' && x > 0);
    const maxFret = frettedAll.length ? Math.max.apply(null, frettedAll) : 0;
    // Anchor at the nut only when the whole shape fits in the window.
    const startFret = maxFret <= nFret ? 1 : f.baseFret;

    const strY = i => padTop + i * sy;          // string 0 is the low E, on top
    const fretX = j => nutX - j * sx;           // fret wires, running left
    const dotX = r => nutX - (r + .5) * sx;     // the space between two wires

    let s = `<svg class="fretboard-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    // nut / position marker
    if (startFret === 1)
      s += `<rect x="${nutX.toFixed(1)}" y="${(padTop - 3).toFixed(1)}" width="5" height="${(bh + 6).toFixed(1)}" rx="2" fill="#e8e8ee"/>`;
    else
      s += `<text x="${dotX(0).toFixed(1)}" y="${(padTop - 5).toFixed(1)}" fill="rgba(255,255,255,.6)" font-size="11" text-anchor="middle" font-weight="700">${startFret}</text>`;
    for (let j = 0; j <= nFret; j++)
      s += `<line x1="${fretX(j).toFixed(1)}" y1="${padTop.toFixed(1)}" x2="${fretX(j).toFixed(1)}" y2="${(padTop + bh).toFixed(1)}" stroke="rgba(255,255,255,.22)" stroke-width="1.2"/>`;
    for (let i = 0; i < nStr; i++)
      s += `<line x1="${fretX(nFret).toFixed(1)}" y1="${strY(i).toFixed(1)}" x2="${nutX.toFixed(1)}" y2="${strY(i).toFixed(1)}" stroke="rgba(255,255,255,.28)" stroke-width="1.2"/>`;
    // barre — one finger laid across the strings, so it runs with them
    if (f.barre) {
      const r = f.baseFret - startFret;
      s += `<rect x="${(dotX(r) - 7).toFixed(1)}" y="${(padTop - 6).toFixed(1)}" width="14" height="${(bh + 12).toFixed(1)}" rx="7" fill="#00e5d0" opacity=".92"/>`;
    }
    const markX = nutX + Math.min(14, padR * .6);
    f.shape.forEach((fr, i) => {
      const y = strY(i);
      if (fr === 'x') s += `<text x="${markX.toFixed(1)}" y="${(y + 4).toFixed(1)}" fill="rgba(255,255,255,.5)" font-size="12" text-anchor="middle" font-weight="700">✕</text>`;
      else if (fr === 0) s += `<circle cx="${markX.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="none" stroke="#fff" stroke-width="1.8" opacity=".85"/>`;
      else {
        const r = fr - startFret;
        if (r < 0 || r >= nFret) return;
        const cx = dotX(r);
        if (!(f.barre && fr === f.baseFret))
          s += `<circle cx="${cx.toFixed(1)}" cy="${y.toFixed(1)}" r="${(Math.min(sx, sy) * .38).toFixed(1)}" fill="#00e5d0"/>`;
        const fin = f.fingers[i];
        if (fin > 0) s += `<text x="${cx.toFixed(1)}" y="${(y + 4).toFixed(1)}" fill="#00201d" font-size="11" text-anchor="middle" font-weight="800">${fin}</text>`;
      }
    });
    s += `<text x="${W / 2}" y="${H - 4}" fill="rgba(255,255,255,.75)" font-size="13" text-anchor="middle" font-weight="800">${name}</text>`;
    return s + '</svg>';
  }

  function keyboardDiagramSVG(name, width) {
    const v = MM.pianoVoicing(name, 4);
    const W = width || 300, whiteN = 14, ww = W / whiteN, H = ww * 3.4;
    let s = `<svg class="keyboard-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    // Voicings are built at octave 4, so the window has to start there: from C3
    // the upper tones of F, G, A, B and friends fell outside and were dropped.
    const start = 60; // C4
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

  // Exported so callers that size a box around a diagram — the PNG export and
  // the poster burn-in — cannot drift out of step with the drawing itself.
  global.Performer = { create, chordDiagramSVG, keyboardDiagramSVG, DIAGRAM_ASPECT };
})(window);
