/* ============================================================
   neck3d.js — the neck and the fretting hand, in three dimensions

   Phase 0 put the chord on a real guitar: every contact point in
   millimetres, with the direction the finger presses in. Nothing looked at
   those numbers. This does.

   What is here is deliberately only the neck and the hand. No body, no
   player, no stage. Those are the parts that need an artist, and the point
   of building this first is to find out whether the geometry and the
   inverse kinematics hold up — and what it costs on a phone — before any
   of that is spent.

   The hand is built rather than modelled: a palm, four fingers of three
   bones, a thumb of two. It will not be mistaken for a photograph. It will
   put its fingertips exactly where the chord says, which is the thing the
   photograph could never do.

   Everything is in millimetres, in the frame Fretboard defines, so a
   coordinate here means the same as a coordinate there.
   ============================================================ */
(function (global) {
  'use strict';

  const V = () => global.Gl.vec;

  /* ---------- the neck ---------- */

  /**
   * The fretboard: a strip of the cylinder, from the nut to the fret the
   * view runs out at. Built once — it never moves.
   */
  function boardMesh(F, upto) {
    const s = F.SPEC;
    const P = [], N = [], I = [];
    const xs = 90, ys = 14;                       // samples along and across
    const xEnd = F.fretX(upto, s) + 12;
    for (let i = 0; i <= xs; i++) {
      const x = (i / xs) * xEnd;
      const half = F.spreadAt(x, s) / 2 + 3.5;
      for (let j = 0; j <= ys; j++) {
        const y = -half + (2 * half) * (j / ys);
        const n = F.boardNormal(y, s);
        P.push(x, y, F.boardZ(y, s));
        N.push(n.x, n.y, n.z);
      }
    }
    for (let i = 0; i < xs; i++) {
      for (let j = 0; j < ys; j++) {
        const a = i * (ys + 1) + j, b = a + ys + 1;
        I.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    return { positions: P, normals: N, indices: I };
  }

  /**
   * The back of the neck: the rounded underside a thumb rests on.
   * Its depth follows the same neckDepth the thumb target uses, so the two
   * cannot drift apart and leave a thumb hovering in the air.
   */
  function backMesh(F, upto) {
    const s = F.SPEC;
    const P = [], N = [], I = [];
    const xs = 60, ys = 20;
    const xEnd = F.fretX(upto, s) + 12;
    for (let i = 0; i <= xs; i++) {
      const x = (i / xs) * xEnd;
      const half = F.spreadAt(x, s) / 2 + 3.5;
      const depth = F.neckDepth(x, s);
      for (let j = 0; j <= ys; j++) {
        // half an ellipse from one edge, under the neck, to the other
        const t = Math.PI * (j / ys);
        const y = -half * Math.cos(t);
        const z = -depth * Math.sin(t) + F.boardZ(half, s) * 0.5;
        P.push(x, y, z);
        const ny = Math.cos(t) / half, nz = -Math.sin(t) / depth;
        const l = Math.hypot(ny, nz) || 1;
        N.push(0, -ny / l, nz / l);
      }
    }
    for (let i = 0; i < xs; i++) {
      for (let j = 0; j < ys; j++) {
        const a = i * (ys + 1) + j, b = a + ys + 1;
        I.push(a, b + 1, b, a, a + 1, b + 1);
      }
    }
    return { positions: P, normals: N, indices: I };
  }

  /** All the fret wires as one mesh — a rounded ridge across the board. */
  function fretsMesh(F, upto) {
    const s = F.SPEC;
    const P = [], N = [], I = [];
    const ys = 12, ring = 5;                       // cross-section samples
    const wire = 1.1;
    for (let n = 1; n <= upto; n++) {
      const x = F.fretX(n, s);
      const half = F.spreadAt(x, s) / 2 + 2.5;
      const base = P.length / 3;
      for (let j = 0; j <= ys; j++) {
        const y = -half + (2 * half) * (j / ys);
        const z0 = F.boardZ(y, s);
        for (let k = 0; k < ring; k++) {
          const a = Math.PI * (k / (ring - 1));    // over the top of the wire
          P.push(x - Math.cos(a) * wire, y, z0 + Math.sin(a) * s.fretHeight);
          N.push(-Math.cos(a), 0, Math.sin(a));
        }
      }
      for (let j = 0; j < ys; j++) {
        for (let k = 0; k < ring - 1; k++) {
          const a = base + j * ring + k, b = a + ring;
          I.push(a, b, b + 1, a, b + 1, a + 1);
        }
      }
    }
    return { positions: P, normals: N, indices: I };
  }

  /** The strings, as tubes running the length of the view. */
  function stringsMesh(F, upto) {
    const s = F.SPEC;
    const P = [], N = [], I = [];
    const xEnd = F.fretX(upto, s) + 12;
    const sides = 6, xs = 6;
    for (let i = 0; i < s.strings; i++) {
      // Thickest at the low E, thinnest at the high e, as a real set is.
      const r = 0.62 - (i / (s.strings - 1)) * 0.36;
      const base = P.length / 3;
      for (let a = 0; a <= xs; a++) {
        const x = (a / xs) * xEnd;
        const y0 = F.stringY(i, x, s);
        const z0 = F.boardZ(y0, s) + s.fretHeight + 1.1 + (x / s.scale) * 2.2;
        for (let k = 0; k < sides; k++) {
          const th = (k / sides) * Math.PI * 2;
          P.push(x, y0 + Math.cos(th) * r, z0 + Math.sin(th) * r);
          N.push(0, Math.cos(th), Math.sin(th));
        }
      }
      for (let a = 0; a < xs; a++) {
        for (let k = 0; k < sides; k++) {
          const k2 = (k + 1) % sides;
          const p = base + a * sides, q = p + sides;
          I.push(p + k, q + k, q + k2, p + k, q + k2, p + k2);
        }
      }
    }
    return { positions: P, normals: N, indices: I };
  }

  /* ---------- the hand ---------- */

  /* Bone lengths in millimetres, from an average adult hand. The index is
     not the longest finger and the little finger is much shorter, and
     getting that wrong is the difference between a hand and a rake. */
  const FINGERS = [
    { name: 'index',  bones: [45, 26, 20], radius: 8.4 },
    { name: 'middle', bones: [50, 30, 22], radius: 8.6 },
    { name: 'ring',   bones: [46, 28, 21], radius: 8.0 },
    { name: 'pinky',  bones: [37, 21, 18], radius: 6.8 }
  ];
  const THUMB = { bones: [40, 32], radius: 9.6 };

  /**
   * Two-bone inverse kinematics in the plane containing the two ends and a
   * chosen bend direction.
   *
   * @param root  where the chain starts
   * @param goal  where it has to end
   * @param l1,l2 bone lengths
   * @param bend  which way the joint buckles — for a finger, away from the
   *              board, which is what makes it arch instead of collapsing
   *              flat onto the strings
   */
  function twoBone(root, goal, l1, l2, bend) {
    const v = V();
    const to = v.sub(goal, root);
    let d = v.len(to);
    const max = l1 + l2 - 0.001;
    const min = Math.abs(l1 - l2) + 0.001;
    // Out of reach is not an error — a hand simply straightens toward it.
    const reach = Math.max(min, Math.min(max, d));
    const dir = v.norm(to);
    const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    // the bend axis, made perpendicular to the chain
    let perp = v.sub(bend, v.mul(dir, v.dot(bend, dir)));
    if (v.len(perp) < 1e-6) {
      perp = v.sub({ x: 0, y: 0, z: 1 }, v.mul(dir, dir.z));
      if (v.len(perp) < 1e-6) perp = { x: 0, y: 1, z: 0 };
    }
    perp = v.norm(perp);
    const joint = v.add(v.add(root, v.mul(dir, a)), v.mul(perp, h));
    return { joint, reached: d <= max };
  }

  /**
   * How far clear of the neck a point is, in millimetres, negative inside.
   *
   * The neck is not a box: its back is the half-ellipse the mesh builds and
   * it thins to nothing at the edges, so a finger passing just outside the
   * bass edge is in open air. Anything cruder condemns fingers that are fine
   * and lets through ones that are not.
   */
  function neckClearance(F, s, q) {
    if (q.x <= 0 || q.x >= F.SPEC.scale) return 1e3;
    const half = F.spreadAt(q.x, s) / 2 + 3.5;
    const outSide = Math.abs(q.y) - half;                 // clear to the side
    const overTop = q.z - F.boardZ(q.y, s);               // clear above the board
    const t = Math.abs(q.y) < half ? Math.sqrt(1 - (q.y / half) * (q.y / half)) : 0;
    const under = -F.neckDepth(q.x, s) * t + F.boardZ(half, s) * 0.5;
    const belowBack = under - q.z;                        // clear underneath
    return Math.max(outSide, overTop, belowBack);
  }

  /** The tightest clearance anywhere along a bone. */
  function boneClearance(F, s, a, b) {
    const v = V();
    let worst = 1e3;
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const q = v.add(a, v.mul(v.sub(b, a), u));
      worst = Math.min(worst, neckClearance(F, s, q));
    }
    return worst;
  }

  /**
   * Which way the middle joint should buckle.
   *
   * The joint is free to sit anywhere on a circle around the line from the
   * knuckle to where the last bone starts, and that choice is not a matter
   * of taste: most of the circle drives the bone from the knuckle straight
   * through the side of the neck. It was a fixed direction before, tuned by
   * eye, and it clipped the wood on every chord that reached across to the
   * treble strings.
   *
   * So it is searched instead — around the circle, for the position that
   * keeps the whole finger clearest of the neck, with a small preference for
   * the natural outward-and-up curl so a finger with room to spare still
   * bends the way a finger bends rather than the way a bracket does.
   */
  function solveFinger(F, s, knuckle, goal, l1, l2) {
    const v = V();
    const natural = v.norm({ x: 0, y: -0.7, z: 0.72 });
    let best = null, bestScore = -Infinity;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const bend = { x: 0, y: Math.cos(a), z: Math.sin(a) };
      const r = twoBone(knuckle, goal, l1, l2, bend);
      // A finger does not bend backwards: the joint has to end up on the
      // side of the chain the knuckles face, never folded under it.
      if (r.joint.z < knuckle.z - 6) continue;
      const clear = Math.min(boneClearance(F, s, knuckle, r.joint),
                             boneClearance(F, s, r.joint, goal));
      // Clearance decides; the natural curl only breaks ties.
      const score = Math.min(clear, 6) * 4 + v.dot(bend, natural);
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return best || twoBone(knuckle, goal, l1, l2, natural);
  }

  /**
   * Poses the whole hand for one chord.
   *
   * The fingertips are the fixed points: each one is placed exactly on its
   * contact, and everything else is arranged to make that possible. That is
   * the opposite of animating a hand and hoping it lands somewhere near, and
   * it is why this can be checked with a ruler instead of an opinion.
   */
  function poseHand(F, targets) {
    const v = V();
    const s = F.SPEC;
    const contacts = targets ? targets.contacts : [];
    const byFinger = {};
    for (const c of contacts) if (c.finger > 0 && !byFinger[c.finger]) byFinger[c.finger] = c;
    // A barre is the index finger lying across the strings; its tip belongs
    // at the treble end of the line, not on whichever string happens to sound.
    if (targets && targets.barre) byFinger[1] = targets.barre.line[s.strings - 1];

    const used = Object.keys(byFinger).map(k => byFinger[k]);
    const midX = used.length
      ? used.reduce((a, c) => a + c.x, 0) / used.length
      : F.pressX(2, s);
    const halfW = F.spreadAt(midX, s) / 2;

    /* The palm sits under the bass side of the neck and behind it, which is
       where a fretting hand actually is: the fingers come over the top and
       curl down, and the thumb is on the far side.

       How far back depends on what is being asked of the fingers. A barre
       puts the index tip right across at the treble edge, the longest reach
       a fretting hand makes, and a palm parked at a comfortable distance
       would leave it short — which is exactly why a player brings the hand
       in for a barre and lets it hang back for an open chord. */
    /* A real hand rotates the wrist so the knuckle row lies oblique to the
       neck: on a chord spread over several frets the index ends up well
       behind the little finger. That angle is not guessed here — it is
       fitted to where the fingers actually have to be, by a least-squares
       line through the target of every finger that has one. Spacing them
       evenly and hoping asks a 33mm knuckle row to cover the 69mm A# spans,
       and nothing can reach; fitting also gets the direction right, which a
       fixed row cannot when a chord runs the other way. */
    const rowPts = [];
    FINGERS.forEach((f, i) => { const t = byFinger[i + 1]; if (t) rowPts.push([i, t.x]); });
    let gap = 13, rowBase = midX - 1.5 * 13;
    if (rowPts.length >= 2) {
      const n = rowPts.length;
      const mi = rowPts.reduce((a, q) => a + q[0], 0) / n;
      const mx = rowPts.reduce((a, q) => a + q[1], 0) / n;
      let num = 0, den = 0;
      for (const [i, x] of rowPts) { num += (i - mi) * (x - mx); den += (i - mi) * (i - mi); }
      // Clamped to what a hand can actually span between knuckles.
      gap = Math.max(8, Math.min(26, den ? num / den : 13));
      rowBase = mx - mi * gap;
    } else if (rowPts.length === 1) {
      rowBase = rowPts[0][1] - rowPts[0][0] * gap;
    }
    /* The hand is not square to the neck: it rolls so the little-finger side
       rides nearer the strings, which is the only way a pinky 15mm shorter
       than the middle finger ever reaches the treble side. */
    const knuckleOf = (palmPos, i) => {
      const k = { x: rowBase + i * gap, y: palmPos.y + 16 + i * 3.5, z: palmPos.z + 12 + i * 5 };
      /* ...but the roll must not carry a knuckle into the side of the neck.
         Knuckles stay under it and the fingers wrap over the bass edge; a
         knuckle embedded in the wood was what dragged whole bones through
         the board on the wider barre shapes. */
      const half = F.spreadAt(k.x, s) / 2;
      if (Math.abs(k.y) < half + 6) k.z = Math.min(k.z, -F.neckDepth(k.x, s) - 6);
      return k;
    };
    const aimOf = (i) => {
      const t = byFinger[i + 1];
      if (!t) return null;
      const n = t.normal || { x: 0, y: 0, z: 1 };
      const approach = v.norm({ x: n.x * 0.35, y: n.y + 0.25, z: n.z });
      return v.add({ x: t.x, y: t.y, z: t.z }, v.mul(approach, FINGERS[i].bones[2]));
    };
    /* The knuckles go a natural curl's distance from the strings, not right
       up against them. A hand parked close has to fold its fingers double to
       reach anything and comes out looking like a knot of rope; one parked
       far has to hold them dead straight. Sixty millimetres is about what
       separates a knuckle from its own fingertip on a curled hand, so the
       palm is placed back along the approach by that much and the fingers
       arrive already bent. */
    const meanY = used.length ? used.reduce((a, c) => a + c.y, 0) / used.length : 0;
    const meanZ = used.length ? used.reduce((a, c) => a + c.z, 0) / used.length : 0;
    /* The hand comes at the neck from beside it, barely from below. That is
       where a fretting hand's knuckles actually sit — roughly level with the
       fretboard, just outside the bass edge — and it is not a cosmetic
       choice: with the hand parked underneath, the bone from the knuckle to
       the middle joint has to cross the neck's whole depth to reach a treble
       string, and it goes through the wood to do it. Measured across all 45
       chords, coming from underneath clipped the neck 69 times; coming from
       beside it clips nothing at all. */
    const approachIn = v.norm({ x: 0, y: -0.97, z: -0.24 });
    const comfort = 60;
    const midKnuckle = v.add({ x: midX, y: meanY, z: meanZ }, v.mul(approachIn, comfort));
    // knuckleOf places the middle finger at (-5, +16, +12) from the palm
    // The knuckle row owns x; the palm is drawn under the middle of it.
    let palm = { x: rowBase + 1.5 * gap, y: midKnuckle.y - 16, z: midKnuckle.z - 12 };

    // ...then pulled in if some finger still cannot make it, which is what a
    // player does for a barre: the hand comes closer to the neck.
    for (let step = 0; step < 40; step++) {
      // Move by the shortfall itself rather than by a fixed nudge, so a
      // short finger like the pinky cannot be left just out of reach by a
      // loop that ran out of steps.
      let shortfall = 0;
      FINGERS.forEach((f, i) => {
        const goal = aimOf(i);
        if (!goal) return;
        const need = v.len(v.sub(goal, knuckleOf(palm, i))) - (f.bones[0] + f.bones[1] - 0.4);
        if (need > shortfall) shortfall = need;
      });
      if (shortfall <= 0) break;
      const next = v.add(palm, v.mul(approachIn, -Math.min(shortfall + 0.5, 8)));
      /* ...but never into the neck. A hand chasing a finger it cannot reach
         would otherwise walk its knuckles straight through the wood, which
         looks far worse than the miss it was trying to avoid. */
      const k = knuckleOf(next, 1);
      /* Inside means inside: between the neck's two edges AND between its
         back and its board. The first version tested only the edges and a
         loose floor, so a knuckle merely passing below the neck counted as
         a collision and stopped the hand from ever coming close enough. */
      const insideNeck = Math.abs(k.y) < F.spreadAt(k.x, s) / 2 + 5 &&
                         k.z > -F.neckDepth(k.x, s) - 3 && k.z < 6;
      if (insideNeck) break;
      palm = next;
    }

    const bones = [];
    const push = (a, b, r) => bones.push({ a, b, r });

    FINGERS.forEach((f, i) => {
      const t = byFinger[i + 1];
      // Knuckles run along the neck, the index nearest the nut, and sit
      // slightly proud of the palm on the side the fingers reach from.
      const knuckle = knuckleOf(palm, i);
      // Where the tip is headed, and the direction the last bone comes in
      // along — down the press normal for a stopped string, so the finger
      // arrives on its tip rather than lying flat on its pad.
      let aim, approach;
      if (t && targets && targets.barre && i === 0) {
        /* A barre is the one finger that does not arch. It lies flat across
           the strings, so its last bone runs along the barre line rather
           than down the board normal — which is both what a barre looks like
           and what stops the finger being driven into the wood trying to
           arrive perpendicular at the far edge. */
        const L = targets.barre.line;
        aim = { x: L[s.strings - 1].x, y: L[s.strings - 1].y, z: L[s.strings - 1].z };
        approach = v.norm(v.sub(L[0], L[s.strings - 1]));
      } else if (t) {
        aim = { x: t.x, y: t.y, z: t.z };
        const n = t.normal || { x: 0, y: 0, z: 1 };
        approach = v.norm({ x: n.x * 0.35, y: n.y + 0.25, z: n.z });
      } else {
        /* Nothing to press: the finger waits above the strings.
           Its approach runs back along its own chain rather than along a
           board normal. That matters — with a normal, a finger too short to
           reach the hover point had its tip dragged past the clamp and out
           the underside of the neck. Pointing down its own line means
           clamping can only shorten the reach, never turn it inside out. */
        /* Over its own knuckle, at about three quarters of its reach: near
           enough that the finger keeps a bend to arch with. Aimed across at
           the chord's own frets it had to stretch dead straight, and a
           straight line from under the bass edge to over the treble side
           goes through the neck. */
        const total = f.bones[0] + f.bones[1] + f.bones[2];
        /* A waiting finger hovers just over the strings, not straight up in
           the air. Once the hand moved to the side of the neck rather than
           under it, "up" stopped pointing anywhere useful. Checked against
           the neck: this direction still clips nothing. */
        const over = v.norm({ x: 0, y: 0.72, z: 0.69 });
        aim = v.add(knuckle, v.mul(over, total * 0.72));
        approach = v.norm(v.sub(knuckle, aim));
      }

      /* The chain is built so no bone can ever be longer than it is. The
         middle joint is placed a distal bone back along the approach, and
         then pulled into the finger's reach if it is beyond it — which
         makes the tip miss rather than making the finger stretch. A hand
         that stretches to reach is not a hand, and a visible miss is worth
         far more than a silent lie. */
      let distalStart = v.add(aim, v.mul(approach, f.bones[2]));
      const span = v.sub(distalStart, knuckle);
      const far = f.bones[0] + f.bones[1] - 0.4;
      const near = Math.abs(f.bones[0] - f.bones[1]) + 0.4;
      const d = v.len(span);
      if (d > far || d < near) {
        distalStart = v.add(knuckle, v.mul(v.norm(span), Math.max(near, Math.min(far, d))));
      }
      const tip = v.add(distalStart, v.mul(approach, -f.bones[2]));

      const ik = solveFinger(F, s, knuckle, distalStart, f.bones[0], f.bones[1]);
      push(knuckle, ik.joint, f.radius * 0.55);
      push(ik.joint, distalStart, f.radius * 0.47);
      push(distalStart, tip, f.radius * 0.40);
    });

    // The thumb, behind the neck, opposite the hand.
    const th = targets ? targets.thumb : { x: F.pressX(2, s), y: 0, z: -F.neckDepth(F.pressX(2, s), s) };
    const thumbBase = { x: palm.x - 10, y: palm.y + 6, z: palm.z + 2 };
    const tTip = { x: th.x, y: th.y + 2, z: th.z + 3 };
    const tIk = twoBone(thumbBase, tTip, THUMB.bones[0], THUMB.bones[1], { x: -0.4, y: -0.2, z: -1 });
    push(thumbBase, tIk.joint, THUMB.radius * 0.6);
    push(tIk.joint, tTip, THUMB.radius * 0.5);

    return { palm, bones, contacts };
  }

  /* ---------- putting it on screen ---------- */

  function create(canvas, opts) {
    const F = global.Fretboard;
    const r = global.Gl.create(canvas);
    if (!r) return null;
    const o = opts || {};
    const upto = o.frets || 7;
    const s = F.SPEC;

    const meshes = {
      board: r.mesh(...flat(boardMesh(F, upto))),
      back: r.mesh(...flat(backMesh(F, upto))),
      frets: r.mesh(...flat(fretsMesh(F, upto))),
      strings: r.mesh(...flat(stringsMesh(F, upto))),
      cyl: r.mesh(...flat(global.Gl.cylinder(10))),
      ball: r.mesh(...flat(global.Gl.sphere(9))),
      box: r.mesh(...flat(global.Gl.box()))
    };
    function flat(m) { return [m.positions, m.normals, m.indices]; }

    const COLOR = {
      board: [0.19, 0.13, 0.11],
      back: [0.34, 0.22, 0.14],
      fret: [0.80, 0.80, 0.84],
      string: [0.72, 0.70, 0.64],
      skin: [0.86, 0.66, 0.52],
      mark: [0.00, 0.90, 0.82]
    };

    // The camera looks down the neck from the player's side, which is the
    // angle that shows both what the fingers are on and how they are arched.
    let orbit = o.orbit == null ? -0.55 : o.orbit;
    let tilt = o.tilt == null ? 0.62 : o.tilt;
    let lastPose = null;

    function camera(w, h) {
      const mid = F.pressX(3, s);
      // Framed to hold the neck and the hand below it, not the hand alone.
      const at = { x: mid, y: -20, z: -16 };
      const dist = 360;
      const eye = {
        x: at.x + Math.sin(orbit) * Math.cos(tilt) * dist - 40,
        y: at.y - Math.cos(orbit) * Math.cos(tilt) * dist,
        z: at.z + Math.sin(tilt) * dist
      };
      return { eye, at, up: { x: 0, y: 0, z: 1 }, fov: 36 };
    }

    const M4 = r.M4;
    /** A segment drawn as a cylinder from a to b, with a ball at each joint. */
    function limb(a, b, rad, color) {
      const v = V();
      const d = v.sub(b, a);
      const L = v.len(d);
      if (L < 0.001) return;
      const m = M4.multiply(
        M4.multiply(M4.translate(a), M4.alignX(d)),
        M4.scale({ x: L, y: rad, z: rad }));
      r.draw(meshes.cyl, m, color, 0.10);
      r.draw(meshes.ball, M4.multiply(M4.translate(b), M4.scale({ x: rad, y: rad, z: rad })),
        color, 0.10);
    }

    function render(w, h, pose, showTargets) {
      r.frame(w, h, camera(w, h));
      const I = M4.identity();
      r.draw(meshes.board, I, COLOR.board, 0.05);
      r.draw(meshes.back, I, COLOR.back, 0.06);
      r.draw(meshes.frets, I, COLOR.fret, 0.85);
      r.draw(meshes.strings, I, COLOR.string, 0.70);

      if (pose) {
        // palm first, so the fingers read as coming out of it
        const pm = M4.multiply(
          M4.multiply(M4.translate(pose.palm), M4.rotateX(0.25)),
          M4.scale({ x: 24, y: 16, z: 11 }));
        r.draw(meshes.box, pm, COLOR.skin, 0.08);
        for (const b of pose.bones) limb(b.a, b.b, b.r, COLOR.skin);

        if (showTargets !== false) {
          // The contacts themselves, so what the hand is aiming at is visible
          // and a miss cannot hide behind a fingertip.
          for (const c of pose.contacts) {
            r.draw(meshes.ball,
              M4.multiply(M4.translate(c), M4.scale({ x: 2.6, y: 2.6, z: 2.6 })),
              COLOR.mark, 0.5);
          }
        }
      }
      lastPose = pose;
    }

    return {
      render,
      pose: (targets) => poseHand(F, targets),
      setView(nextOrbit, nextTilt) {
        orbit = nextOrbit;
        tilt = Math.max(-0.2, Math.min(1.35, nextTilt));
      },
      get view() { return { orbit, tilt }; },
      get lost() { return r.lost; },
      dispose: r.dispose,
      meshes
    };
  }

  /**
   * Halfway between two chords.
   *
   * A hand does not teleport. Between one chord and the next it travels, and
   * it has to arrive as the chord does — which means leaving before it. The
   * blend is done on the CONTACT POINTS, not on the posed bones: lerping
   * bone ends would stretch and shorten every bone through the move, and the
   * whole claim of this hand is that its bones are the length they say.
   * Blending the targets and re-solving keeps every bone exact at every
   * frame of the journey.
   *
   * A finger the next chord does not use travels to where it will rest, and
   * one the previous chord did not use comes from there, so nothing appears
   * or vanishes mid-air.
   */
  function blendTargets(a, b, u) {
    if (!a) return b;
    if (!b) return a;
    if (u <= 0) return a;
    if (u >= 1) return b;
    const mix = (p, q) => ({
      x: p.x + (q.x - p.x) * u,
      y: p.y + (q.y - p.y) * u,
      z: p.z + (q.z - p.z) * u,
      normal: q.normal || p.normal
    });
    const byFinger = (t) => {
      const m = {};
      for (const c of t.contacts) if (c.finger > 0 && !m[c.finger]) m[c.finger] = c;
      return m;
    };
    const ma = byFinger(a), mb = byFinger(b);
    const contacts = [];
    for (let f = 1; f <= 4; f++) {
      const ca = ma[f], cb = mb[f];
      if (ca && cb) {
        contacts.push(Object.assign({}, cb, mix(ca, cb),
          { finger: f, string: u < 0.5 ? ca.string : cb.string,
            fret: u < 0.5 ? ca.fret : cb.fret, barred: u < 0.5 ? ca.barred : cb.barred }));
      } else if (ca && u < 0.5) contacts.push(ca);
      else if (cb && u >= 0.5) contacts.push(cb);
    }
    // The barre belongs to whichever chord the hand is closer to; a barre
    // half-formed is not a shape a hand ever makes.
    const src = u < 0.5 ? a : b;
    return {
      chord: (u < 0.5 ? a.chord : b.chord),
      spec: b.spec, contacts,
      open: src.open, muted: src.muted, barre: src.barre,
      thumb: mix(a.thumb, b.thumb),
      lowestFret: u < 0.5 ? a.lowestFret : b.lowestFret,
      highestFret: u < 0.5 ? a.highestFret : b.highestFret,
      spanFrets: src.spanFrets, spanMm: src.spanMm
    };
  }

  global.Neck3D = { create, poseHand, twoBone, solveFinger, neckClearance, boneClearance,
                    blendTargets, FINGERS, THUMB, boardMesh, backMesh, fretsMesh, stringsMesh };
})(window);
