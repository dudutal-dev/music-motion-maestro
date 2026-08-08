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

  /* How thick the fretboard is. The first version had none: the board was a
     surface with no edge, and the rounded back met it exactly along the line
     where it ended. That reads as a neck made of paper, and it left the side
     of the neck — where the position dots a player actually reads live —
     with no face to put them on. */
  const BOARD_THICK = 6;

  /** Where the board's edge is at this point along the neck. */
  function boardHalf(F, x, s) { return F.spreadAt(x, s) / 2 + 3.5; }

  /**
   * The fretboard: a strip of the cylinder, from the nut to the fret the
   * view runs out at, with a square edge dropping away on both sides.
   * Built once — it never moves.
   */
  function boardMesh(F, upto) {
    const s = F.SPEC;
    const P = [], N = [], I = [];
    const xs = 90, ys = 14;                       // samples along and across
    const xEnd = F.fretX(upto, s) + 12;
    for (let i = 0; i <= xs; i++) {
      const x = (i / xs) * xEnd;
      const half = boardHalf(F, x, s);
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
    // The two edges, as a wall from the top face down to the back's shoulder.
    for (const side of [-1, 1]) {
      const base = P.length / 3;
      for (let i = 0; i <= xs; i++) {
        const x = (i / xs) * xEnd;
        const y = side * boardHalf(F, x, s);
        const z = F.boardZ(y, s);
        P.push(x, y, z, x, y, z - BOARD_THICK);
        N.push(0, side, 0, 0, side, 0);
      }
      for (let i = 0; i < xs; i++) {
        const a = base + i * 2, b = a + 2;
        if (side < 0) I.push(a, b, b + 1, a, b + 1, a + 1);
        else I.push(a, b + 1, b, a, a + 1, b + 1);
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
    /* The neck runs past the nut, because a neck does — the nut is a bar set
       into the end of the fretboard, not the end of the instrument. Stopping
       the back at x=0 left the nut floating in front of nothing. */
    const xStart = -6;
    for (let i = 0; i <= xs; i++) {
      const x = xStart + (i / xs) * (xEnd - xStart);
      const half = boardHalf(F, x, s);
      // The back hangs off the bottom of the fretboard's edge, so the two
      // meet along a shoulder rather than the back swallowing the board.
      const top = F.boardZ(half, s) - BOARD_THICK;
      const depth = Math.max(4, F.neckDepth(x, s) - BOARD_THICK);
      for (let j = 0; j <= ys; j++) {
        // half an ellipse from one edge, under the neck, to the other
        const t = Math.PI * (j / ys);
        const y = -half * Math.cos(t);
        const z = -depth * Math.sin(t) + top;
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

  /* Where the position markers go. Every guitar in the world carries them at
     the same frets, and a player reads position from them without looking —
     which is exactly why a neck without them is disorienting to look at even
     when every other measurement is right. Twelve is doubled. */
  const MARKERS = [3, 5, 7, 9, 15, 17, 19, 21];
  const DOUBLE = [12, 24];

  /**
   * The bone parts: the nut, the face inlays and the side dots, as one mesh
   * because they are all the same material and the renderer draws by material.
   *
   * The nut is not decoration — it is where the open strings stop, and the
   * board's own numbers start from its face. Leaving it off left the neck
   * beginning in mid-air at x=0.
   */
  function trimMesh(F, upto) {
    const s = F.SPEC;
    const P = [], N = [], I = [];

    /* The nut: a bar across the end of the board, standing a little higher
       than the fret wire so the strings clear the first fret. Its profile is
       given as a section in the (x, z) plane and swept across the neck. */
    const half0 = boardHalf(F, 0, s) + 0.8;
    const top = s.fretHeight + 2.2;
    /* Three and a half millimetres wide and standing about three above the
       board — a real nut, not the six-by-nine bar the first version cut,
       which read as a doorstop bolted to the end of the neck. */
    const PROFILE = [
      [-3.5, -BOARD_THICK], [-3.5, top - 0.7], [-2.9, top],
      [-0.6, top], [0.0, top - 0.7], [0.0, -BOARD_THICK]
    ];
    {
      const ys = 10, base = P.length / 3;
      for (let j = 0; j <= ys; j++) {
        const y = -half0 + (2 * half0) * (j / ys);
        const z0 = F.boardZ(y, s);
        for (const [dx, dz] of PROFILE) { P.push(dx, y, z0 + dz); N.push(0, 0, 0); }
      }
      const w = PROFILE.length;
      for (let j = 0; j < ys; j++) {
        for (let k = 0; k < w - 1; k++) {
          const a = base + j * w + k, b = a + w;
          I.push(a, b, b + 1, a, b + 1, a + 1);
        }
      }
      // The two ends, so the nut is a solid bar rather than a bent sheet.
      for (const [row, flip] of [[0, true], [ys, false]]) {
        const r0 = base + row * w;
        for (let k = 1; k < w - 1; k++) {
          if (flip) I.push(r0, r0 + k, r0 + k + 1);
          else I.push(r0, r0 + k + 1, r0 + k);
        }
      }
      // Normals from the profile's own segments, so the top reads flat and
      // the front face reads square instead of everything sharing one normal.
      for (let j = 0; j <= ys; j++) {
        for (let k = 0; k < w; k++) {
          const a = PROFILE[Math.max(0, k - 1)], b = PROFILE[Math.min(w - 1, k + 1)];
          const dx = b[0] - a[0], dz = b[1] - a[1];
          const l = Math.hypot(dx, dz) || 1;
          const idx = (base + j * w + k) * 3;
          N[idx] = dz / l; N[idx + 1] = 0; N[idx + 2] = -dx / l;
        }
      }
    }

    /** A disc lying on a surface, given its centre, its plane and a radius. */
    function disc(c, u, w, r, n, seg) {
      const base = P.length / 3;
      P.push(c.x, c.y, c.z); N.push(n.x, n.y, n.z);
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const co = Math.cos(a) * r, si = Math.sin(a) * r;
        P.push(c.x + u.x * co + w.x * si, c.y + u.y * co + w.y * si, c.z + u.z * co + w.z * si);
        N.push(n.x, n.y, n.z);
      }
      for (let k = 0; k < seg; k++) I.push(base, base + 1 + k, base + 1 + ((k + 1) % seg));
    }

    for (let n = 1; n <= upto; n++) {
      const single = MARKERS.indexOf(n) >= 0, dbl = DOUBLE.indexOf(n) >= 0;
      if (!single && !dbl) continue;
      const x = F.pressX(n, s);
      const spread = F.spreadAt(x, s);

      // On the face: dead centre, or a pair straddling it at the twelfth.
      const ys = dbl ? [-spread / 4, spread / 4] : [0];
      for (const y of ys) {
        const nrm = F.boardNormal(y, s);
        // Proud of the board by a fifth of a millimetre: enough that the
        // depth test cannot flicker, far too little to see as a bump.
        const c = { x, y, z: F.boardZ(y, s) + 0.2 };
        disc(c, { x: 1, y: 0, z: 0 }, { x: 0, y: nrm.z, z: -nrm.y }, 5.2, nrm, 20);
      }

      // On the edge the player sees. These are the ones a hand actually reads
      // — the face dots are hidden under the strings from where a player sits.
      const yEdge = -boardHalf(F, x, s) - 0.15;
      const zEdge = F.boardZ(yEdge, s) - BOARD_THICK / 2;
      const out = { x: 0, y: -1, z: 0 };
      for (const off of dbl ? [-7, 7] : [0]) {
        disc({ x: x + off, y: yEdge, z: zEdge },
          { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 1.5, out, 12);
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
  /* Wrist to knuckle row. Shared, because handFrame puts the wrist here
     and palmMesh spans from it — two copies of one number is two chances
     for the palm and the arm to stop meeting. */
  const PALM_LEN = 62;

  /**
   * Where the hand sits relative to the neck.
   *
   * `approach` is the direction the knuckles lie in from the strings, and
   * `comfort` is how far back along it they park. Together they are the
   * single most consequential pair of numbers in the file, and both have
   * been wrong in opposite directions: straight underneath drove bones
   * through the wood on 69 chords, and straight out to the side left every
   * finger stretched across the bass edge to reach anything.
   *
   * So they are not eyeballed. Both were swept across all 45 chords, and
   * this is the closest the hand can hold the neck with every finger bone of
   * every chord still clear of the wood: 20 degrees below the horizontal,
   * 52mm back, which puts the knuckles about 20mm off the neck — a finger's
   * width, which is where a hand holds a neck. One step nearer (48mm) starts
   * cutting the bass corner on Dsus4. The thumb is exempt: it presses the
   * back of the neck, so "inside the neck" is where it belongs.
   *
   * Anyone changing these should re-run the sweep rather than re-judging by
   * eye. The margin is one step in either parameter.
   */
  const POSTURE = {
    approach: { x: 0, y: -Math.cos(20 * Math.PI / 180), z: -Math.sin(20 * Math.PI / 180) },
    comfort: 52
  };

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
    // The same half-ellipse backMesh draws, hung off the same shoulder — so
    // what the solver avoids and what the eye sees are one shape, not two.
    const under = -(F.neckDepth(q.x, s) - BOARD_THICK) * t + F.boardZ(half, s) - BOARD_THICK;
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
   * Geometrically the joint may sit anywhere on a circle around the line from
   * the knuckle to where the last bone starts. Anatomically it may not: a
   * finger's joints are hinges square to the knuckle row, so only two points
   * on that circle are reachable — one either side of the row's axis.
   *
   * Both earlier answers came from ignoring that. A fixed direction, tuned by
   * eye, drove bones through the side of the neck on every chord that reached
   * across to the treble strings. Searching the whole circle for clearance
   * fixed the wood and broke the hand: it found bends no finger can make.
   * Two candidates is the honest number.
   */
  function solveFinger(F, s, knuckle, goal, l1, l2, row) {
    const v = V();
    /* A finger does not get to choose a plane to bend in. Its joints are
       hinges, all square to the same axis — the knuckle row — so the middle
       joint can only be in the plane through the chain perpendicular to that
       row, on one side of it or the other. That is the whole choice.

       Searching two dozen free directions instead, as this used to, allowed
       answers that no finger can make: a bend direction lying nearly along
       the chain produces a perpendicular dominated by the part that cancels
       it, and the joint gets flung sideways along the neck. That is where the
       looped, ribbon-like fingers came from — the middle finger's joint was
       leaving its own knuckle 30mm behind, up the neck, and coming back.

       Two candidates, and clearance picks between them. */
    const dir = v.norm(v.sub(goal, knuckle));
    let axis = v.cross(row || { x: 1, y: 0, z: 0 }, dir);
    if (v.len(axis) < 1e-4) axis = v.norm({ x: 0, y: -0.7, z: 0.72 });
    axis = v.norm(axis);
    const score = (r) => {
      const clear = Math.min(boneClearance(F, s, knuckle, r.joint),
                             boneClearance(F, s, r.joint, goal));
      // The middle joint of a fretting finger sits low over the board — a
      // couple of centimetres, not standing up over the strings.
      const high = Math.max(0, (r.joint.z - F.boardZ(r.joint.y, s)) - 26);
      // ...and it arches away from the palm, never folding under the chain.
      const back = r.joint.z - knuckle.z;
      return Math.min(clear, 6) * 4 - high * 1.5 + Math.min(back, 10) * 0.3;
    };
    const a = twoBone(knuckle, goal, l1, l2, axis);
    const b = twoBone(knuckle, goal, l1, l2, v.mul(axis, -1));
    return score(a) >= score(b) ? a : b;
  }

  /**
   * Where the last bone starts, for a finger pressing a string.
   *
   * The tip is fixed — it is on the contact and it stays there. What is free
   * is how steeply the last bone comes down onto it, and that freedom is the
   * whole point: a long finger on a near target has slack to lose, and a hand
   * loses it by curling the tip over further, not by folding the middle joint
   * up into the air. With this angle nailed to the board normal, the slack
   * had nowhere else to go, and every long finger buckled.
   */
  function distalStartFor(F, s, knuckle, aim, normal, f) {
    const v = V();
    const want = (f.bones[0] + f.bones[1]) * 0.88;
    /* The tilt is not free in every direction — only in the finger's own
       plane, leaning back toward its knuckle. A first version searched a full
       cone and found perfectly good answers that lay the last bone ALONG the
       neck, so every fingertip curled back toward the nut like a hook. A
       finger curls toward its own palm and nowhere else.

       Leaning that way is also what absorbs the slack: it shortens the run
       from knuckle to the last joint, which is the quantity the search is
       trying to bring down to a comfortable length. */
    const toK = v.sub(knuckle, aim);
    let lateral = v.sub(toK, v.mul(normal, v.dot(toK, normal)));
    if (v.len(lateral) < 1e-3) return { dir: normal, ds: v.add(aim, v.mul(normal, f.bones[2])) };
    lateral = v.norm(lateral);
    let best = null, bestScore = Infinity;
    // Up to about forty degrees off the perpendicular, which is as far over
    // as a fingertip goes before the nail, not the pad, is on the string.
    for (let k = 0; k <= 8; k++) {
      const tilt = (k / 8) * 0.72;
      const dir = v.norm(v.add(v.mul(normal, Math.cos(tilt)), v.mul(lateral, Math.sin(tilt))));
      const ds = v.add(aim, v.mul(dir, f.bones[2]));
      // Never let the joint above the tip end up inside the neck.
      if (neckClearance(F, s, ds) < 0) continue;
      const err = Math.abs(v.len(v.sub(ds, knuckle)) - want);
      if (err < bestScore) { bestScore = err; best = { dir, ds }; }
    }
    return best || { dir: normal, ds: v.add(aim, v.mul(normal, f.bones[2])) };
  }

  /**
   * Poses the whole hand for one chord.
   *
   * The fingertips are the fixed points: each one is placed exactly on its
   * contact, and everything else is arranged to make that possible. That is
   * the opposite of animating a hand and hoping it lands somewhere near, and
   * it is why this can be checked with a ruler instead of an opinion.
   */
  function poseHand(F, targets, opts) {
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
      // Adjacent knuckles are about 20mm apart on an adult hand; the wrist
      // can angle the row but it cannot stretch it, and letting this run to
      // 26 gave a four-knuckle span of 78mm and a palm to match.
      gap = Math.max(8, Math.min(21, den ? num / den : 13));
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
    /* Where the last bone starts, for the reach test below. It has to be the
       same point the pose itself will use — a reach test against a target the
       finger is not actually going to aim at is worse than none, because it
       moves the whole hand for a shortfall that does not exist. */
    const aimOf = (knuckle, i) => {
      const t = byFinger[i + 1];
      if (!t) return null;
      const n = t.normal || { x: 0, y: 0, z: 1 };
      const aim = { x: t.x, y: t.y, z: t.z };
      return distalStartFor(F, s, knuckle, aim,
        v.norm({ x: n.x * 0.35, y: n.y + 0.25, z: n.z }), FINGERS[i]).ds;
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
    /* ...but not from so far to the side that it is standing beside the neck
       rather than holding it. The first version of this came from underneath
       and clipped the wood 69 times; the correction swung all the way out to
       the side, and the hand ended up reaching across from a distance, with
       every finger stretched over the bass edge to get anywhere.

       Where a hand actually sits is between the two, and it is not a matter
       of taste: it is the closest the hand can come to the neck while every
       bone of every chord still stays out of the wood. That is a number, so
       it was found by sweeping both parameters over all 45 chords rather
       than by eye — see POSTURE. */
    const approachIn = v.norm((opts && opts.approach) || POSTURE.approach);
    const comfort = (opts && opts.comfort) || POSTURE.comfort;
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
        const k = knuckleOf(palm, i);
        const goal = aimOf(k, i);
        if (!goal) return;
        const need = v.len(v.sub(goal, k)) - (f.bones[0] + f.bones[1] - 0.4);
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
    /* The axis every finger's joints hinge about: the knuckle row itself.
       Taken from the posed knuckles rather than assumed to run along the
       neck, because the wrist turns the row and the fingers turn with it. */
    const row = v.norm(v.sub(knuckleOf(palm, 3), knuckleOf(palm, 0)));
    /* Which way each fingertip is pressing, or null for a finger that is
       only waiting. A pressed fingertip is not round — it flattens against
       the string, and the flat spot faces the board. Recording the direction
       here is what lets the surface show it later; nothing else in the pose
       knows a fingertip from any other part of a tube.

       `from` is a fraction of the swept line, which now has four segments
       rather than three — the fingers start inside the palm. 0.8 is a fifth
       of the way along the last bone; a barre spreads from much further back
       because the whole underside of that finger is on the strings. */
    const press = [];

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
        // How steeply the last bone comes down is chosen, not fixed — see
        // distalStartFor. The tip stays exactly on the contact either way.
        approach = distalStartFor(F, s, knuckle, aim,
          v.norm({ x: n.x * 0.35, y: n.y + 0.25, z: n.z }), f).dir;
      } else {
        /* Nothing to press: the finger waits over the strings.
           It waits the way a finger waits — curled, close over the board,
           near its own knuckle. Two earlier versions aimed it at a point a
           fixed distance out along some direction, and both produced the
           same wrong picture: a finger stretched almost straight, reaching
           across the neck and hovering in mid-air well past the treble edge.

           The fix is to stop inventing a direction and give the finger the
           same kind of target a pressing finger gets — a point on the board
           at its own position, arrived at down the board's normal — and then
           simply hold it off the wood. Everything downstream is unchanged,
           so a waiting finger curls exactly like a pressing one and merely
           stops short, which is what waiting looks like. */
        const HOVER = 19;
        const n = F.boardNormal(0, s);
        aim = {
          x: Math.max(F.pressX(1, s), knuckle.x),
          y: n.y * (s.fretHeight + HOVER),
          z: F.boardZ(0, s) + n.z * (s.fretHeight + HOVER)
        };
        approach = { x: 0, y: n.y, z: n.z };
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

      const ik = solveFinger(F, s, knuckle, distalStart, f.bones[0], f.bones[1], row);
      push(knuckle, ik.joint, f.radius * 0.55);
      push(ik.joint, distalStart, f.radius * 0.47);
      push(distalStart, tip, f.radius * 0.40);

      /* A barre is the exception again: it is not one tip on one string but
         the whole underside of the finger lying on all six, so the flat runs
         the length of the bone rather than gathering at the end. */
      if (t && targets && targets.barre && i === 0) {
        const n = targets.barre.line[0].normal || { x: 0, y: 0, z: 1 };
        press.push({ dir: v.mul(v.norm(n), -1), from: 0.35, amount: 0.34 });
      } else if (t) {
        const n = t.normal || { x: 0, y: 0, z: 1 };
        press.push({ dir: v.mul(v.norm(n), -1), from: 0.80, amount: 0.30 });
      } else {
        press.push(null);
      }
    });

    // The thumb, behind the neck, opposite the hand.
    const th = targets ? targets.thumb : { x: F.pressX(2, s), y: 0, z: -F.neckDepth(F.pressX(2, s), s) };
    const thumbBase = { x: palm.x - 10, y: palm.y + 6, z: palm.z + 2 };
    const tTip = { x: th.x, y: th.y + 2, z: th.z + 3 };
    const tIk = twoBone(thumbBase, tTip, THUMB.bones[0], THUMB.bones[1], { x: -0.4, y: -0.2, z: -1 });
    push(thumbBase, tIk.joint, THUMB.radius * 0.6);
    push(tIk.joint, tTip, THUMB.radius * 0.5);

    return { palm, bones, contacts, press };
  }

  /* ---------- building the hand as a surface ----------

     The first version drew a bone as a cylinder with a ball at the joint.
     It got the geometry right and looked like plumbing: every joint showed
     a seam where two primitives met, and a palm was a box.

     A finger is one continuous surface. So it is built as one — a tube swept
     along a smooth line through the four joint positions, its radius tapering
     from knuckle to tip. The joints stop being places where two objects
     overlap and become places where the surface bends, which is what a joint
     is.
     ============================================================ */

  /** A smooth line through the joints, so a finger bends instead of kinking. */
  function smoothChain(pts, per) {
    const out = [];
    const at = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      const steps = (i === pts.length - 2) ? per : per - 1;
      for (let k = 0; k <= steps; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t;
        // Catmull-Rom: passes through every joint, curves smoothly between
        out.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
          z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
        });
      }
    }
    return out;
  }

  /**
   * Sweeps a round tube along a line, appending to a mesh under construction.
   *
   * The ring is carried along the curve rather than rebuilt at each step:
   * building it fresh from a fixed up-vector makes the tube spin about its
   * own axis wherever the curve turns, and on a finger that reads as the
   * skin sliding around the bone.
   */
  function sweep(m, line, radiusAt, sides, capEnd, flat, capStart) {
    const v = V();
    if (line.length < 2) return;
    const base = m.P.length / 3;
    let nrm = null;
    for (let i = 0; i < line.length; i++) {
      const prev = line[Math.max(0, i - 1)], next = line[Math.min(line.length - 1, i + 1)];
      const tan = v.norm(v.sub(next, prev));
      if (!nrm) {
        const ref = Math.abs(tan.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
        nrm = v.norm(v.cross(tan, ref));
      } else {
        // carry the previous ring forward, squared up to the new tangent
        nrm = v.norm(v.sub(nrm, v.mul(tan, v.dot(nrm, tan))));
      }
      const bi = v.cross(tan, nrm);
      const t = i / (line.length - 1);
      const r0 = radiusAt(t);
      /* How much of the flat has come in by this point along the tube. It
         builds in over the last stretch rather than appearing at the tip,
         because flesh under pressure spreads back from where it is pressed. */
      const along = flat ? Math.max(0, (t - flat.from) / (1 - flat.from)) : 0;
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const dir = v.add(v.mul(nrm, Math.cos(a)), v.mul(bi, Math.sin(a)));
        let r = r0, n = dir;
        if (along > 0) {
          // ...and only on the side actually against the string.
          const face = Math.max(0, v.dot(dir, flat.dir));
          const k2 = flat.amount * along * along * face * face;
          if (k2 > 0) {
            r = r0 * (1 - k2);
            // The surface is flatter there, so the normal has to lean that
            // way too: a flat spot lit as though it were still round reads
            // as a dent, which is worse than leaving the tip round.
            n = v.norm(v.sub(dir, v.mul(flat.dir, k2 * 1.6)));
          }
        }
        m.P.push(line[i].x + dir.x * r, line[i].y + dir.y * r, line[i].z + dir.z * r);
        m.N.push(n.x, n.y, n.z);
      }
    }
    for (let i = 0; i < line.length - 1; i++) {
      for (let k = 0; k < sides; k++) {
        const k2 = (k + 1) % sides;
        const a = base + i * sides, b = a + sides;
        m.I.push(a + k, b + k, b + k2, a + k, b + k2, a + k2);
      }
    }
    if (capEnd) {
      // A fingertip is round, not a hole.
      const end = line[line.length - 1];
      const prev = line[line.length - 2];
      const tan = v.norm(v.sub(end, prev));
      const r = radiusAt(1) * (flat ? 1 - flat.amount * 0.5 : 1);
      const c = m.P.length / 3;
      m.P.push(end.x + tan.x * r * 0.9, end.y + tan.y * r * 0.9, end.z + tan.z * r * 0.9);
      m.N.push(tan.x, tan.y, tan.z);
      const ring = base + (line.length - 1) * sides;
      for (let k = 0; k < sides; k++) m.I.push(c, ring + k, ring + ((k + 1) % sides));
    }
    if (capStart) {
      /* ...and neither end of a finger is a hole. The far end was capped
         from the start and the near end was left open on the assumption the
         palm would cover it. It does not: close up, every finger ended in a
         flat open ellipse where it met the hand, which is the single thing
         that most gave away that this was tubing rather than a hand. */
      const first = line[0], next = line[1];
      const tan = v.norm(v.sub(first, next));
      const r = radiusAt(0);
      const c = m.P.length / 3;
      m.P.push(first.x + tan.x * r * 0.6, first.y + tan.y * r * 0.6, first.z + tan.z * r * 0.6);
      m.N.push(tan.x, tan.y, tan.z);
      for (let k = 0; k < sides; k++) m.I.push(c, base + ((k + 1) % sides), base + k);
    }
  }

  /**
   * The hand's own axes, derived once from the pose.
   *
   * The palm, the nails and the forearm all need to agree on which way is
   * "back of the hand" and which way is "toward the wrist". Computing that
   * separately in three places is how a nail ends up on a fingertip's pad.
   */
  function handFrame(pose, knuckles) {
    const v = V();
    const kc = knuckles.reduce((a, k) => v.add(a, k), { x: 0, y: 0, z: 0 });
    const centre = v.mul(kc, 1 / knuckles.length);
    const U = v.norm(v.sub(centre, pose.palm));           // wrist toward knuckles
    const V2 = v.norm(v.sub(knuckles[3], knuckles[0]));   // index toward pinky
    const W = v.norm(v.cross(U, V2));                     // through the palm
    // The padded side of the palm is -W, so +W is the back of the hand —
    // which is the side a fingernail is on.
    return { centre, U, V2, W, wrist: v.sub(centre, v.mul(U, PALM_LEN)) };
  }

  /**
   * The palm.
   *
   * Swept the same way as a finger, from the wrist to the knuckle row, with
   * an elliptical section that widens toward the knuckles — a hand is much
   * wider than it is thick, which is the single thing a box got most wrong.
   * The thumb side carries an extra lobe for the muscle at the base of the
   * thumb, which is what gives a palm its shape from every angle a box looks
   * flat from.
   */
  function palmMesh(m, pose, frame, sides) {
    const v = V();
    const { U, V2, W, wrist } = frame;
    const LEN = PALM_LEN;

    /* The palm as one parametric surface: t runs wrist to knuckles, a runs
       round the section. Writing it as a function rather than inline is what
       makes the normals below possible, and the normals are the point — the
       thenar and the four knuckles were being added to the POSITION only,
       with the normal still taken from the bare ellipse. So the bumps changed
       the silhouette and nothing else: they were invisible anywhere the
       outline did not happen to cross them, which is most of the hand. */
    function point(t, a) {
      const p = v.add(wrist, v.mul(U, LEN * t));
      // Narrow at the wrist and widest across the knuckles — a hand is a
      // wedge, not a slab, and the taper is most of what says so.
      const halfW = 18 + 17 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5);
      const halfT = 14.5 - 4.0 * t;
      // the thenar: a lobe on the thumb side, low on the palm
      const thenar = Math.max(0, Math.cos(a)) * Math.max(0, 1 - Math.abs(t - 0.3) * 2.6) * 7;
      /* Four knuckles at the finger end. Without them the palm finishes in
         a flat cap and the fingers appear to sprout out of a plate; with
         them the hand ends the way a hand does, and each finger grows from
         a knuckle of its own. */
      const across = -Math.cos(a);
      const atEnd = Math.max(0, (t - 0.62) / 0.38);
      const knuckle = atEnd * atEnd * 3.4 * Math.max(0, Math.cos(across * Math.PI * 4));
      // The palm side is padded; the back of the hand is not.
      const pad = Math.max(0, -Math.sin(a)) * 2.2;
      const wy = (halfW + thenar) * Math.cos(a);
      const wz = (halfT + knuckle + pad) * Math.sin(a);
      return v.add(p, v.add(v.mul(V2, -wy), v.mul(W, wz)));
    }

    const rows = 16;
    const base = m.P.length / 3;
    const dt = 0.5 / rows, da = Math.PI / sides;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const q = point(t, a);
        // The true surface normal, by central difference on the surface
        // itself, so every bump the shape has is a bump the light finds.
        const dU = v.sub(point(Math.min(1, t + dt), a), point(Math.max(0, t - dt), a));
        const dA = v.sub(point(t, a + da), point(t, a - da));
        // dU × dA, in that order: at a=0 it gives -V2, which is the way out
        // of the thumb side — the same direction the old ellipse normal had.
        let n = v.cross(dU, dA);
        if (v.len(n) < 1e-6) n = v.add(v.mul(V2, -Math.cos(a)), v.mul(W, Math.sin(a)));
        n = v.norm(n);
        m.P.push(q.x, q.y, q.z);
        m.N.push(n.x, n.y, n.z);
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let k = 0; k < sides; k++) {
        const k2 = (k + 1) % sides;
        const a = base + i * sides, b = a + sides;
        m.I.push(a + k, b + k, b + k2, a + k, b + k2, a + k2);
      }
    }
    // close both ends so the palm is a solid, not a sleeve
    for (const [row, flip] of [[0, true], [rows, false]]) {
      const ring = base + row * sides;
      const p = v.add(wrist, v.mul(U, LEN * (row / rows)));
      const c = m.P.length / 3;
      const n = flip ? v.mul(U, -1) : U;
      m.P.push(p.x, p.y, p.z);
      m.N.push(n.x, n.y, n.z);
      for (let k = 0; k < sides; k++) {
        const k2 = (k + 1) % sides;
        if (flip) m.I.push(c, ring + k, ring + k2);
        else m.I.push(c, ring + k2, ring + k);
      }
    }
  }

  /**
   * The wrist and a length of forearm.
   *
   * A hand that stops at the wrist reads as a prop on a shelf, not as part of
   * anyone. It costs one swept tube to fix, and the forearm runs out of the
   * bottom of the frame rather than ending anywhere, so nothing has to be
   * decided about an elbow that is never in shot.
   */
  function armMesh(m, frame, sides) {
    const v = V();
    const { U, V2, W, wrist } = frame;
    const LEN = 105;
    const rows = 10, base = m.P.length / 3;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const p = v.sub(wrist, v.mul(U, LEN * t));
      /* Narrowest at the wrist and swelling back into the forearm, which is
         the shape that says "wrist" without a joint being drawn. A forearm of
         constant width just looks like a length of pipe.

         It starts on exactly the palm's own wrist section. Starting a
         millimetre or two narrower is anatomically truer and looks worse:
         the palm's flat end cap then stands proud all the way round, and
         the join reads as a ledge rather than a wrist. */
      const halfW = 18 + 5 * t;
      const halfT = 14.5 + 3 * t;
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const q = v.add(p, v.add(v.mul(V2, -halfW * Math.cos(a)), v.mul(W, halfT * Math.sin(a))));
        const n = v.norm(v.add(v.mul(V2, -Math.cos(a) * halfT), v.mul(W, Math.sin(a) * halfW)));
        m.P.push(q.x, q.y, q.z);
        m.N.push(n.x, n.y, n.z);
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let k = 0; k < sides; k++) {
        const k2 = (k + 1) % sides;
        const a = base + i * sides, b = a + sides;
        m.I.push(a + k, b + k2, b + k, a + k, a + k2, b + k2);
      }
    }
    /* Capped at both ends. The far end is capped in case the framing ever
       puts it on screen; the wrist end is capped because "the palm covers
       it" is an assumption about a camera angle, not a property of the
       shape — and the shape is what has to hold up when the view turns. */
    for (const [row, out] of [[0, false], [rows, true]]) {
      const ring = base + row * sides;
      const p = v.sub(wrist, v.mul(U, LEN * (row / rows)));
      const c = m.P.length / 3;
      const n = out ? v.mul(U, -1) : U;
      m.P.push(p.x, p.y, p.z);
      m.N.push(n.x, n.y, n.z);
      for (let k = 0; k < sides; k++) {
        const k2 = (k + 1) % sides;
        if (out) m.I.push(c, ring + k2, ring + k);
        else m.I.push(c, ring + k, ring + k2);
      }
    }
  }

  /** The whole hand as one surface: forearm, palm, four fingers, thumb. */
  function handMesh(pose) {
    const v = V();
    const m = { P: [], N: [], I: [] };
    const sides = 10;
    const knuckles = [0, 1, 2, 3].map(i => pose.bones[i * 3].a);
    const frame = handFrame(pose, knuckles);
    armMesh(m, frame, 14);
    palmMesh(m, pose, frame, 14);
    FINGERS.forEach((f, i) => {
      const b0 = pose.bones[i * 3], b1 = pose.bones[i * 3 + 1], b2 = pose.bones[i * 3 + 2];
      /* Each finger starts a centimetre behind its own knuckle, inside the
         palm, so the two solids overlap instead of meeting at a seam. A
         finger growing out of a hand has no visible join, and the cheapest
         way to have no visible join is to put it where it cannot be seen. */
      const root = v.add(b0.a, v.mul(v.norm(v.sub(b0.a, b0.b)), 11));
      const line = smoothChain([root, b0.a, b0.b, b1.b, b2.b], 5);
      // A finger is thickest at the knuckle and narrows to the tip, with the
      // joints a touch wider than the shafts between them.
      sweep(m, line, (t) => f.radius * (0.60 - 0.20 * t) + Math.sin(t * Math.PI * 3) * f.radius * 0.035,
        sides, true, pose.press && pose.press[i], true);
    });
    const t0 = pose.bones[12], t1 = pose.bones[13];
    const tRoot = v.add(t0.a, v.mul(v.norm(v.sub(t0.a, t0.b)), 10));
    sweep(m, smoothChain([tRoot, t0.a, t0.b, t1.b], 5),
      (t) => THUMB.radius * (0.62 - 0.16 * t), sides, true, null, true);
    return m;
  }

  /**
   * The fingernails, as their own surface because they are their own material.
   *
   * This is the smallest piece of geometry in the scene and close to the most
   * valuable: a fingertip with a nail on it is read as a finger instantly,
   * and the same tube without one stays a tube. Each nail is a patch curved
   * onto the back of the distal bone — the side away from the palm, taken
   * from the hand's own frame rather than guessed from the bone direction,
   * because a bone pointing anywhere still has a definite back.
   */
  function nailMesh(pose) {
    const v = V();
    const m = { P: [], N: [], I: [] };
    const knuckles = [0, 1, 2, 3].map(i => pose.bones[i * 3].a);
    const frame = handFrame(pose, knuckles);
    const cols = 7, rows = 5;

    FINGERS.forEach((f, i) => {
      const b = pose.bones[i * 3 + 2];
      const axis = v.sub(b.b, b.a);
      const L = v.len(axis);
      if (L < 1) return;
      const u = v.mul(axis, 1 / L);
      // The back of the hand, made perpendicular to this particular bone.
      let up = v.sub(frame.W, v.mul(u, v.dot(frame.W, u)));
      if (v.len(up) < 1e-3) return;
      up = v.norm(up);
      const side = v.cross(u, up);
      const r = f.radius * 0.42;

      const base = m.P.length / 3;
      for (let a = 0; a <= rows; a++) {
        // From behind the joint to just short of the tip.
        const t = 0.34 + (0.94 - 0.34) * (a / rows);
        // Rounded at both ends, so it is a nail and not a postage stamp.
        const taper = Math.sin(Math.min(1, (a / rows) * 1.25 + 0.18) * Math.PI * 0.86);
        const p = v.add(b.a, v.mul(u, L * t));
        for (let c = 0; c <= cols; c++) {
          // Wrapped around the finger through a limited arc, so the nail
          // follows the tip's curve instead of floating flat above it.
          const th = (-0.62 + 1.24 * (c / cols)) * taper;
          const dir = v.add(v.mul(up, Math.cos(th)), v.mul(side, Math.sin(th)));
          const q = v.add(p, v.mul(dir, r + 0.45));
          m.P.push(q.x, q.y, q.z);
          m.N.push(dir.x, dir.y, dir.z);
        }
      }
      for (let a = 0; a < rows; a++) {
        for (let c = 0; c < cols; c++) {
          const p = base + a * (cols + 1) + c, q = p + cols + 1;
          m.I.push(p, q, q + 1, p, q + 1, p + 1);
        }
      }
    });
    return m;
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
      trim: r.mesh(...flat(trimMesh(F, upto))),
      frets: r.mesh(...flat(fretsMesh(F, upto))),
      strings: r.mesh(...flat(stringsMesh(F, upto))),
      ball: r.mesh(...flat(global.Gl.sphere(9))),
      hand: r.dynamicMesh(),
      nails: r.dynamicMesh()
    };
    // The hand surface is rebuilt only when the pose actually changes, which
    // between chords is not at all.
    let handKey = null;
    function flat(m) { return [m.positions, m.normals, m.indices]; }

    /* Base colours, not final ones: the shader adds ambient, two lights and
       a rim on top, so anything mixed to look right on paper comes out of
       the renderer blown white. Skin especially — the wrap term deliberately
       carries light round past the terminator, so a skin tone chosen before
       the wrap existed lit up to a flat, papery cream over most of the hand.
       These are picked against the render, which is the only place they
       are ever seen. */
    const COLOR = {
      board: [0.21, 0.14, 0.12],
      back: [0.34, 0.22, 0.14],
      fret: [0.80, 0.80, 0.84],
      string: [0.86, 0.84, 0.76],
      bone: [0.74, 0.71, 0.62],
      skin: [0.70, 0.50, 0.39],
      nail: [0.76, 0.61, 0.55],
      mark: [0.00, 0.90, 0.82]
    };

    /* How far light travels inside skin before it comes back out. This is the
       one number that separates a hand from a painted dowel, and it is worth
       more than every millimetre of geometry above it. */
    const SKIN_WRAP = 0.55;

    // The camera looks down the neck from the player's side, which is the
    // angle that shows both what the fingers are on and how they are arched.
    let orbit = o.orbit == null ? -0.55 : o.orbit;
    let tilt = o.tilt == null ? 0.62 : o.tilt;
    let lastPose = null;

    function camera(w, h) {
      /* On a phone the canvas is a third the width it is on a laptop, and the
         desktop framing carried over unchanged puts the fingertips at about
         five millimetres of actual glass — too small to read, which defeats
         the entire point of the view. So a narrow canvas is framed tighter,
         on the playing zone rather than the whole neck: the neck runs out of
         shot, and the hand is the size it needs to be to be understood. */
      const tight = w < 520;
      const mid = F.pressX(tight ? 2 : 3, s);
      // Framed to hold the neck and the hand below it, not the hand alone.
      const at = { x: mid, y: -24, z: tight ? -14 : -18 };
      const dist = tight ? 300 : 420;
      const eye = {
        x: at.x + Math.sin(orbit) * Math.cos(tilt) * dist - 40,
        y: at.y - Math.cos(orbit) * Math.cos(tilt) * dist,
        z: at.z + Math.sin(tilt) * dist
      };
      return { eye, at, up: { x: 0, y: 0, z: 1 }, fov: 36 };
    }

    const M4 = r.M4;

    function render(w, h, pose, showTargets) {
      r.frame(w, h, camera(w, h));
      const I = M4.identity();
      r.draw(meshes.board, I, COLOR.board, 0.05);
      r.draw(meshes.back, I, COLOR.back, 0.06);
      r.draw(meshes.trim, I, COLOR.bone, 0.30);
      r.draw(meshes.frets, I, COLOR.fret, 0.85);
      r.draw(meshes.strings, I, COLOR.string, 0.70);

      if (pose) {
        // One surface for the whole hand, re-swept only when it has moved.
        const key = pose.bones.map(b =>
          `${b.b.x.toFixed(1)},${b.b.y.toFixed(1)},${b.b.z.toFixed(1)}`).join('|');
        if (key !== handKey) {
          const hm = handMesh(pose);
          r.upload(meshes.hand, hm.P, hm.N, hm.I);
          const nm = nailMesh(pose);
          r.upload(meshes.nails, nm.P, nm.N, nm.I);
          handKey = key;
        }
        r.draw(meshes.hand, I, COLOR.skin, 0.09, SKIN_WRAP);
        // Nail is harder and shinier than skin, and scatters far less.
        r.draw(meshes.nails, I, COLOR.nail, 0.42, 0.18);

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
                    blendTargets, handMesh, nailMesh, handFrame, smoothChain,
                    FINGERS, THUMB, BOARD_THICK, boardHalf, MARKERS, DOUBLE,
                    boardMesh, backMesh, fretsMesh, stringsMesh, trimMesh };
})(window);
