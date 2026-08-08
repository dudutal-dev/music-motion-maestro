/* ============================================================
   neck.js — putting an exact fingering onto a photograph

   The generated picture of a character is the best-looking thing in the
   app and the least accurate: the hand in it is in no chord at all. The
   fingering, meanwhile, is computed exactly. This joins the two — it
   works out where on the photograph each string and fret actually falls,
   so the marks land on the real instrument in the picture.

   The part that has to be right is the fret spacing. Along the string,
   fret n sits at s(n) = 1 − 2^(−n/12) of the way to the bridge. That
   proportion is physical and exact, but it does NOT survive the camera:
   a photograph is a perspective projection, and the far end of the neck
   is foreshortened. Walking in a straight line from the nut to the
   bridge — the obvious first attempt — puts every mark short of where it
   belongs, and the error grows the further up the neck you go.

   What perspective does preserve is the cross-ratio, which means the map
   from "position along the string" to "position along the neck in the
   image" is a Möbius transform. Fixing it needs one measurement beyond
   the two ends, and the twelfth fret is the natural one: it is exactly
   halfway along the string, and in almost any photograph it is the
   easiest landmark to find, because that is where the double inlay is.

   With the nut at u=0 and the bridge at u=1, every Möbius map through
   both is u(s) = s / (a + (1−a)s) for a single a > 0, and the twelfth
   fret pins it: u(0.5) = u12 gives a = 1/u12 − 1. A camera looking
   straight on measures u12 = 0.5, which gives a = 1 and u(s) = s — the
   straight-line case falls out on its own, so nothing special is needed
   for a flat, face-on picture.

   Every coordinate here is a fraction of the image, never a pixel, so a
   calibration survives being displayed at any size.
   ============================================================ */
(function (global) {
  'use strict';

  /** Where fret n falls along the string, as a fraction of the scale length. */
  const fretFraction = n => 1 - Math.pow(2, -n / 12);

  /** A finger stops the string between two wires, not on one. */
  const pressFraction = n => (fretFraction(n - 1) + fretFraction(n)) / 2;

  const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
  const dot = (p, q) => p.x * q.x + p.y * q.y;

  /**
   * Does this calibration have everything it needs?
   * Anything half-filled must not draw, or the marks land somewhere
   * arbitrary and look like a bug in the fingering rather than in the setup.
   */
  function isCalibrated(cal) {
    return !!(cal && cal.nut && cal.bridge && cal.twelfth &&
      isFinite(cal.nut.x) && isFinite(cal.bridge.x) && isFinite(cal.twelfth.x) &&
      (cal.nut.x !== cal.bridge.x || cal.nut.y !== cal.bridge.y));
  }

  /**
   * The one number that describes the camera: where the twelfth fret sits
   * along the nut→bridge line. Taken as a projection of the marked point
   * onto that line, so a click a little off the centre line still works.
   */
  function twelfthParam(cal) {
    const axis = sub(cal.bridge, cal.nut);
    const len2 = dot(axis, axis);
    if (!len2) return 0.5;
    const u = dot(sub(cal.twelfth, cal.nut), axis) / len2;
    // Outside this range the marked point is not on the neck at all, and the
    // transform would fold back on itself. Fall back to a face-on camera.
    return (u > 0.06 && u < 0.94) ? u : 0.5;
  }

  /** Position along the string → position along the neck in the image. */
  function project(cal, s) {
    const u12 = twelfthParam(cal);
    const a = 1 / u12 - 1;
    return s / (a + (1 - a) * s);
  }

  /**
   * The neck's half-width at image position u.
   *
   * The two edges of the neck are straight lines in space, so they are
   * straight lines in the picture too, and the distance from the centre line
   * to either of them is therefore linear in u — in the image, not in s.
   * That makes the width honest under perspective for free.
   */
  function halfWidth(cal, u) {
    const wN = cal.wNut != null ? cal.wNut : 0.012;
    const w12 = cal.w12 != null ? cal.w12 : wN * 1.35;
    const u12 = twelfthParam(cal);
    return wN + (w12 - wN) * (u / u12);
  }

  /** Unit vectors along the neck and across it. */
  function basis(cal) {
    const axis = sub(cal.bridge, cal.nut);
    const len = Math.hypot(axis.x, axis.y) || 1;
    const ux = axis.x / len, uy = axis.y / len;
    return { ux, uy, px: -uy, py: ux, len };
  }

  /**
   * A point on the neck, in image fractions.
   * @param {number} str  0 = low E .. 5 = high e, the app's own numbering
   * @param {number} u    position along the neck, 0 at the nut
   */
  function at(cal, str, u) {
    const b = basis(cal);
    const cx = cal.nut.x + (cal.bridge.x - cal.nut.x) * u;
    const cy = cal.nut.y + (cal.bridge.y - cal.nut.y) * u;
    // Which edge the low E sits on depends on the shot, and no amount of
    // arithmetic can tell — the picture has to be looked at. So it is a
    // setting, not a guess.
    const side = ((str / 2.5) - 1) * (cal.flip ? -1 : 1);
    const w = halfWidth(cal, u);
    return { x: cx + b.px * w * side, y: cy + b.py * w * side };
  }

  /** Where the finger goes for this string at this fret. */
  function fingerAt(cal, str, fret) {
    return at(cal, str, project(cal, pressFraction(fret)));
  }

  /** The fret wire itself, from the low E edge to the high e edge. */
  function fretWire(cal, n) {
    const u = project(cal, fretFraction(n));
    return { a: at(cal, -0.5, u), b: at(cal, 5.5, u) };
  }

  /* ---------- drawing ---------- */

  /**
   * Paints the fingering over the picture.
   *
   * @param ctx        a 2d context whose transform maps 0..1 to the image
   * @param cal        the calibration
   * @param f          a fingering from MM.guitarFingering
   * @param o.scale    longest image edge in pixels, so marks size sensibly
   * @param o.ladder   draw the fret wires too — the calibration check
   */
  function draw(ctx, cal, f, o) {
    o = o || {};
    if (!isCalibrated(cal)) return false;
    const S = o.scale || 1000;
    const accent = o.color || '#00e5d0';
    /* Marks are sized off the neck, not off the picture. A dot fixed to the
       image is nearly as wide as the neck up by the nut, where the frets are
       tightest and the strings closest together — exactly where it has to be
       readable. Taken from the neck it stays in proportion to the instrument
       and shrinks with it toward the headstock. */
    const dotAt = u => Math.max(halfWidth(cal, u) * 0.34, 1.5);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (o.ladder) {
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = Math.max(1, S * 0.002);
      for (let n = 0; n <= 12; n++) {
        const w = fretWire(cal, n);
        ctx.beginPath();
        ctx.moveTo(w.a.x, w.a.y);
        ctx.lineTo(w.b.x, w.b.y);
        ctx.stroke();
      }
      // The twelfth carries the double inlay in life, so it is the one to
      // check against — call it out rather than leaving it to be counted.
      const w12 = fretWire(cal, 12);
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2, S * 0.004);
      ctx.beginPath();
      ctx.moveTo(w12.a.x, w12.a.y);
      ctx.lineTo(w12.b.x, w12.b.y);
      ctx.stroke();
    }

    if (!f) { ctx.restore(); return true; }

    ctx.shadowColor = accent;
    ctx.shadowBlur = S * 0.018;

    if (f.barre) {
      const u = project(cal, pressFraction(f.baseFret));
      const a = at(cal, 0, u), b = at(cal, 5, u);
      ctx.strokeStyle = accent;
      ctx.lineWidth = dotAt(u) * 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    f.shape.forEach((fr, i) => {
      if (fr === 'x' || fr === 0) {
        // Open and muted strings are stated just behind the nut, where a
        // player would look for them, and kept quiet so they never compete
        // with the pressed notes.
        const p = at(cal, i, -0.035);
        const r0 = dotAt(0);
        ctx.shadowBlur = 0;
        ctx.lineWidth = Math.max(1.5, S * 0.003);
        ctx.strokeStyle = 'rgba(255,255,255,.72)';
        ctx.beginPath();
        if (fr === 0) {
          ctx.arc(p.x, p.y, r0 * 0.7, 0, Math.PI * 2);
        } else {
          const d = r0 * 0.56;
          ctx.moveTo(p.x - d, p.y - d); ctx.lineTo(p.x + d, p.y + d);
          ctx.moveTo(p.x + d, p.y - d); ctx.lineTo(p.x - d, p.y + d);
        }
        ctx.stroke();
        ctx.shadowBlur = S * 0.018;
        return;
      }
      if (f.barre && fr === f.baseFret) return;   // already under the bar
      const u = project(cal, pressFraction(fr));
      const p = at(cal, i, u);
      const r = dotAt(u);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      const fin = f.fingers[i];
      // A number smaller than about five pixels is a smudge, not a digit. The
      // dot alone still says where the finger goes, which is the information
      // that matters; a blurred glyph on top of it would only muddy it.
      if (fin > 0 && r >= 5) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#052a27';
        ctx.font = `700 ${r * 1.3}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(fin), p.x, p.y + r * 0.05);
        ctx.shadowBlur = S * 0.018;
      }
    });

    ctx.restore();
    return true;
  }

  /* ---------- the strumming hand ----------

     The fretting hand says which notes; the strumming hand says when, and
     without it a chord that has already changed just sits there. The
     photograph's own right hand cannot move, so the stroke is drawn over it:
     a pick travelling across the strings, down on the beat and back up
     between beats — the same one-per-beat motion the animated performer
     uses, so the two stages do not disagree about the rhythm.

     It crosses only the strings that actually sound. A C chord starts on the
     A string because the low E is muted, and a stroke that swept all six
     would be teaching the wrong thing at the exact moment the player is
     looking at it. */

  /** Where along the neck the strumming happens; past the end of the board. */
  const strumU = cal => (cal && cal.strum != null) ? cal.strum : 0.85;

  /**
   * @param o.phase   0..1 through the current beat
   * @param o.isDown  whether this beat is a downbeat, which strums harder
   * @param o.energy  0..1, how hard the section is being played
   * @param o.playing false parks the hand instead of animating it
   */
  function drawStrum(ctx, cal, f, o) {
    o = o || {};
    if (!isCalibrated(cal)) return false;
    const S = o.scale || 1000;

    // The outermost strings this chord actually sounds.
    let lo = 0, hi = 5;
    if (f && f.shape) {
      const live = [];
      f.shape.forEach((fr, i) => { if (fr !== 'x') live.push(i); });
      if (!live.length) return true;
      lo = live[0]; hi = live[live.length - 1];
    }

    const phase = Math.max(0, Math.min(1, o.phase || 0));
    // Down through the first half of the beat, back up through the second.
    const raw = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    const s = raw * raw * (3 - 2 * raw);                   // smoothstep
    const going = phase < 0.5 ? 1 : -1;                    // down or up
    const travel = o.playing === false ? 0.5 : s;
    const pos = lo - 0.6 + (hi - lo + 1.2) * travel;

    const u = strumU(cal);
    const p = at(cal, pos, u);
    const b = basis(cal);
    const w = halfWidth(cal, u);
    const r = Math.max(w * 0.30, 1.5);
    const accent = o.color || '#00e5d0';
    const power = (o.energy == null ? 0.7 : o.energy) * (o.isDown ? 1 : 0.75);

    ctx.save();
    ctx.lineCap = 'round';

    if (o.playing !== false) {
      /* The trail behind the pick is what makes a single frame read as
         movement rather than as a dot sitting on a string. */
      const from = at(cal, lo - 0.6 + (hi - lo + 1.2) * Math.max(0, travel - 0.28 * going), u);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.30 * power;
      ctx.lineWidth = r * 1.1;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Each string flashes as the stroke crosses it — but only if it sounds.
      if (f && f.shape) {
        f.shape.forEach((fr, i) => {
          if (fr === 'x') return;
          const d = Math.abs(pos - i);
          if (d > 0.75) return;
          const hit = (1 - d / 0.75) * power;
          const q = at(cal, i, u);
          ctx.strokeStyle = accent;
          ctx.globalAlpha = 0.85 * hit;
          ctx.lineWidth = Math.max(1, r * 0.35);
          ctx.beginPath();
          ctx.moveTo(q.x - b.ux * w * 1.6, q.y - b.uy * w * 1.6);
          ctx.lineTo(q.x + b.ux * w * 1.6, q.y + b.uy * w * 1.6);
          ctx.stroke();
        });
      }
      ctx.globalAlpha = 1;
    }

    // The pick: a small triangle pointing the way it is travelling.
    const ang = Math.atan2(b.py, b.px) + (going > 0 ? 0 : Math.PI);
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffd166';
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = o.playing === false ? 0 : r * 1.8;
    ctx.beginPath();
    ctx.moveTo(-r * 0.85, -r * 0.7);
    ctx.lineTo(-r * 0.85, r * 0.7);
    ctx.lineTo(r * 1.15, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return true;
  }

  global.Neck = {
    fretFraction, pressFraction, project, twelfthParam,
    isCalibrated, at, fingerAt, fretWire, halfWidth, draw, drawStrum, strumU
  };
})(window);
