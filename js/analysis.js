/* ============================================================
   analysis.js — turn a track into a musical timeline
   Two paths, both producing the same shape:
     1) import JSON produced by the skill's Python pipeline
        (analysis.json / chords.json / sync_map.json)
     2) in-app assisted analysis: tap tempo + key + progression
   The timeline is what drives the performer, so it must be
   exact: beat grid, chord segments, sections, sync events.
   ============================================================ */
(function (global) {
  'use strict';
  const MM = global.MM;

  /** Canonical analysis object stored on a track. */
  function emptyAnalysis() {
    return {
      bpm: null, key: { tonic: 'C', mode: 'major' }, mood: '', duration: 0,
      beatTimes: [], downbeats: [], sections: [], chords: [], source: 'none',
      timeSignature: 4, firstBeat: 0
    };
  }

  /** Build an even beat grid from bpm + offset (what the performer rides on). */
  function buildBeatGrid(bpm, duration, firstBeat, sig) {
    const beat = 60 / bpm;
    const beats = [], downs = [];
    let i = 0;
    for (let t = firstBeat; t < duration; t += beat, i++) {
      beats.push(+t.toFixed(3));
      if (i % (sig || 4) === 0) downs.push(+t.toFixed(3));
    }
    return { beats, downs };
  }

  /**
   * Assisted analysis: the user supplies bpm (tap or typed), key, and a chord
   * progression with bars-per-chord. We loop the progression across the whole
   * track on the beat grid. This is deliberately explicit rather than guessed —
   * a wrong chord on screen is worse than no chord.
   */
  function fromProgression(opts) {
    const a = emptyAnalysis();
    a.bpm = +opts.bpm;
    a.key = opts.key || { tonic: 'C', mode: 'major' };
    a.duration = +opts.duration || 0;
    a.firstBeat = +opts.firstBeat || 0;
    a.timeSignature = +opts.timeSignature || 4;
    a.mood = opts.mood || '';
    a.source = 'assisted';

    const grid = buildBeatGrid(a.bpm, a.duration, a.firstBeat, a.timeSignature);
    a.beatTimes = grid.beats;
    a.downbeats = grid.downs;

    const prog = (opts.progression || []).filter(Boolean);
    const barsEach = Math.max(0.25, +opts.barsPerChord || 1);
    const barDur = (240 / a.bpm) * (a.timeSignature / 4);
    const segDur = barDur * barsEach;

    if (prog.length && segDur > 0) {
      let t = a.firstBeat, i = 0;
      while (t < a.duration - 0.05) {
        const end = Math.min(t + segDur, a.duration);
        a.chords.push({ start: +t.toFixed(3), end: +end.toFixed(3), chord: prog[i % prog.length] });
        t = end; i++;
      }
    }

    // Sections: default 8-bar blocks with an energy shape, unless supplied.
    if (opts.sections && opts.sections.length) {
      a.sections = opts.sections;
    } else {
      const secDur = barDur * 8;
      let t = 0, k = 0;
      const cycle = ['low', 'mid', 'high', 'mid'];
      while (t < a.duration - 0.05) {
        const end = Math.min(t + secDur, a.duration);
        a.sections.push({ start: +t.toFixed(2), end: +end.toFixed(2), label: cycle[k % cycle.length] });
        t = end; k++;
      }
    }
    return a;
  }

  /**
   * Import whatever the skill pipeline produced. Accepts a single object or an
   * array of objects (analysis.json + chords.json + sync_map.json pasted
   * together), and merges the fields it recognises.
   */
  function fromSkillJson(input, fallbackDuration) {
    let blobs;
    if (Array.isArray(input)) blobs = input;
    else if (input && typeof input === 'object') blobs = [input];
    else throw new Error('bad json');

    const a = emptyAnalysis();
    a.source = 'skill';
    let gotSomething = false;

    for (const b of blobs) {
      if (!b || typeof b !== 'object') continue;
      if (b.bpm != null) { a.bpm = +b.bpm; gotSomething = true; }
      if (b.key && b.key.tonic) { a.key = { tonic: b.key.tonic, mode: b.key.mode || 'major' }; gotSomething = true; }
      if (b.mood) a.mood = b.mood;
      if (b.duration_sec != null) a.duration = +b.duration_sec;
      if (Array.isArray(b.beat_times) && b.beat_times.length) { a.beatTimes = b.beat_times.map(Number); gotSomething = true; }
      if (Array.isArray(b.downbeats) && b.downbeats.length) a.downbeats = b.downbeats.map(Number);
      if (Array.isArray(b.sections) && b.sections.length) a.sections = b.sections.map(s => ({
        start: +s.start, end: +s.end, label: s.label || 'mid', energy: s.energy
      }));
      // chords.json -> {chords:[{start,end,chord}]}
      if (Array.isArray(b.chords) && b.chords.length && b.chords[0] && b.chords[0].chord) {
        a.chords = b.chords.map(c => ({ start: +c.start, end: +c.end, chord: c.chord }));
        gotSomething = true;
      }
      // sync_map.json -> cut_grid
      if (b.cut_grid) {
        if (!a.downbeats.length && Array.isArray(b.cut_grid.on_downbeats)) a.downbeats = b.cut_grid.on_downbeats.map(Number);
        if (Array.isArray(b.cut_grid.on_drops)) a.drops = b.cut_grid.on_drops.map(Number);
        gotSomething = true;
      }
    }
    if (!gotSomething) throw new Error('no recognisable analysis fields');

    if (!a.duration) {
      a.duration = fallbackDuration ||
        (a.chords.length ? a.chords[a.chords.length - 1].end : (a.beatTimes.slice(-1)[0] || 0));
    }
    // If we got a bpm but no explicit grid, synthesise one so the performer still rides the beat.
    if (!a.beatTimes.length && a.bpm) {
      const g = buildBeatGrid(a.bpm, a.duration, 0, a.timeSignature);
      a.beatTimes = g.beats; a.downbeats = a.downbeats.length ? a.downbeats : g.downs;
    }
    // Derive bpm from the grid if the JSON omitted it.
    if (!a.bpm && a.beatTimes.length > 4) {
      const spans = [];
      for (let i = 1; i < a.beatTimes.length; i++) spans.push(a.beatTimes[i] - a.beatTimes[i - 1]);
      spans.sort((x, y) => x - y);
      const med = spans[Math.floor(spans.length / 2)];
      if (med > 0) a.bpm = +(60 / med).toFixed(1);
    }
    if (a.beatTimes.length) a.firstBeat = a.beatTimes[0];
    if (!a.downbeats.length && a.beatTimes.length) {
      a.downbeats = a.beatTimes.filter((_, i) => i % (a.timeSignature || 4) === 0);
    }
    return a;
  }

  /* ---------- runtime lookups (called every animation frame) ---------- */

  function chordAt(analysis, t) {
    const cs = analysis && analysis.chords;
    if (!cs || !cs.length) return null;
    // linear scan is fine: progressions are short, and it stays correct after seeks
    for (let i = 0; i < cs.length; i++) if (t >= cs[i].start && t < cs[i].end) return cs[i];
    return null;
  }

  function chordIndexAt(analysis, t) {
    const cs = analysis && analysis.chords;
    if (!cs || !cs.length) return -1;
    for (let i = 0; i < cs.length; i++) if (t >= cs[i].start && t < cs[i].end) return i;
    return -1;
  }

  function sectionAt(analysis, t) {
    const ss = analysis && analysis.sections;
    if (!ss || !ss.length) return null;
    for (const s of ss) if (t >= s.start && t < s.end) return s;
    return null;
  }

  /**
   * Beat phase at time t: which beat we're on, whether it's a downbeat, and how
   * far through it we are (0..1). The performer's sway, strum and key-press all
   * ride this, so it must stay stable across seeks.
   */
  function beatPhase(analysis, t) {
    if (!analysis || !analysis.bpm) return { index: 0, phase: 0, isDown: false, sinceBeat: 0 };
    const beat = 60 / analysis.bpm;
    const sig = analysis.timeSignature || 4;
    const rel = t - (analysis.firstBeat || 0);
    const index = Math.floor(rel / beat);
    const phase = ((rel % beat) + beat) % beat / beat;
    return { index, phase, isDown: ((index % sig) + sig) % sig === 0, sinceBeat: phase * beat, beatDur: beat };
  }

  /** Human summary line, the way the skill asks for it. */
  function summaryLine(a) {
    if (!a || !a.bpm) return 'לא נותח';
    const modeHe = a.key.mode === 'minor' ? 'מינור' : 'מז׳ור';
    const tonicHe = MM.PITCHES_HE[a.key.tonic] || a.key.tonic;
    let s = `${Math.round(a.bpm)} BPM · ${tonicHe} ${modeHe}`;
    if (a.chords && a.chords.length) {
      const prog = [];
      for (const c of a.chords) if (!prog.length || prog[prog.length - 1] !== c.chord) prog.push(c.chord);
      s += ` · ${prog.slice(0, 4).join(' → ')}${prog.length > 4 ? '…' : ''}`;
    }
    if (a.mood) s += ` · ${a.mood}`;
    return s;
  }

  /** Unique progression (deduped consecutive), used in UI and prompts. */
  function progressionOf(a) {
    const out = [];
    for (const c of (a && a.chords) || []) if (!out.length || out[out.length - 1] !== c.chord) out.push(c.chord);
    return out;
  }

  /* ---------- tap tempo ---------- */
  function TapTempo() {
    let taps = [];
    return {
      tap() {
        const now = performance.now();
        if (taps.length && now - taps[taps.length - 1] > 2500) taps = [];
        taps.push(now);
        if (taps.length > 8) taps.shift();
        if (taps.length < 2) return null;
        const spans = [];
        for (let i = 1; i < taps.length; i++) spans.push(taps[i] - taps[i - 1]);
        const avg = spans.reduce((a, b) => a + b, 0) / spans.length;
        return +(60000 / avg).toFixed(1);
      },
      reset() { taps = []; },
      get count() { return taps.length; }
    };
  }

  global.Analysis = {
    emptyAnalysis, buildBeatGrid, fromProgression, fromSkillJson,
    chordAt, chordIndexAt, sectionAt, beatPhase, summaryLine, progressionOf, TapTempo
  };
})(window);
