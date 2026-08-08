/* ============================================================
   tape.js — the song as a strip of time

   Every other stage mode answers "what is my hand doing now". None of them
   answers "what is coming, and when" — and that is the question a player
   actually has while the music is running. A chord you learn about at the
   moment it arrives is a chord you have already missed.

   So this lays the song out along time and moves it past a fixed playhead:
   what has gone, what is sounding, and what is next, with the beat grid
   underneath so the gap to the change is readable in beats rather than
   guessed at. Underneath sits the whole track at once, because knowing you
   are eighty seconds into a four-minute song is a different and also useful
   thing to know.

   The layout is a pure function of (analysis, time) returning fractions of
   the box, and the painting is a separate step that turns those into pixels.
   That split is deliberate: it means where every block sits can be checked
   with arithmetic, on any size of canvas, without rendering anything.
   ============================================================ */
(function (global) {
  'use strict';

  /**
   * How much of the song to show at once.
   *
   * Fixed seconds is the obvious choice and the wrong one: eight seconds is
   * four chords at 60 BPM and one at 160. Counting in bars keeps the picture
   * the same shape whatever the tempo, which is what makes it readable — and
   * the clamp keeps a very slow or very fast song from running off either end.
   */
  function windowSeconds(a, bars) {
    const sig = (a && a.timeSignature) || 4;
    const bpm = (a && a.bpm) || 120;
    const barLen = (60 / bpm) * sig;
    return Math.max(5, Math.min(22, barLen * (bars || 4)));
  }

  /* Where the playhead sits across the box. Not the middle: what is coming
     matters more than what has gone, so the past gets a third and the future
     gets two. */
  const HEAD = 0.32;

  /**
   * What is on screen at this moment, in fractions of the box.
   *
   * Everything returned is 0..1 across the width, so the same numbers drive a
   * phone and a desktop and a test with no canvas at all. `x` may fall
   * outside 0..1 — a chord half off the edge is still drawn, just clipped —
   * and callers should not assume otherwise.
   */
  function layout(a, time, opts) {
    const o = opts || {};
    const span = windowSeconds(a, o.bars);
    /* A player that has not started yet reports no position at all, and on a
       slow connection that is the state the stage opens in. Left alone, the
       arithmetic below turns that into NaN, every chord fails the window
       test, and the mode's first impression is an empty box — for a reason
       that has nothing to do with the song. The start of the track is the
       honest answer to "where are we" before playback begins. */
    const at = Number.isFinite(time) ? time : 0;
    const t0 = at - span * HEAD;                // time at the left edge
    const toX = t => (t - t0) / span;
    time = at;

    const chords = [];
    for (const c of (a && a.chords) || []) {
      if (c.end <= t0 || c.start >= t0 + span) continue;
      chords.push({
        chord: c.chord,
        start: c.start, end: c.end,
        x: toX(c.start), w: (c.end - c.start) / span,
        /* Three states, and the middle one is the point of the whole view.
           `done` is behind the playhead, `now` is under it, `next` is ahead. */
        state: c.end <= time ? 'done' : (c.start <= time ? 'now' : 'next'),
        // How far through the current chord we are, for the fill that shows it.
        through: c.start <= time && time < c.end
          ? Math.max(0, Math.min(1, (time - c.start) / (c.end - c.start))) : 0
      });
    }

    const sig = (a && a.timeSignature) || 4;
    const beats = [];
    for (const t of (a && a.beatTimes) || []) {
      if (t < t0 || t > t0 + span) continue;
      const i = Math.round((t - (a.firstBeat || 0)) / (60 / (a.bpm || 120)));
      beats.push({ t, x: toX(t), down: ((i % sig) + sig) % sig === 0,
                   bar: Math.floor(i / sig) + 1 });
    }

    // What is sounding, and what replaces it — the two facts a player needs.
    const now = chords.find(c => c.state === 'now') || null;
    const next = chords.filter(c => c.state === 'next').sort((p, q) => p.start - q.start)[0] || null;

    return {
      span, head: HEAD, t0, at,
      chords, beats, now, next,
      // Seconds until the chord changes. Null when nothing is sounding — a
      // gap in the chart is silence, and silence has no countdown.
      untilChange: now ? +(now.end - time).toFixed(3) : null,
      progress: a && a.duration ? Math.max(0, Math.min(1, time / a.duration)) : 0
    };
  }

  /**
   * The song as a page of chords, in reading order.
   *
   * The strip answers "what is next in the next few seconds". This answers
   * "what am I playing through this section", which is the question you have
   * when the music is in front of you and your hands are busy: a screenful of
   * chords, left to right and top to bottom, the way every chord sheet ever
   * printed is laid out.
   *
   * Paging rather than sliding is deliberate. A sheet that crept upward
   * continuously would be unreadable for the same reason a book does not
   * scroll while you read it — the eye needs the text to hold still. So the
   * page holds still until the music leaves it, and then it turns.
   */
  function sheet(a, time, opts) {
    const o = opts || {};
    const all = (a && a.chords) || [];
    const cols = Math.max(1, o.cols || 4);
    const rows = Math.max(1, o.rows || 4);
    const perPage = cols * rows;
    const at = Number.isFinite(time) ? time : 0;

    let index = -1;
    for (let i = 0; i < all.length; i++) {
      if (at >= all[i].start && at < all[i].end) { index = i; break; }
    }
    /* Between chords — a silent stretch, or the count-in before the first —
       the page still has to be somewhere, so it follows whatever is coming
       next. Without this the sheet snaps back to page one every time the
       chart has a hole in it. */
    let anchor = index;
    if (anchor < 0) {
      anchor = all.findIndex(c => c.start > at);
      if (anchor < 0) anchor = Math.max(0, all.length - 1);
    }

    const page = all.length ? Math.floor(anchor / perPage) : 0;
    const pages = Math.max(1, Math.ceil(all.length / perPage));
    const cells = [];
    for (let i = 0; i < all.length; i++) {
      const c = all[i];
      cells.push({
        i, chord: c.chord, start: c.start, end: c.end,
        row: Math.floor(i / cols), col: i % cols,
        page: Math.floor(i / perPage),
        state: c.end <= at ? 'done' : (c.start <= at ? 'now' : 'next'),
        through: c.start <= at && at < c.end
          ? Math.max(0, Math.min(1, (at - c.start) / (c.end - c.start))) : 0,
        /* Seconds left on this chord, for the cell that is sounding.
           The fill already says roughly how far through it you are; the
           number says exactly how long you have, which is what you need when
           the change is a bar-and-a-half of barre chord away and you have to
           decide whether to start moving now. Null on every other cell —
           a chord that is not playing has no time left on it. */
        remaining: c.start <= at && at < c.end ? +(c.end - at).toFixed(2) : null,
        length: +(c.end - c.start).toFixed(3)
      });
    }
    return { at, cols, rows, perPage, page, pages, index, anchor, cells,
             // The row the page starts on — what the view scrolls to.
             topRow: page * rows,
             totalRows: Math.max(1, Math.ceil(all.length / cols)) };
  }

  /* How far the sheet has actually scrolled, eased toward the page it should
     be on. Kept per canvas so two strips on one document cannot fight over
     it, and outside the layout because easing is a property of the animation
     rather than of the song. */
  const scrollAt = new WeakMap();

  /* ---------- painting ---------- */

  /* Read the palette out of the document rather than restating it here, so
     the strip cannot drift away from the rest of the app when a colour
     changes. Cached, because this runs every frame. */
  let palette = null, paletteFor = null;
  function colours(el) {
    if (palette && paletteFor === el) return palette;
    const s = getComputedStyle(el);
    const v = (n, f) => (s.getPropertyValue(n) || '').trim() || f;
    palette = {
      accent: v('--accent', '#00e5d0'),
      accent2: v('--accent-2', '#35a0ff'),
      text: v('--text', '#fff'),
      text2: v('--text-2', 'rgba(255,255,255,.66)'),
      text3: v('--text-3', 'rgba(255,255,255,.38)'),
      panel: v('--panel-2', '#16161b'),
      line: v('--line', 'rgba(255,255,255,.09)'),
      warn: v('--warn', '#ffb020')
    };
    paletteFor = el;
    return palette;
  }
  function forgetColours() { palette = null; paletteFor = null; }

  function roundRect(g, x, y, w, h, r) {
    const k = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + k, y);
    g.arcTo(x + w, y, x + w, y + h, k);
    g.arcTo(x + w, y + h, x, y + h, k);
    g.arcTo(x, y + h, x, y, k);
    g.arcTo(x, y, x + w, y, k);
    g.closePath();
  }

  const mmss = (t) => {
    const s = Math.max(0, Math.floor(t));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  /**
   * The chord's own diagram, painted into a box on the canvas.
   *
   * The geometry comes from Performer.diagramGeometry — the same numbers the
   * chart's SVG is built from — so this is the same diagram the rest of the
   * app shows, not a second one drawn to look similar. Only the ink is new.
   *
   * Returns false when there is nothing to draw, so the caller can put the
   * chord name where the diagram would have gone.
   */
  function drawDiagram(g, name, x, y, w, h, opts) {
    const P = global.Performer;
    if (!P || !P.diagramGeometry) return false;
    let d = null;
    try { d = P.diagramGeometry(name, 150); } catch (e) { return false; }
    if (!d) return false;

    /* Fit the diagram's own coordinate space into the box it has been given,
       keeping its proportions — a squashed fretboard is a lying fretboard.
       The name is dropped: the block already has it, much larger. */
    const useH = d.H - (d.H - d.labelY) - 2;
    const k = Math.min(w / d.W, h / useH);
    if (!(k > 0)) return false;
    const ox = x + (w - d.W * k) / 2;
    const oy = y + (h - useH * k) / 2;
    const X = v => ox + v * k, Y = v => oy + v * k;

    g.save();
    g.lineWidth = Math.max(0.7, 1.2 * k);
    g.strokeStyle = 'rgba(255,255,255,.24)';
    g.beginPath();
    for (const l of d.fretLines) { g.moveTo(X(l.x), Y(l.y1)); g.lineTo(X(l.x), Y(l.y2)); }
    for (const l of d.stringLines) { g.moveTo(X(l.x1), Y(l.y)); g.lineTo(X(l.x2), Y(l.y)); }
    g.stroke();

    if (d.nut) {
      g.fillStyle = '#e8e8ee';
      roundRect(g, X(d.nut.x), Y(d.nut.y), Math.max(1.5, d.nut.w * k), d.nut.h * k, 2 * k);
      g.fill();
    } else if (d.position) {
      g.fillStyle = 'rgba(255,255,255,.6)';
      g.font = `700 ${Math.max(8, Math.round(11 * k))}px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText(d.position.text, X(d.position.x), Y(d.position.y));
    }

    const accent = (opts && opts.accent) || '#00e5d0';
    if (d.barre) {
      g.fillStyle = accent;
      g.globalAlpha = 0.92;
      roundRect(g, X(d.barre.x), Y(d.barre.y), d.barre.w * k, d.barre.h * k, d.barre.r * k);
      g.fill();
      g.globalAlpha = 1;
    }

    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const m of d.marks) {
      if (m.kind === 'muted') {
        g.fillStyle = 'rgba(255,255,255,.5)';
        g.font = `700 ${Math.max(7, Math.round(12 * k))}px system-ui, sans-serif`;
        g.fillText('✕', X(m.x), Y(m.y));
      } else {
        g.strokeStyle = 'rgba(255,255,255,.85)';
        g.lineWidth = Math.max(0.8, 1.8 * k);
        g.beginPath();
        g.arc(X(m.x), Y(m.y), Math.max(2, 5 * k), 0, Math.PI * 2);
        g.stroke();
      }
    }

    for (const dot of d.dots) {
      if (!dot.underBarre) {
        g.fillStyle = accent;
        g.beginPath();
        g.arc(X(dot.x), Y(dot.y), Math.max(1.5, dot.r * k), 0, Math.PI * 2);
        g.fill();
      }
      // The finger number only when there is room for it to be read.
      if (dot.finger > 0 && dot.r * k >= 5) {
        g.fillStyle = '#00201d';
        g.font = `800 ${Math.max(7, Math.round(11 * k))}px system-ui, sans-serif`;
        g.fillText(String(dot.finger), X(dot.x), Y(dot.y));
      }
    }
    g.restore();
    return true;
  }

  /**
   * Paints one frame onto a canvas, sizing it for the device first.
   * Returns the layout it drew, so a caller can act on the same numbers
   * rather than recomputing them.
   */
  function draw(cv, a, time, opts) {
    const o = opts || {};
    const host = cv.parentElement.getBoundingClientRect();
    const W = Math.max(1, host.width), H = Math.max(1, host.height);
    const dpr = global.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
    }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    const C = colours(cv);
    /* Two bars on a narrow screen instead of four. The strip is the one view
       whose whole job is legibility, and four bars of chord names across a
       phone comes out as four columns of nothing. */
    const L = layout(a, time, { bars: o.bars || (W < 520 ? 2.5 : 4) });
    // Everything below reads the position off the layout, which has already
    // resolved it — so the clock cannot print NaN while the strip draws fine.
    time = L.at;
    if (!a || !a.chords || !a.chords.length) {
      g.fillStyle = C.text3;
      g.font = `500 ${Math.round(Math.min(16, W / 26))}px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('אין אקורדים לשיר הזה עדיין', W / 2, H / 2);
      return L;
    }

    /* How many chords fit across, and how many rows down. Derived from the
       box rather than fixed, so a phone gets two columns of readable cells
       and a full screen gets four or five — the same sheet, not a shrunken
       one. */
    const pad = Math.round(Math.min(20, W * 0.016));
    const overH = Math.round(Math.max(18, Math.min(30, H * 0.06)));
    const cols = W < 480 ? 2 : (W < 900 ? 3 : (W < 1500 ? 4 : 5));
    const gridY = Math.round(pad * 0.6);
    const gridH = H - gridY - overH - Math.round(pad * 1.5);
    const cellW = (W - pad * 2) / cols;
    // Cells a little taller than wide read as cards rather than as a table,
    // and leave room for a name above a diagram.
    const wantH = Math.min(cellW * 1.02, gridH);
    const rows = Math.max(1, Math.round(gridH / wantH));
    const cellH = gridH / rows;

    const S = sheet(a, time, { cols, rows });

    /* The page turn, eased. Snapping straight to the new page loses the
       reader for a moment — they cannot tell whether the sheet moved or the
       music jumped. A short slide says "the page turned" without ambiguity,
       and it costs one lerp. */
    const targetRow = S.topRow;
    let cur = scrollAt.get(cv);
    if (cur == null || Math.abs(cur - targetRow) > rows * 3) cur = targetRow;
    else cur += (targetRow - cur) * 0.18;
    if (Math.abs(cur - targetRow) < 0.004) cur = targetRow;
    scrollAt.set(cv, cur);

    g.save();
    g.beginPath();
    g.rect(0, gridY, W, gridH);
    g.clip();

    const fromRow = Math.floor(cur) - 1, toRow = Math.ceil(cur) + rows;
    for (const c of S.cells) {
      if (c.row < fromRow || c.row > toRow) continue;
      const x = pad + c.col * cellW;
      const y = gridY + (c.row - cur) * cellH;
      if (y > H || y + cellH < gridY) continue;
      const m = Math.max(3, Math.min(8, cellW * 0.035));
      const bx = x + m, by = y + m, bw = cellW - m * 2, bh = cellH - m * 2;

      if (c.state === 'now') {
        roundRect(g, bx, by, bw, bh, 12);
        const grad = g.createLinearGradient(bx, by, bx, by + bh);
        grad.addColorStop(0, C.accent);
        grad.addColorStop(1, C.accent2);
        g.fillStyle = grad; g.globalAlpha = 0.22; g.fill(); g.globalAlpha = 1;
        // ...filling as it plays, so the cell shows how much of it is left.
        g.save(); roundRect(g, bx, by, bw, bh, 12); g.clip();
        g.fillStyle = C.accent; g.globalAlpha = 0.18;
        g.fillRect(bx, by, bw * c.through, bh);
        g.restore(); g.globalAlpha = 1;
        g.strokeStyle = C.accent; g.lineWidth = 2.5; g.stroke();
      } else {
        roundRect(g, bx, by, bw, bh, 11);
        g.fillStyle = C.panel;
        g.globalAlpha = c.state === 'done' ? 0.4 : 1;
        g.fill(); g.globalAlpha = 1;
        g.strokeStyle = C.line; g.lineWidth = 1; g.stroke();
      }

      g.save();
      roundRect(g, bx, by, bw, bh, 12);
      g.clip();

      const big = c.state === 'now';
      const roomy = bw >= 74 && bh >= 96 && c.state !== 'done';
      let fs = Math.round(Math.min(bh * (roomy ? 0.30 : 0.46), bw * 0.42, 62));
      fs = Math.max(12, fs);
      g.font = `${big ? 800 : 600} ${fs}px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = big ? C.text : (c.state === 'done' ? C.text3 : C.text2);

      let nameY = by + bh / 2;
      if (roomy) {
        const dh = Math.min(bh * 0.52, bw * 0.62);
        const dy = by + bh - dh - bh * 0.06;
        g.globalAlpha = big ? 1 : 0.62;
        const drew = drawDiagram(g, c.chord, bx + bw * 0.07, dy, bw * 0.86, dh,
          { accent: C.accent });
        g.globalAlpha = 1;
        if (drew) nameY = by + (dy - by) / 2 + bh * 0.02;
      }
      g.fillText(c.chord, bx + bw / 2, nameY);

      /* The countdown, in the corner of the cell that is playing.
         Drawn last, and deliberately so: it sets its own face and colour, and
         doing that before the name meant the name inherited them — the
         sounding chord came out in the timer's monospace at the timer's size,
         smaller than every chord around it, which is the exact opposite of
         what the highlight is for.

         Monospaced on purpose: a proportional face re-measures itself as the
         digits change and the number twitches sideways ten times a second,
         which is the wrong thing for something you glance at with your hands
         busy. */
      if (c.state === 'now' && c.remaining != null && bw >= 66 && bh >= 56) {
        const ts = Math.max(13, Math.round(Math.min(bh * 0.16, bw * 0.19, 32)));
        g.font = `700 ${ts}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        g.textAlign = 'right'; g.textBaseline = 'top';
        g.direction = 'ltr';                       // a number, not a sentence
        // Under ten seconds it counts in tenths so it visibly moves; above
        // that a whole-second count is all anyone reads at a glance.
        const left = Math.max(0, c.remaining);
        const txt = left < 10 ? left.toFixed(1) : String(Math.ceil(left));
        g.fillStyle = left <= 1 ? C.warn : C.accent;
        g.globalAlpha = left <= 1 ? 1 : 0.9;
        g.fillText(txt, bx + bw - Math.max(8, bw * 0.06), by + Math.max(6, bh * 0.045));
        g.globalAlpha = 1;
        g.direction = 'inherit';
      }
      g.restore();
    }
    g.restore();

    /* ---- the whole song, along the bottom ---- */
    const oy = H - overH - Math.round(pad * 0.4);
    // Which page of how many, so the sheet says where in the song it is.
    if (W > 420 && S.pages > 1) {
      g.fillStyle = C.text3;
      g.font = '600 11px system-ui, sans-serif';
      g.textAlign = 'right'; g.textBaseline = 'bottom';
      /* Forced left-to-right. Canvas text inherits the document's direction,
         and this document is Hebrew — so "1 / 17" came out of the browser as
         "17 / 1", which is not a typo but a page number that lies. Anything
         here that is a number rather than a sentence has to say so. */
      g.direction = 'ltr';
      g.fillText(`${S.page + 1} / ${S.pages}`, W - 12, oy - 5);
      g.direction = 'inherit';
    }

    /* ---- how long until it changes ----
       The single most useful number here, and the reason the ruler is drawn
       at all: a player wants "one beat to go", not a chord appearing.

       It sits in the band above the song strip rather than at the top of the
       box. The top is where the stage's own HUD pills live, and on a phone
       those run the full width — so a label up there was legible on a laptop
       and printed straight through the pills on a handset. */
    if (L.untilChange != null && L.next) {
      const beatLen = 60 / (a.bpm || 120);
      const beatsLeft = L.untilChange / beatLen;
      g.fillStyle = beatsLeft <= 1 ? C.accent : C.text2;
      g.font = `700 ${Math.round(Math.max(11, Math.min(14, W / 32)))}px system-ui, sans-serif`;
      g.textAlign = 'left'; g.textBaseline = 'bottom';
      /* Chord first, then the count. Mixing a Latin chord name into a Hebrew
         sentence puts it wherever bidi decides, so it is kept at one end and
         separated, which reads the same either way round. */
      const n = Math.round(beatsLeft);
      const label = beatsLeft < 1.15
        ? `${L.next.chord} · עכשיו`
        : `${L.next.chord} · עוד ${n} ${n === 1 ? 'ביט' : 'ביטים'}`;
      g.fillText(label, 12, oy - 5);
    }

    const ow = W - 24, ox = 12;
    roundRect(g, ox, oy, ow, overH, 6);
    g.fillStyle = C.panel;
    g.fill();
    const dur = a.duration || (a.chords.length ? a.chords[a.chords.length - 1].end : 1);
    // Every chord in the song as a thin mark, so the shape of the arrangement
    // is visible at a glance — where it repeats, where it thins out.
    for (const c of a.chords) {
      const x1 = ox + (c.start / dur) * ow, x2 = ox + (c.end / dur) * ow;
      g.fillStyle = C.line;
      g.fillRect(x1, oy + overH * 0.30, Math.max(0.6, x2 - x1 - 0.7), overH * 0.40);
    }
    g.fillStyle = C.accent;
    g.globalAlpha = 0.30;
    g.fillRect(ox, oy, ow * L.progress, overH);
    g.globalAlpha = 1;
    const px = ox + ow * L.progress;
    g.strokeStyle = C.accent;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px, oy - 2);
    g.lineTo(px, oy + overH + 2);
    g.stroke();
    if (W > 380) {
      g.fillStyle = C.text3;
      g.font = '500 10px system-ui, sans-serif';
      g.textBaseline = 'middle';
      g.direction = 'ltr';
      g.textAlign = 'left';
      g.fillText(mmss(time), ox + 6, oy + overH / 2);
      g.textAlign = 'right';
      g.fillText(mmss(dur), ox + ow - 6, oy + overH / 2);
      g.direction = 'inherit';
    }

    return L;
  }

  global.Tape = { layout, sheet, draw, drawDiagram, windowSeconds, forgetColours, HEAD };
})(window);
