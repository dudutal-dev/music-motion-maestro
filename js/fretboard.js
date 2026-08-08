/* ============================================================
   fretboard.js — where the fingers go, in millimetres, in space

   Everything the app knows about a chord until now has been flat: a
   string number, a fret number, a point on a drawing. That is enough to
   put a mark on a picture, and not nearly enough to pose a hand. A hand
   needs somewhere to BE — a point it can reach for, and a direction to
   arrive from.

   So this puts the chord on an actual guitar. Given a chord name it
   returns, for every string that gets pressed, the point in space where
   the fingertip touches the string and the direction it presses in,
   both taken from real measurements of a real instrument rather than
   from anything on screen. It draws no pixels and knows nothing about
   any renderer; that is the point. A renderer can be argued about, and
   these numbers can be checked.

   The axes, once, so nothing downstream has to guess:

     x   along the neck, 0 at the nut, growing toward the bridge
     y   across the strings, 0 on the centre line,
         negative toward the low E and positive toward the high e
     z   away from the fretboard, 0 at the crown of the board's arc,
         so the board's edges are slightly negative and the player's
         fingers approach from positive z

   The fretboard is not flat — it is a section of a cylinder, and on a
   twelve-inch radius the outer strings sit about half a millimetre lower
   than the middle ones. That is invisible in a drawing and matters to a
   hand, which is why the flat version never needed it and this does.
   ============================================================ */
(function (global) {
  'use strict';

  /* A dreadnought-scale steel-string, which is what the app's chord
     library is voiced for. Every number is a real measurement in
     millimetres; nothing here is tuned to make a picture look right. */
  const SPEC = {
    scale: 648,          // nut to bridge — 25.5"
    radius: 305,         // fretboard arc — 12"
    frets: 22,
    spreadNut: 35,       // low E to high e across the strings, at the nut
    spreadBridge: 52,    // ...and at the bridge
    fretHeight: 1.2,     // fret wire above the board
    neckAtFirst: 21,     // neck thickness behind the first fret
    neckAtNinth: 23.5,   // ...and behind the ninth
    strings: 6
  };

  const spec = (o) => Object.assign({}, SPEC, o || {});

  /** Where fret n's wire sits, measured from the nut. */
  function fretX(n, s) {
    s = s || SPEC;
    return s.scale * (1 - Math.pow(2, -n / 12));
  }

  /** Where a finger stops the string: between two wires, not on one. */
  function pressX(n, s) {
    return (fretX(n - 1, s) + fretX(n, s)) / 2;
  }

  /** How far apart the outer strings are at this point along the neck. */
  function spreadAt(x, s) {
    s = s || SPEC;
    return s.spreadNut + (s.spreadBridge - s.spreadNut) * (x / s.scale);
  }

  /** String i across the neck: 0 is the low E, 5 the high e. */
  function stringY(i, x, s) {
    s = s || SPEC;
    return (i / (s.strings - 1) - 0.5) * spreadAt(x, s);
  }

  /** The board's arc: zero on the centre line, dropping away at the edges. */
  function boardZ(y, s) {
    s = s || SPEC;
    const r = s.radius;
    return Math.sqrt(Math.max(0, r * r - y * y)) - r;
  }

  /**
   * Which way is "out of the board" at this point across it.
   * On a cylinder that is the radial direction, so it tilts with the arc —
   * which is exactly why a finger on the low E presses at a different angle
   * from one on the D string, and why a hand posed against a flat board
   * looks wrong at the edges.
   */
  function boardNormal(y, s) {
    s = s || SPEC;
    const r = s.radius;
    const z = Math.sqrt(Math.max(0, r * r - y * y));
    return { x: 0, y: y / r, z: z / r };
  }

  /** How thick the neck is behind this point, for placing the thumb. */
  function neckDepth(x, s) {
    s = s || SPEC;
    const x1 = fretX(1, s), x9 = fretX(9, s);
    const t = (x - x1) / (x9 - x1);
    return s.neckAtFirst + (s.neckAtNinth - s.neckAtFirst) * Math.max(0, Math.min(1.4, t));
  }

  /**
   * Where the fingertip touches, for one string at one fret.
   * The point sits on the board and is lifted along the surface normal by
   * the height of the fret wire, because that is what the string rests on
   * once it is pressed.
   */
  function contact(i, fret, s) {
    s = s || SPEC;
    const x = pressX(fret, s);
    const y = stringY(i, x, s);
    const n = boardNormal(y, s);
    const b = boardZ(y, s);
    return {
      string: i, fret,
      x: +x.toFixed(2),
      y: +(y + n.y * s.fretHeight).toFixed(2),
      z: +(b + n.z * s.fretHeight).toFixed(2),
      normal: { x: 0, y: +n.y.toFixed(4), z: +n.z.toFixed(4) }
    };
  }

  /** The fret wire itself, sampled across the arc of the board. */
  function fretWire(n, s) {
    s = s || SPEC;
    const x = fretX(n, s), half = spreadAt(x, s) / 2 + 4;   // a little proud of the strings
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const y = -half + (2 * half) * (k / 12);
      pts.push({ x: +x.toFixed(2), y: +y.toFixed(2), z: +(boardZ(y, s) + s.fretHeight).toFixed(2) });
    }
    return pts;
  }

  /** A string's line from the nut to the bridge, following the arc. */
  function stringPath(i, s) {
    s = s || SPEC;
    const a = { x: 0, y: stringY(i, 0, s) };
    const b = { x: s.scale, y: stringY(i, s.scale, s) };
    const lift = 1.2;                       // clearance over the frets at the nut
    return [
      { x: 0, y: +a.y.toFixed(2), z: +(boardZ(a.y, s) + s.fretHeight + lift).toFixed(2) },
      { x: +s.scale.toFixed(2), y: +b.y.toFixed(2), z: +(boardZ(b.y, s) + s.fretHeight + 9).toFixed(2) }
    ];
  }

  /**
   * Everything a hand needs in order to play one chord.
   *
   * Reads the fingering from the app's own library rather than carrying a
   * second copy of it, so a chord can never mean one thing here and
   * something else on the chart.
   */
  function chordTargets(name, o) {
    const f = global.MM && global.MM.guitarFingering ? global.MM.guitarFingering(name) : null;
    if (!f) return null;
    const s = spec(o);

    const contacts = [], open = [], muted = [];
    f.shape.forEach((fr, i) => {
      if (fr === 'x') { muted.push(i); return; }
      if (fr === 0) { open.push(i); return; }
      const c = contact(i, fr, s);
      c.finger = f.fingers[i] || 0;
      c.barred = !!(f.barre && fr === f.baseFret);
      contacts.push(c);
    });

    const frets = contacts.map(c => c.fret);
    const lo = frets.length ? Math.min.apply(null, frets) : 0;
    const hi = frets.length ? Math.max.apply(null, frets) : 0;

    /* The thumb sits behind the neck, opposite the hand. Under a barre it
       is directly behind the index finger and doing real work; otherwise it
       rides near the middle of whatever the hand is covering. */
    const thumbFret = f.barre ? f.baseFret : (frets.length ? (lo + hi) / 2 : 2);
    const tx = pressX(thumbFret, s);
    const thumb = {
      x: +tx.toFixed(2), y: 0, z: +(-neckDepth(tx, s)).toFixed(2),
      normal: { x: 0, y: 0, z: -1 },
      fret: +thumbFret.toFixed(2)
    };

    return {
      chord: name,
      spec: s,
      contacts, open, muted,
      /* A barre is one finger laid across the whole neck. Only some of the
         strings under it are the ones that sound at that fret — the rest are
         stopped higher up by other fingers — but the finger still crosses all
         six, and a hand has to be posed to the finger, not to the notes. So
         both facts are reported: the line the finger lies on, and which
         strings it is actually sounding. */
      barre: f.barre ? {
        fret: f.baseFret,
        line: Array.from({ length: s.strings }, (_, i) => contact(i, f.baseFret, s)),
        sounding: contacts.filter(c => c.barred).map(c => c.string)
      } : null,
      thumb,
      lowestFret: lo, highestFret: hi,
      /* How far the hand has to stretch. Four frets is about the limit in
         first position, and a chord that asked for more would be a fault in
         the library rather than something a solver should try to reach. */
      spanFrets: hi - lo,
      spanMm: +(pressX(hi || 1, s) - pressX(lo || 1, s)).toFixed(2)
    };
  }

  /** The neck itself, for whatever ends up drawing it. */
  function geometry(o) {
    const s = spec(o);
    const wires = [];
    for (let n = 0; n <= s.frets; n++) wires.push({ fret: n, points: fretWire(n, s) });
    const strings = [];
    for (let i = 0; i < s.strings; i++) strings.push({ string: i, points: stringPath(i, s) });
    return {
      spec: s, wires, strings,
      nut: { x: 0, halfWidth: +(spreadAt(0, s) / 2 + 4).toFixed(2) },
      bridge: { x: s.scale, halfWidth: +(spreadAt(s.scale, s) / 2 + 4).toFixed(2) }
    };
  }

  /**
   * The same thing in words, to a millimetre.
   *
   * An image model cannot be handed a coordinate list, but "index finger
   * 36mm from the nut on the second string" is a good deal more concrete
   * than "fingers pressing the chord shape", which is the sentence those
   * prompts have been carrying and the first one a model discards.
   */
  function placementMm(name, o) {
    const t = chordTargets(name, o);
    if (!t) return null;
    const FING = { 1: 'index finger', 2: 'middle finger', 3: 'ring finger', 4: 'pinky' };
    const parts = t.contacts.filter(c => !c.barred || c === t.contacts.find(k => k.barred))
      .map(c => {
        const where = `${Math.round(c.x)}mm from the nut`;
        if (c.barred) return `${FING[c.finger] || 'index finger'} laid flat across the strings at ${where}`;
        return `${FING[c.finger] || 'a finger'} on string ${6 - c.string} at ${where}`;
      });
    const thumb = `thumb behind the neck ${Math.round(t.thumb.x)}mm from the nut`;
    return parts.concat(thumb).join(', ');
  }

  global.Fretboard = {
    SPEC, spec, fretX, pressX, spreadAt, stringY, boardZ, boardNormal, neckDepth,
    contact, fretWire, stringPath, chordTargets, geometry, placementMm
  };
})(window);
