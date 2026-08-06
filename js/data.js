/* ============================================================
   data.js — music theory, chord/fingering library, persistence
   Ported from the music-motion-maestro skill (hand_positions.py)
   and extended with per-finger assignments so the on-screen
   performer can place a real hand, not a vague gesture.
   ============================================================ */
(function (global) {
  'use strict';

  const PITCHES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const PITCHES_HE = { 'C': 'דו', 'C#': 'דו#', 'D': 'רה', 'D#': 'רה#', 'E': 'מי', 'F': 'פה',
    'F#': 'פה#', 'G': 'סול', 'G#': 'סול#', 'A': 'לה', 'A#': 'לה#', 'B': 'סי' };
  // Guitar strings, 6th (low E) -> 1st (high e)
  const STRINGS = ['E', 'A', 'D', 'G', 'B', 'e'];

  /* shape: fret per string, low->high. 'x' = muted, 0 = open.
     fingers: which finger presses it (0 = open/none, 1 index .. 4 pinky) */
  const GUITAR = {
    'C':   { shape: ['x', 3, 2, 0, 1, 0],   fingers: [0, 3, 2, 0, 1, 0] },
    'C#':  { shape: ['x', 4, 6, 6, 6, 4],   fingers: [0, 1, 3, 3, 3, 1] },
    'D':   { shape: ['x', 'x', 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
    'D#':  { shape: ['x', 6, 8, 8, 8, 6],   fingers: [0, 1, 3, 3, 3, 1] },
    'E':   { shape: [0, 2, 2, 1, 0, 0],     fingers: [0, 2, 3, 1, 0, 0] },
    'F':   { shape: [1, 3, 3, 2, 1, 1],     fingers: [1, 3, 4, 2, 1, 1] },
    'F#':  { shape: [2, 4, 4, 3, 2, 2],     fingers: [1, 3, 4, 2, 1, 1] },
    'G':   { shape: [3, 2, 0, 0, 0, 3],     fingers: [3, 2, 0, 0, 0, 4] },
    'G#':  { shape: [4, 6, 6, 5, 4, 4],     fingers: [1, 3, 4, 2, 1, 1] },
    'A':   { shape: ['x', 0, 2, 2, 2, 0],   fingers: [0, 0, 1, 2, 3, 0] },
    'A#':  { shape: ['x', 1, 3, 3, 3, 1],   fingers: [0, 1, 2, 3, 4, 1] },
    'B':   { shape: ['x', 2, 4, 4, 4, 2],   fingers: [0, 1, 2, 3, 4, 1] },
    'Cm':  { shape: ['x', 3, 5, 5, 4, 3],   fingers: [0, 1, 3, 4, 2, 1] },
    'C#m': { shape: ['x', 4, 6, 6, 5, 4],   fingers: [0, 1, 3, 4, 2, 1] },
    'Dm':  { shape: ['x', 'x', 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
    'D#m': { shape: ['x', 6, 8, 8, 7, 6],   fingers: [0, 1, 3, 4, 2, 1] },
    'Em':  { shape: [0, 2, 2, 0, 0, 0],     fingers: [0, 2, 3, 0, 0, 0] },
    'Fm':  { shape: [1, 3, 3, 1, 1, 1],     fingers: [1, 3, 4, 1, 1, 1] },
    'F#m': { shape: [2, 4, 4, 2, 2, 2],     fingers: [1, 3, 4, 1, 1, 1] },
    'Gm':  { shape: [3, 5, 5, 3, 3, 3],     fingers: [1, 3, 4, 1, 1, 1] },
    'G#m': { shape: [4, 6, 6, 4, 4, 4],     fingers: [1, 3, 4, 1, 1, 1] },
    'Am':  { shape: ['x', 0, 2, 2, 1, 0],   fingers: [0, 0, 2, 3, 1, 0] },
    'A#m': { shape: ['x', 1, 3, 3, 2, 1],   fingers: [0, 1, 3, 4, 2, 1] },
    'Bm':  { shape: ['x', 2, 4, 4, 3, 2],   fingers: [0, 1, 3, 4, 2, 1] },
    // common sevenths — used by lessons and richer progressions
    'C7':  { shape: ['x', 3, 2, 3, 1, 0],   fingers: [0, 3, 2, 4, 1, 0] },
    'D7':  { shape: ['x', 'x', 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
    'E7':  { shape: [0, 2, 0, 1, 0, 0],     fingers: [0, 2, 0, 1, 0, 0] },
    'G7':  { shape: [3, 2, 0, 0, 0, 1],     fingers: [3, 2, 0, 0, 0, 1] },
    'A7':  { shape: ['x', 0, 2, 0, 2, 0],   fingers: [0, 0, 2, 0, 3, 0] },
    'B7':  { shape: ['x', 2, 1, 2, 0, 2],   fingers: [0, 2, 1, 3, 0, 4] },
    'Am7': { shape: ['x', 0, 2, 0, 1, 0],   fingers: [0, 0, 2, 0, 1, 0] },
    'Dm7': { shape: ['x', 'x', 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] },
    'Em7': { shape: [0, 2, 0, 0, 0, 0],     fingers: [0, 2, 0, 0, 0, 0] },
    'Cmaj7': { shape: ['x', 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
    'Fmaj7': { shape: ['x', 'x', 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
    'F7':  { shape: [1, 3, 1, 2, 1, 1],     fingers: [1, 3, 1, 2, 1, 1] },
    // suspended chords — the third is replaced by a 2nd or a 4th
    'Asus2': { shape: ['x', 0, 2, 2, 0, 0],   fingers: [0, 0, 1, 2, 0, 0] },
    'Asus4': { shape: ['x', 0, 2, 2, 3, 0],   fingers: [0, 0, 1, 2, 3, 0] },
    'Csus2': { shape: ['x', 3, 0, 0, 3, 3],   fingers: [0, 2, 0, 0, 3, 4] },
    'Csus4': { shape: ['x', 3, 3, 0, 1, 1],   fingers: [0, 3, 4, 0, 1, 1] },
    'Dsus2': { shape: ['x', 'x', 0, 2, 3, 0], fingers: [0, 0, 0, 1, 3, 0] },
    'Dsus4': { shape: ['x', 'x', 0, 2, 3, 3], fingers: [0, 0, 0, 1, 3, 4] },
    'Esus4': { shape: [0, 2, 2, 2, 0, 0],     fingers: [0, 2, 3, 4, 0, 0] },
    'Gsus2': { shape: [3, 0, 0, 0, 3, 3],     fingers: [2, 0, 0, 0, 3, 4] },
    'Gsus4': { shape: [3, 3, 0, 0, 1, 3],     fingers: [2, 3, 0, 0, 1, 4] }
  };

  /** Grouped for the chord library / poster, in teaching order. */
  const CHORD_GROUPS = [
    { id: 'major',   he: 'אקורדים מז׳וריים', en: 'MAJOR CHORDS', chords: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
    { id: 'minor',   he: 'אקורדים מינוריים', en: 'MINOR CHORDS', chords: ['Am', 'Bm', 'Cm', 'Dm', 'Em', 'Fm', 'Gm'] },
    { id: 'seventh', he: 'אקורדי שביעית', en: 'SEVENTH CHORDS',    chords: ['A7', 'B7', 'C7', 'D7', 'E7', 'F7', 'G7'] },
    { id: 'sus',     he: 'אקורדי Sus', en: 'SUS CHORDS',       chords: ['Asus2', 'Asus4', 'Csus2', 'Csus4', 'Dsus2', 'Dsus4', 'Esus4', 'Gsus2', 'Gsus4'] },
    { id: 'sharp',   he: 'דיאזים ובמולים', en: 'SHARPS & FLATS',   chords: ['C#', 'D#', 'F#', 'G#', 'A#', 'C#m', 'D#m', 'F#m', 'G#m', 'A#m'] },
    { id: 'ext',     he: 'מורחבים', en: 'EXTENDED CHORDS',          chords: ['Am7', 'Dm7', 'Em7', 'Cmaj7', 'Fmaj7'] }
  ];

  /* ---------- theory helpers ---------- */
  function parseChord(name) {
    if (!name) return null;
    name = String(name).trim();
    const suffixes = ['maj7', 'm7', 'sus4', 'sus2', 'add9', 'dim', 'aug', '7', '9', '6', 'm'];
    for (const suf of suffixes) {
      if (name.endsWith(suf)) {
        const base = name.slice(0, -suf.length);
        if (PITCHES.includes(base)) {
          const minor = suf === 'm' || suf === 'm7' || suf === 'dim';
          return { root: base, suffix: suf, quality: minor ? 'minor' : 'major' };
        }
      }
    }
    if (PITCHES.includes(name)) return { root: name, suffix: '', quality: 'major' };
    return null;
  }

  /** Guitar fingering + a plain-language placement sentence. */
  function guitarFingering(name) {
    const entry = GUITAR[name];
    if (!entry) return null;
    const shape = entry.shape, fingers = entry.fingers;
    const fretted = shape.filter(f => typeof f === 'number' && f > 0);
    const base = fretted.length ? Math.min(...fretted) : 0;
    const hasOpen = shape.some(f => f === 0);
    // A barre needs 2+ strings at the base fret AND no ringing open strings.
    const barre = base > 0 && !hasOpen && shape.filter(f => f === base).length >= 2;
    const minor = /m$|m7$/.test(name);

    let placement, placementHe;
    if (barre) {
      placement = `left hand barres all strings at fret ${base} with the index finger, ` +
        `the remaining fingers forming the ${minor ? 'minor' : 'major'} shape above it`;
      placementHe = `יד שמאל עושה ברה על כל המיתרים בפרט ${base} עם האצבע המורה, ` +
        `שאר האצבעות בונות את צורת ה${minor ? 'מינור' : 'מז׳ור'} מעליו`;
    } else if (base === 0 || hasOpen) {
      placement = 'left hand in an open position near the nut (frets 0-3), fingers pressing ' +
        'the fretted strings, others ringing open';
      placementHe = 'יד שמאל בפוזיציה פתוחה ליד ה-nut (פרטים 0–3), האצבעות לוחצות על המיתרים ' +
        'הנדרשים והשאר מצלצלים פתוחים';
    } else {
      placement = `left hand around fret ${base}, fingers pressing the chord shape`;
      placementHe = `יד שמאל סביב פרט ${base}, האצבעות לוחצות את צורת האקורד`;
    }
    return { chord: name, shape, fingers, baseFret: base, barre, hasOpen, placement, placementHe };
  }

  /** Piano voicing: root-position triad with right-hand fingering 1-3-5. */
  function pianoVoicing(name, octave) {
    octave = octave || 4;
    const p = parseChord(name);
    if (!p) return null;
    const r = PITCHES.indexOf(p.root);
    let iv = p.quality === 'minor' ? [0, 3, 7] : [0, 4, 7];
    if (p.suffix === '7') iv = [0, 4, 7, 10];
    else if (p.suffix === 'm7') iv = [0, 3, 7, 10];
    else if (p.suffix === 'maj7') iv = [0, 4, 7, 11];
    else if (p.suffix === 'sus4') iv = [0, 5, 7];
    else if (p.suffix === 'sus2') iv = [0, 2, 7];
    else if (p.suffix === 'dim') iv = [0, 3, 6];
    else if (p.suffix === 'aug') iv = [0, 4, 8];
    const fingerSet = iv.length === 4 ? [1, 2, 3, 5] : [1, 3, 5];
    const keys = iv.map((step, i) => {
      const idx = r + step;
      return {
        note: PITCHES[idx % 12],
        octave: octave + Math.floor(idx / 12),
        midi: 12 * (octave + 1) + (idx % 12) + 12 * Math.floor(idx / 12),
        finger: fingerSet[i]
      };
    });
    const bass = { note: p.root, octave: octave - 2, midi: 12 * (octave - 1) + r, finger: 5 };
    const placement = 'right hand in root position: ' +
      keys.map(k => `finger ${k.finger} on ${k.note}${k.octave}`).join(', ');
    const placementHe = 'יד ימין בפוזיציית יסוד: ' +
      keys.map(k => `אצבע ${k.finger} על ${PITCHES_HE[k.note]}${k.octave}`).join(', ') +
      `; יד שמאל על הבס ${PITCHES_HE[bass.note]}${bass.octave}`;
    return { chord: name, quality: p.quality, keys, bass, placement, placementHe };
  }

  /* Prompt-grade fingering instructions.
     A generic "left hand forms the chord" is exactly the sentence image models
     ignore — which is why AI musicians so often have a hand resting on the neck
     in no shape at all. Spelling out finger -> string -> fret gives the model
     something concrete to place. Strings use the standard numbering where
     string 1 is the high E and string 6 is the low E. */
  const GUITAR_FINGER_EN = { 1: 'index finger', 2: 'middle finger', 3: 'ring finger', 4: 'pinky' };
  const PIANO_FINGER_EN = { 1: 'thumb', 2: 'index finger', 3: 'middle finger', 4: 'ring finger', 5: 'pinky' };

  function guitarFingeringSentence(name) {
    const f = guitarFingering(name);
    if (!f) return null;
    const parts = [];
    if (f.barre) parts.push(`index finger laid flat barring the strings at fret ${f.baseFret}`);
    f.shape.forEach((fr, i) => {
      if (typeof fr !== 'number' || fr <= 0) return;
      if (f.barre && fr === f.baseFret) return;      // already covered by the barre
      const fg = f.fingers[i];
      if (fg > 0) parts.push(`${GUITAR_FINGER_EN[fg]} on string ${6 - i} at fret ${fr}`);
    });
    const open = [], muted = [];
    f.shape.forEach((fr, i) => {
      if (fr === 0) open.push(6 - i);
      else if (fr === 'x') muted.push(6 - i);
    });
    let s = parts.join(', ');
    const plural = a => (a.length > 1 ? 's' : '');
    const list = a => (a.length < 2 ? String(a[0]) : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
    if (open.length) s += `; string${plural(open)} ${list(open)} ringing open`;
    if (muted.length) s += `; string${plural(muted)} ${list(muted)} not played`;
    return s;
  }

  function pianoVoicingSentence(name) {
    const v = pianoVoicing(name, 4);
    if (!v) return null;
    return 'right hand: ' +
      v.keys.map(k => `${PIANO_FINGER_EN[k.finger]} on ${k.note}${k.octave}`).join(', ') +
      `; left hand: ${PIANO_FINGER_EN[5]} on the ${v.bass.note}${v.bass.octave} bass note; ` +
      'fingers curved, wrists relaxed and level with the forearm';
  }

  const fingeringSentence = (name, instrument) =>
    instrument === 'piano' ? pianoVoicingSentence(name) : guitarFingeringSentence(name);

  /* ---------- visual translation ----------
     "middle finger on string 5 at fret 2" is musician notation. An image model
     has no visual concept of a numbered string or fret — those are symbols. It
     does understand where the hand sits relative to the inlay dots, how many
     fingertips are visible on the fretboard face, and where the thumb is. This
     converts the fingering into that language, which is what a generator can
     actually act on. */
  function neckLandmark(fret) {
    if (fret <= 2) return 'right up against the nut, in the first two fret spaces';
    if (fret === 3) return 'at the first inlay dot marker';
    if (fret === 4) return 'just past the first inlay dot';
    if (fret === 5) return 'at the second inlay dot marker';
    if (fret <= 6) return 'just past the second inlay dot';
    if (fret === 7) return 'at the third inlay dot marker';
    if (fret <= 8) return 'just past the third inlay dot';
    if (fret === 9) return 'at the fourth inlay dot marker';
    if (fret < 12) return 'between the fourth inlay dot and the double dots';
    if (fret === 12) return 'at the double inlay dots, where the neck meets the body';
    return 'high up the neck, past the double inlay dots';
  }

  function visualFingering(name, instrument) {
    if (instrument === 'piano') {
      const v = pianoVoicing(name, 4);
      if (!v) return null;
      return `${v.keys.length} fingertips of the right hand press down on ${v.keys.length} separate keys, ` +
        'and those keys sit visibly lower than the keys beside them; the left hand presses a single low key; ' +
        'fingers are curved as if holding a small ball, wrists level with the forearms, not collapsed';
    }
    const f = guitarFingering(name);
    if (!f) return null;
    const parts = [];
    const pressedCount = f.shape.filter(x => typeof x === 'number' && x > 0).length;
    if (f.barre) {
      const extra = f.shape.filter((x, i) => typeof x === 'number' && x > 0 && x !== f.baseFret).length;
      parts.push(`the index finger is laid completely flat across all six strings ${neckLandmark(f.baseFret)}`);
      if (extra) parts.push(`${extra} more arched fingertips press the strings one to two fret spaces above it, each on a different string`);
    } else {
      parts.push(`the fretting hand is ${neckLandmark(f.baseFret)}`);
      parts.push(`${pressedCount} arched fingertip${pressedCount > 1 ? 's' : ''} press${pressedCount === 1 ? 'es' : ''} ` +
        'straight down onto the face of the fretboard, each on a different string, all of them clearly visible from the front');
    }
    parts.push('the thumb is behind the neck and hidden from view, not hooked over the top edge');
    const open = f.shape.filter(x => x === 0).length;
    if (open) parts.push(`${open} string${open > 1 ? 's are' : ' is'} left ringing open, untouched by any finger`);
    return parts.join('; ');
  }

  function romanNumeral(chord, key) {
    if (!key || !key.tonic) return '';
    const p = parseChord(chord);
    if (!p) return '';
    const majorSteps = [0, 2, 4, 5, 7, 9, 11];
    const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
    const tonicIdx = PITCHES.indexOf(key.tonic);
    const rootIdx = PITCHES.indexOf(p.root);
    if (tonicIdx < 0 || rootIdx < 0) return '';
    const rel = (rootIdx - tonicIdx + 12) % 12;
    const deg = majorSteps.indexOf(rel);
    if (deg < 0) return '';
    const n = numerals[deg];
    return p.quality === 'minor' ? n.toLowerCase() : n;
  }

  const CHORD_NAMES = Object.keys(GUITAR);

  /* ---------- YouTube helpers ---------- */
  function parseVideoId(url) {
    if (!url) return null;
    const s = String(url).trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    const patterns = [
      /(?:youtube\.com\/watch\?[^#]*\bv=)([\w-]{11})/,
      /(?:youtu\.be\/)([\w-]{11})/,
      /(?:youtube\.com\/embed\/)([\w-]{11})/,
      /(?:youtube\.com\/shorts\/)([\w-]{11})/,
      /(?:youtube\.com\/live\/)([\w-]{11})/
    ];
    for (const re of patterns) { const m = s.match(re); if (m) return m[1]; }
    return null;
  }
  const thumbUrl = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  /* ---------- persistence ---------- */
  const KEY = 'maestro.studio.v1';
  const defaults = () => ({ tracks: [], characters: [], settings: { volume: 80, lang: 'he', voiceRate: .95 } });

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw);
      return Object.assign(defaults(), parsed);
    } catch (e) { return defaults(); }
  }
  let state = load();
  /** Returns false when the browser refuses the write (quota) so callers can
   *  tell the user instead of silently losing their work. */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { console.warn('save failed', e); return false; }
  }
  const uid = () => 'x' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  const Store = {
    get state() { return state; },
    save,
    uid,
    addTrack(t) { t.id = t.id || uid(); t.addedAt = Date.now(); state.tracks.unshift(t); save(); return t; },
    updateTrack(id, patch) {
      const t = state.tracks.find(x => x.id === id);
      if (t) { Object.assign(t, patch); save(); }
      return t;
    },
    removeTrack(id) { state.tracks = state.tracks.filter(t => t.id !== id); save(); },
    getTrack(id) { return state.tracks.find(t => t.id === id); },
    addCharacter(c) { c.id = c.id || uid(); c.createdAt = Date.now(); state.characters.unshift(c); save(); return c; },
    updateCharacter(id, patch) {
      const c = state.characters.find(x => x.id === id);
      if (c) { Object.assign(c, patch); save(); }
      return c;
    },
    removeCharacter(id) { state.characters = state.characters.filter(c => c.id !== id); save(); },
    getCharacter(id) { return state.characters.find(c => c.id === id); },
    setSetting(k, v) { state.settings[k] = v; save(); },
    exportAll() { return JSON.stringify(state, null, 2); },
    importAll(json) {
      const parsed = JSON.parse(json);
      state = Object.assign(defaults(), parsed);
      save();
    }
  };

  global.MM = {
    PITCHES, PITCHES_HE, STRINGS, GUITAR, CHORD_NAMES, CHORD_GROUPS,
    parseChord, guitarFingering, pianoVoicing, romanNumeral,
    guitarFingeringSentence, pianoVoicingSentence, fingeringSentence,
    visualFingering, neckLandmark,
    parseVideoId, thumbUrl, Store
  };
})(window);
