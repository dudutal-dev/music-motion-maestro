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

  /* ---------- practice set ----------
     The library starts empty, and an empty app cannot show what it does. The
     obvious fix would be to ship a few famous songs, but a song needs a
     YouTube id and there is no way to check from here that a given id is the
     right recording, or still exists — a dead or wrong link is worse than an
     empty shelf.

     What can be shipped honestly is the music itself. These are the standard
     progressions, in common keys and tempos, with chords that are verified
     against the theory rather than remembered. They carry no video, so the
     stage runs them on its own clock with a click track: no link, no ads, no
     network. They are practice material, and they say so. */
  const PRACTICE = [
    { title: 'I–V–vi–IV', artist: 'תרגול · הפרוגרסיה הנפוצה בפופ', genre: 'תרגול',
      bpm: 96,  key: { tonic: 'C', mode: 'major' }, prog: ['C', 'G', 'Am', 'F'] },
    { title: 'vi–IV–I–V', artist: 'תרגול · אותה פרוגרסיה, פתיחה במינור', genre: 'תרגול',
      bpm: 100, key: { tonic: 'A', mode: 'minor' }, prog: ['Am', 'F', 'C', 'G'] },
    { title: 'I–vi–IV–V', artist: 'תרגול · הבלדה של שנות ה-50', genre: 'תרגול',
      bpm: 76,  key: { tonic: 'C', mode: 'major' }, prog: ['C', 'Am', 'F', 'G'] },
    { title: 'ii–V–I', artist: 'תרגול · הקדנצה של הג׳אז', genre: 'תרגול',
      bpm: 120, key: { tonic: 'C', mode: 'major' }, prog: ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'] },
    { title: 'בלוז 12 תיבות', artist: 'תרגול · בלוז ב-A', genre: 'תרגול',
      bpm: 88,  key: { tonic: 'A', mode: 'major' },
      prog: ['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7'] },
    { title: 'I–IV–V בגיטרה פתוחה', artist: 'תרגול · שלושת האקורדים הראשונים', genre: 'תרגול',
      bpm: 92,  key: { tonic: 'G', mode: 'major' }, prog: ['G', 'C', 'D', 'G'] },
    { title: 'Em–C–G–D', artist: 'תרגול · פופ-רוק במינור', genre: 'תרגול',
      bpm: 110, key: { tonic: 'E', mode: 'minor' }, prog: ['Em', 'C', 'G', 'D'] },
    { title: 'אנדלוסי (i–VII–VI–V)', artist: 'תרגול · צליל ים-תיכוני', genre: 'תרגול',
      bpm: 104, key: { tonic: 'A', mode: 'minor' }, prog: ['Am', 'G', 'F', 'E'] }
  ];

  /** Builds the practice tracks, each with a real analysis and no video. */
  function practiceTracks(barsPerChord, repeats) {
    const bars = barsPerChord || 2, reps = repeats || 4;
    return PRACTICE.map(p => {
      const beat = 60 / p.bpm, barLen = beat * 4;
      const chords = [], beatTimes = [], downbeats = [];
      const total = p.prog.length * reps;
      for (let i = 0; i < total; i++) {
        const start = i * barLen * bars;
        chords.push({ start: +start.toFixed(3), end: +(start + barLen * bars).toFixed(3),
                      chord: p.prog[i % p.prog.length] });
      }
      const duration = total * barLen * bars;
      for (let t = 0, i = 0; t < duration; t += beat, i++) {
        beatTimes.push(+t.toFixed(3));
        if (i % 4 === 0) downbeats.push(+t.toFixed(3));
      }
      return {
        videoId: null, url: '', title: p.title, artist: p.artist,
        genre: p.genre, album: 'ספריית תרגול', practice: true,
        analysis: {
          bpm: p.bpm, key: p.key, duration: +duration.toFixed(2), firstBeat: 0,
          timeSignature: 4, beatTimes, downbeats,
          sections: [{ start: 0, end: +duration.toFixed(2), label: 'mid', energy: .5 }],
          chords, energy: .5, valence: p.key.mode === 'major' ? .7 : .4,
          mood: 'practice', source: 'practice',
          confidence: { tempo: 1, key: 1 }      // written down, not estimated
        }
      };
    });
  }

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

  /**
   * The fingering as a sentence for an image model.
   *
   * For a guitar it now carries real distances as well as string and fret
   * numbers. "Fret 3" is a symbol an image model has no picture of; "87mm
   * from the nut" is a distance, and the neck in the frame has a length it
   * can be measured against. The thumb comes with it, which the old sentence
   * never mentioned at all — and a thumb left unsaid is why generated
   * guitarists so often have one draped over the top of the neck.
   */
  const fingeringSentence = (name, instrument) => {
    if (instrument === 'piano') return pianoVoicingSentence(name);
    const base = guitarFingeringSentence(name);
    const mm = global.Fretboard ? global.Fretboard.placementMm(name) : null;
    return mm ? `${base} — measured on the neck: ${mm}` : base;
  };

  /* ---------- visual translation ----------
     "middle finger on string 5 at fret 2" is musician notation. An image model
     has no visual concept of a numbered string or fret — those are symbols. It
     does understand where the hand sits relative to the inlay dots, how many
     fingertips are visible on the fretboard face, and where the thumb is. This
     converts the fingering into that language, which is what a generator can
     actually act on. */
  /* Strings named by what the eye can actually judge — relative thickness —
     rather than by the numbering only a player knows. Index 0 is the low E. */
  const STRING_VISUAL = [
    'the thickest string', 'the second-thickest string', 'the third-thickest string',
    'the third-thinnest string', 'the second-thinnest string', 'the thinnest string'
  ];
  const fretSpaces = fret =>
    fret === 1 ? 'in the first fret space, right against the nut'
      : fret <= 4 ? `in the ${['', 'first', 'second', 'third', 'fourth'][fret]} fret space from the nut`
      : `at ${neckLandmark(fret)}`;
  const listOf = a => a.length < 2 ? a[0]
    : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

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

  /** What must be visible in frame for the stated position to be checkable. */
  function requiredLandmark(name) {
    const f = guitarFingering(name);
    if (!f) return null;
    if (f.baseFret <= 3) {
      return 'the nut and the start of the headstock must be visible at the edge of frame, ' +
        'so the hand can be seen sitting in the very first fret spaces beside it';
    }
    return `the inlay dot markers around fret ${f.baseFret} must be visible in frame, ` +
      'so the hand can be seen sitting against them';
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
    if (f.barre) {
      parts.push(`the index finger is laid completely flat across all six strings ${neckLandmark(f.baseFret)}`);
      const extras = [];
      f.shape.forEach((fr, i) => {
        if (typeof fr === 'number' && fr > 0 && fr !== f.baseFret && f.fingers[i] > 0) {
          extras.push(`the ${GUITAR_FINGER_EN[f.fingers[i]]} presses ${STRING_VISUAL[i]} ` +
            `${fretSpaces(fr)}`);
        }
      });
      if (extras.length) {
        parts.push(extras.join(', '));
        const n = extras.length + 1, spare = 4 - n;
        parts.push(`exactly ${n} fingers are in contact with the strings` +
          (spare > 0
            ? ` — the remaining ${spare === 1 ? 'finger stays' : spare + ' fingers stay'} clear`
            : ', all four of them'));
      }
    } else {
      parts.push(`the fretting hand is ${neckLandmark(f.baseFret)}`);
      const placed = [];
      f.shape.forEach((fr, i) => {
        if (typeof fr === 'number' && fr > 0 && f.fingers[i] > 0) {
          placed.push(`the ${GUITAR_FINGER_EN[f.fingers[i]]} presses ${STRING_VISUAL[i]} ${fretSpaces(fr)}`);
        }
      });
      // Naming which string each finger takes is what separates A from C from
      // Am — a fingertip count alone describes half the open chords equally.
      if (placed.length) parts.push(placed.join(', '));
      const n = placed.length, spare = 4 - n;
      parts.push(`exactly ${n} finger${n > 1 ? 's' : ''} touch${n === 1 ? 'es' : ''} the strings` +
        (spare > 0
          ? ` — the other ${spare === 1 ? 'finger stays' : spare + ' fingers stay'} curled ` +
            'clear of the fretboard, touching nothing'
          : ', all four of them'));
      parts.push('every pressing fingertip is arched and visible from the front');
    }
    parts.push('the thumb is behind the neck and hidden from view, not hooked over the top edge');
    const openStrings = [], mutedStrings = [];
    f.shape.forEach((fr, i) => {
      if (fr === 0) openStrings.push(STRING_VISUAL[i]);
      else if (fr === 'x') mutedStrings.push(STRING_VISUAL[i]);
    });
    if (openStrings.length) parts.push(`${listOf(openStrings)} ring open, untouched`);
    if (mutedStrings.length) parts.push(`${listOf(mutedStrings)} not sounded`);
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

  /** Shift a chord by semitones, keeping its quality. Used for transpose/capo. */
  function transposeChord(name, semitones) {
    const p = parseChord(name);
    if (!p) return name;
    const i = PITCHES.indexOf(p.root);
    if (i < 0) return name;
    return PITCHES[(((i + semitones) % 12) + 12) % 12] + p.suffix;
  }

  /** Capo advice: the shapes a player actually forms with the capo on. */
  function capoShapes(chords, capo) {
    return chords.map(c => transposeChord(c, -capo));
  }

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

  /**
   * The key of an analysis, or null when it does not have one.
   *
   * Every caller guarded on `analysis.bpm` and then read `analysis.key.tonic`,
   * which is a different question. A record carrying a tempo but no key — a
   * hand-edited backup, an import that was cut short, an older export — took
   * the whole library view down with it. Returning null rather than a made-up
   * default keeps callers from printing a key nobody detected.
   */
  const keyOf = a => (a && a.key && a.key.tonic) ? a.key : null;
  /** "Am" / "C" / '' — the short label used on badges. */
  const keyLabel = a => {
    const k = keyOf(a);
    return k ? k.tonic + (k.mode === 'minor' ? 'm' : '') : '';
  };

  /* ---------- reading a track's details off the link ----------
     Asking someone to retype the title and artist that are already
     sitting in the URL is busywork. YouTube's oEmbed endpoint hands
     both over without a key, so we ask it and fill the form in.

     It is a network call to a third party, so it may be blocked or
     offline. Every caller must handle a null and let the user type —
     auto-fill is a convenience, never a prerequisite. */

  /** Strips the production noise YouTube titles collect. */
  function cleanTitle(raw) {
    let s = String(raw || '');
    // "(Official Video)", "[Lyric Video]", "(4K Remaster)" and friends
    const noise = /[\(\[]\s*(?:[^\)\]]*\b(?:official|lyrics?|audio|video|visuali[sz]er|remaster(?:ed)?|hd|hq|4k|8k|mv|m\/v|full|clip|prod|explicit)\b[^\)\]]*)\s*[\)\]]/gi;
    let prev;
    do { prev = s; s = s.replace(noise, ' '); } while (s !== prev);
    s = s.replace(/\s*[|｜]\s*[^|｜]*$/, '');        // trailing "| Official Channel"
    // The same noise also shows up bare on the tail: "… 4K Remastered", "… HD".
    s = s.replace(
      /(?:\s*[-–—]?\s*\b(?:official(?:\s+(?:music\s+)?video|\s+audio)?|lyrics?(?:\s+video)?|audio|visuali[sz]er|remaster(?:ed)?|hd|hq|4k|8k)\b)+\s*$/gi,
      '');
    s = s.replace(/\s*[-–—]\s*$/, '');
    return s.replace(/\s{2,}/g, ' ').trim();
  }

  /** "Artist - Song" is the dominant convention; fall back to the channel. */
  function splitTitle(cleaned, channel) {
    // Channel names carry branding the artist name does not: "Queen Official",
    // "AdeleVEVO", the auto-generated "… - Topic".
    const chan = String(channel || '')
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/\s*VEVO$/i, '')
      .replace(/\s+Official(?:\s+(?:Channel|Music))?$/i, '')
      .trim();
    const m = cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (m) {
      const left = m[1].trim(), right = m[2].trim();
      // "Artist - Song" is the usual order, but plenty of uploads invert it.
      // The channel name breaks the tie: whichever side it matches is the artist.
      const norm = x => x.toLowerCase().replace(/\s+/g, '');
      if (chan && norm(right) === norm(chan)) return { artist: right, title: left };
      // Guard against a hyphen inside the song name itself.
      if (left && right && left.length < 60) return { artist: left, title: right };
    }
    return { artist: chan, title: cleaned };
  }

  /**
   * Resolves a video's title and artist. Never rejects — resolves to null
   * when the lookup is unavailable, so the form stays usable offline.
   */
  function fetchMeta(videoId) {
    const url = 'https://www.youtube.com/oembed?format=json&url=' +
                encodeURIComponent('https://www.youtube.com/watch?v=' + videoId);
    return fetch(url, { mode: 'cors' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!j || !j.title) return null;
        const cleaned = cleanTitle(j.title);
        const parts = splitTitle(cleaned, j.author_name);
        return { title: parts.title || cleaned, artist: parts.artist || '', raw: j.title };
      })
      .catch(() => null);
  }

  /* ---------- persistence ---------- */
  const KEY = 'maestro.studio.v1';
  const defaults = () => ({ tracks: [], characters: [], settings: { volume: 80, lang: 'he', voiceRate: .95 } });

  /* Declared before normalize(), which runs during module init when stored
     data is read back: a const here would still be in its dead zone. */
  const uid = () => 'x' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  /**
   * Forces a parsed blob into the shape the app relies on.
   *
   * Object.assign happily lets `{"tracks": "hello"}` through, and from then on
   * every view that maps over the library is calling .map on a string. The
   * data comes from a file the user picked or from storage another version
   * wrote, so neither source is trustworthy enough to spread blindly. Anything
   * of the wrong type falls back to the default rather than being repaired
   * into something that was never there.
   */
  function normalize(parsed) {
    const s = defaults();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return s;
    if (Array.isArray(parsed.tracks)) {
      s.tracks = parsed.tracks.filter(t => t && typeof t === 'object' && (t.videoId || t.practice))
        .map(t => (t.id ? t : Object.assign({ id: uid() }, t)));
    }
    if (Array.isArray(parsed.characters)) {
      s.characters = parsed.characters.filter(c => c && typeof c === 'object')
        .map(c => (c.id ? c : Object.assign({ id: uid() }, c)));
    }
    if (parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)) {
      Object.assign(s.settings, parsed.settings);
    }
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      return normalize(JSON.parse(raw));
    } catch (e) { return defaults(); }
  }
  let state = load();
  /** Returns false when the browser refuses the write (quota) so callers can
   *  tell the user instead of silently losing their work. */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { console.warn('save failed', e); return false; }
  }

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
    /* The backup is what carries work between devices, so it has to include
       the poster. Those images live in IndexedDB rather than localStorage,
       which makes both of these asynchronous. */
    async exportAll() {
      const payload = Object.assign({}, state);
      try { payload.posters = await Posters.all(); }
      catch (e) { payload.posters = {}; }
      return JSON.stringify(payload, null, 2);
    },
    async importAll(json) {
      const parsed = JSON.parse(json);
      const posters = (parsed && parsed.posters) || {};
      state = normalize(parsed);             // posters never enter localStorage
      save();
      let restored = 0;
      try { restored = await Posters.replaceAll(posters); } catch (e) { restored = 0; }
      return { posters: restored, expected: Object.keys(posters).length };
    }
  };

  /* ---------- poster images ----------
     A finished poster is thirty generated images. Held in a plain object they
     vanished on refresh and never reached the backup, so the work could not
     move between devices. They are also far too large for localStorage, whose
     budget is a few megabytes for everything. IndexedDB has room for them, at
     the cost of being asynchronous.

     Every call resolves rather than rejects on a missing or blocked database —
     private-browsing modes disable IndexedDB outright — so the poster screen
     degrades to session-only instead of breaking. */

  const IDB_NAME = 'maestro.studio', IDB_STORE = 'posters';

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error('IndexedDB unavailable'));
      const req = global.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE))
          db.createObjectStore(IDB_STORE, { keyPath: 'chord' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  function withStore(mode, run) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(IDB_STORE, mode);
      let result;
      run(t.objectStore(IDB_STORE), v => { result = v; });
      t.oncomplete = () => { db.close(); resolve(result); };
      t.onerror = () => { db.close(); reject(t.error); };
      t.onabort = () => { db.close(); reject(t.error || new Error('aborted')); };
    }));
  }

  const Posters = {
    get available() { return !!global.indexedDB; },

    all() {
      return withStore('readonly', (s, set) => {
        const req = s.getAll();
        req.onsuccess = () => {
          const map = {};
          for (const r of req.result || []) map[r.chord] = r.data;
          set(map);
        };
      });
    },
    set(chord, data) { return withStore('readwrite', s => s.put({ chord, data })); },
    remove(chord)    { return withStore('readwrite', s => s.delete(chord)); },
    clear()          { return withStore('readwrite', s => s.clear()); },

    replaceAll(map) {
      return withStore('readwrite', (s, set) => {
        s.clear();
        let n = 0;
        for (const chord of Object.keys(map || {})) {
          if (typeof map[chord] !== 'string') continue;
          s.put({ chord, data: map[chord] });
          n++;
        }
        set(n);
      });
    }
  };

  global.MM = {
    PITCHES, PITCHES_HE, STRINGS, GUITAR, CHORD_NAMES, CHORD_GROUPS,
    parseChord, guitarFingering, pianoVoicing, romanNumeral,
    guitarFingeringSentence, pianoVoicingSentence, fingeringSentence,
    visualFingering, neckLandmark, requiredLandmark, transposeChord, capoShapes,
    parseVideoId, thumbUrl, keyOf, keyLabel, PRACTICE, practiceTracks, fetchMeta, cleanTitle, splitTitle, Store, Posters
  };
})(window);
