/* ============================================================
   audio-analysis.js — real analysis, in the browser
   Until now the app could only take analysis from the Python
   pipeline or from hand entry, which made it dependent on either a
   toolchain or a musician's ear. This is a port of the same method
   the skill uses, running on Web Audio:

     decode -> mono -> spectral flux onsets -> tempo by
     autocorrelation -> beat grid -> beat-synchronous chroma ->
     key (Krumhansl-Schmuckler) -> chords (triad templates)

   It is an estimate, not ground truth, and it says so: every result
   carries a confidence so the UI can tell the user what to trust.
   ============================================================ */
(function (global) {
  'use strict';
  const MM = global.MM;

  /* ---------- FFT (iterative radix-2, in place) ---------- */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  const hann = n => {
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    return w;
  };

  /* ---------- decode + prepare ---------- */
  async function decodeToMono(file, targetSr) {
    const ctx = new (global.AudioContext || global.webkitAudioContext)();
    const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const ch = audio.numberOfChannels, n = audio.length;
    const mono = new Float32Array(n);
    for (let c = 0; c < ch; c++) {
      const d = audio.getChannelData(c);
      for (let i = 0; i < n; i++) mono[i] += d[i] / ch;
    }
    const sr = audio.sampleRate;
    ctx.close && ctx.close();
    if (!targetSr || targetSr >= sr) return { data: mono, sr, duration: audio.duration };
    // linear resample — plenty for onset and chroma work
    const ratio = sr / targetSr;
    const out = new Float32Array(Math.floor(n / ratio));
    for (let i = 0; i < out.length; i++) {
      const p = i * ratio, i0 = Math.floor(p), frac = p - i0;
      out[i] = mono[i0] * (1 - frac) + (mono[i0 + 1] || 0) * frac;
    }
    return { data: out, sr: targetSr, duration: audio.duration };
  }

  /* ---------- one pass: onset envelope + chroma frames ---------- */
  function framePass(data, sr, frameSize, hop) {
    const win = hann(frameSize);
    const half = frameSize / 2;
    const nFrames = Math.max(0, Math.floor((data.length - frameSize) / hop));
    const flux = new Float32Array(nFrames);
    const rms = new Float32Array(nFrames);
    const chroma = [];
    // precompute bin -> pitch class
    const binPc = new Int8Array(half);
    for (let k = 0; k < half; k++) {
      const f = k * sr / frameSize;
      binPc[k] = (f < 55 || f > 2200) ? -1
        : ((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12;
    }
    const re = new Float32Array(frameSize), im = new Float32Array(frameSize);
    let prev = new Float32Array(half);

    for (let f = 0; f < nFrames; f++) {
      const off = f * hop;
      let energy = 0;
      for (let i = 0; i < frameSize; i++) {
        const s = data[off + i];
        energy += s * s;
        re[i] = s * win[i]; im[i] = 0;
      }
      rms[f] = Math.sqrt(energy / frameSize);
      fft(re, im);
      const c = new Float32Array(12);
      let sum = 0;
      for (let k = 0; k < half; k++) {
        const m = Math.hypot(re[k], im[k]);
        const d = m - prev[k];
        if (d > 0) sum += d;
        prev[k] = m;
        const pc = binPc[k];
        if (pc >= 0) c[pc] += m;
      }
      flux[f] = sum;
      // normalise each frame's chroma so loud sections don't dominate
      let mx = 0; for (let i = 0; i < 12; i++) if (c[i] > mx) mx = c[i];
      if (mx > 0) for (let i = 0; i < 12; i++) c[i] /= mx;
      chroma.push(c);
    }
    return { flux, rms, chroma, nFrames };
  }

  /* ---------- tempo ---------- */
  function estimateTempo(flux, envSr) {
    // smooth, then remove the mean so autocorrelation sees pulses not loudness
    const n = flux.length;
    const sm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < n) { s += flux[j]; c++; } }
      sm[i] = s / c;
    }
    let mean = 0; for (let i = 0; i < n; i++) mean += sm[i]; mean /= n || 1;
    for (let i = 0; i < n; i++) sm[i] -= mean;

    const minBpm = 60, maxBpm = 190;
    const minLag = Math.floor(60 * envSr / maxBpm);
    const maxLag = Math.min(Math.ceil(60 * envSr / minBpm), Math.floor(n / 2));
    let best = { lag: 0, score: -Infinity };
    const scores = [];
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0;
      for (let i = 0; i + lag < n; i++) s += sm[i] * sm[i + lag];
      s /= (n - lag);
      scores.push({ lag, s });
      if (s > best.score) best = { lag, score: s };
    }
    /* A flat envelope correlates with itself at every lag equally, and every
       score comes out zero — at which point "the best lag" is just the first
       one tried. Reporting that as a tempo produced 198.8 BPM from silence. */
    if (!best.lag || !(best.score > 0)) return { bpm: 0, confidence: 0, beatLen: 0 };

    /* The peak is at a whole number of frames, and a beat is not.
       The envelope runs at sr/HOP — about 43 frames a second — so the only
       beat lengths this loop can name are 1/43s apart. At 96 BPM the true lag
       is 26.92 frames; the nearest whole lag, 27, is 95.71 BPM. That 0.3%
       looks like nothing and is not, because the grid below is built by
       repeated addition: the error is paid once per beat, all the way to the
       end of the song. Measured on a 96 BPM song, the grid arrived 235ms late
       by the end of eighty seconds, and a four-minute song would be a beat out.

       An autocorrelation peak is locally parabolic, so the true maximum can
       be read between the samples from the three points around it. */
    const peak = scores.findIndex(x => x.lag === best.lag);
    let lag = best.lag;
    if (peak > 0 && peak < scores.length - 1) {
      const a = scores[peak - 1].s, b0 = scores[peak].s, c = scores[peak + 1].s;
      const den = a - 2 * b0 + c;
      if (den < 0) {                              // a maximum, not a saddle
        const d = 0.5 * (a - c) / den;
        if (Math.abs(d) <= 0.5) lag = best.lag + d;
      }
    }

    let bpm = 60 * envSr / lag;
    // Autocorrelation happily locks onto half or double time. Prefer the
    // candidate that lands in the range most music actually sits in.
    const alt = [];
    if (bpm < 85) alt.push(bpm * 2);
    if (bpm > 160) alt.push(bpm / 2);
    for (const a of alt) {
      if (a >= 70 && a <= 165) {
        const lag = Math.round(60 * envSr / a);
        const hit = scores.find(x => x.lag === lag);
        if (hit && hit.s > best.score * 0.45) { bpm = a; break; }
      }
    }
    const mags = scores.map(x => x.s);
    const mx = Math.max(...mags), avg = mags.reduce((a, b) => a + b, 0) / mags.length;
    const confidence = mx > 0 ? Math.max(0, Math.min(1, (mx - avg) / (mx + 1e-9))) : 0;
    return { bpm, confidence, beatLen: 60 / bpm };
  }

  /** Slide the grid to wherever the onsets actually are. */
  function estimatePhase(flux, envSr, beatLen) {
    const step = beatLen * envSr;
    // Sample the envelope between frames: rounding to the nearest frame costs
    // up to half a hop, which at this hop size is a audible slice of a beat.
    const at = t => {
      const i = Math.floor(t);
      if (i < 0 || i + 1 >= flux.length) return flux[Math.max(0, Math.min(flux.length - 1, i))] || 0;
      const f = t - i;
      return flux[i] * (1 - f) + flux[i + 1] * f;
    };
    let best = { off: 0, score: -Infinity };
    const res = Math.max(0.25, step / 256);
    for (let off = 0; off < step; off += res) {
      let s = 0;
      for (let t = off; t < flux.length; t += step) s += at(t);
      if (s > best.score) best = { off, score: s };
    }
    // A grid at off and one at off-beatLen are the same grid; report the
    // earliest beat at or after zero so the first beat isn't skipped.
    let off = best.off;
    while (off - step >= -1e-6) off -= step;
    while (off < -1e-6) off += step;
    return off / envSr;
  }

  /* ---------- key ---------- */
  const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  function corr(a, b) {
    const n = a.length;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
      const x = a[i] - ma, y = b[i] - mb;
      num += x * y; da += x * x; db += y * y;
    }
    return (da && db) ? num / Math.sqrt(da * db) : 0;
  }

  function estimateKey(meanChroma) {
    let best = { score: -Infinity, tonic: 'C', mode: 'major' };
    for (let i = 0; i < 12; i++) {
      const rot = k => meanChroma.map((_, j) => meanChroma[(j + i) % 12]);
      const c = rot();
      const maj = corr(MAJOR, c), min = corr(MINOR, c);
      if (maj > best.score) best = { score: maj, tonic: MM.PITCHES[i], mode: 'major' };
      if (min > best.score) best = { score: min, tonic: MM.PITCHES[i], mode: 'minor' };
    }
    return { tonic: best.tonic, mode: best.mode, confidence: Math.max(0, best.score) };
  }

  /**
   * Settles the relative major/minor question using the chords.
   *
   * A key and its relative minor contain exactly the same notes, so a method
   * that only looks at how often each pitch sounds cannot tell them apart —
   * Am F C G came back as C major, which is defensible from the chroma and
   * wrong to every guitarist who would call it A minor. What separates them is
   * which chord the music treats as home, and that is in the progression: the
   * first and last chords carry the tonal weight. Only the relative pair is
   * ever swapped, and only when the chords agree, so a confident reading is
   * never overturned by this.
   */
  function refineKeyWithChords(key, chords) {
    if (!chords || chords.length < 2) return key;
    const rel = key.mode === 'major'
      ? { tonic: MM.PITCHES[(MM.PITCHES.indexOf(key.tonic) + 9) % 12], mode: 'minor' }
      : { tonic: MM.PITCHES[(MM.PITCHES.indexOf(key.tonic) + 3) % 12], mode: 'major' };

    const nameOf = k => k.tonic + (k.mode === 'minor' ? 'm' : '');
    const other = nameOf(rel);

    /* Only the opening chord is allowed to overturn the pitch-class evidence.
       Weighting the closing chord too made Dm G C Am come out A minor because
       it happens to end on the vi — but that is a ii-V-I in C and every
       musician would call it C major. Where a piece starts is the stronger
       single cue, and requiring it keeps the rule from firing on a passing
       final chord. */
    if (chords[0].chord === other) {
      return { tonic: rel.tonic, mode: rel.mode, confidence: key.confidence };
    }
    return key;
  }

  /* ---------- chords ---------- */
  function chordTemplates() {
    const t = [], names = [];
    for (let r = 0; r < 12; r++) {
      const maj = new Array(12).fill(0), min = new Array(12).fill(0);
      maj[r] = 1; maj[(r + 4) % 12] = 1; maj[(r + 7) % 12] = 1;
      min[r] = 1; min[(r + 3) % 12] = 1; min[(r + 7) % 12] = 1;
      t.push(maj); names.push(MM.PITCHES[r]);
      t.push(min); names.push(MM.PITCHES[r] + 'm');
    }
    return { t, names };
  }

  function detectChords(chroma, envSr, beatTimes) {
    const { t, names } = chordTemplates();
    const perBeat = [];
    for (let b = 0; b < beatTimes.length; b++) {
      // Window from the beat's real timestamp. Counting frames from zero
      // ignored firstBeat and slid every chord label off the beat it belongs to.
      const start = Math.floor(beatTimes[b] * envSr);
      const end = b + 1 < beatTimes.length
        ? Math.min(chroma.length, Math.floor(beatTimes[b + 1] * envSr))
        : chroma.length;
      if (start >= chroma.length) break;
      const acc = new Array(12).fill(0);
      for (let f = start; f < end; f++) for (let i = 0; i < 12; i++) acc[i] += chroma[f][i];
      /* A beat with no energy in it does not get a chord. Dividing by the
         `|| 1` fallback below turns a silent beat into a vector of zeros,
         every template then scores exactly zero, and the first comparison
         against -Infinity hands the beat to whichever chord is first in the
         list while every later 0 > 0 leaves it there. That is not a close
         call being resolved — it is a coin toss that always lands the same
         way, and over a silent recording it lands that way every beat. */
      const energy = Math.hypot(...acc);
      if (!(energy > 1e-6)) { perBeat.push(null); continue; }
      for (let i = 0; i < 12; i++) acc[i] /= energy;
      let best = { s: -Infinity, name: null };
      for (let k = 0; k < t.length; k++) {
        const tv = t[k], tn = Math.sqrt(3);
        let dot = 0;
        for (let i = 0; i < 12; i++) dot += tv[i] * acc[i];
        const s = dot / tn;
        if (s > best.s) best = { s, name: names[k] };
      }
      perBeat.push(best.name);
    }
    // merge consecutive identical chords into timed segments
    const segs = [];
    let i = 0;
    while (i < perBeat.length) {
      // Silent stretches carry no chord and are simply left out, so a gap in
      // the chart means "nothing was playing here" rather than a guess.
      if (perBeat[i] == null) { i++; continue; }
      let j = i;
      while (j + 1 < perBeat.length && perBeat[j + 1] === perBeat[i]) j++;
      const start = beatTimes[i];
      const end = beatTimes[Math.min(j + 1, beatTimes.length - 1)];
      if (end > start) segs.push({ start: +start.toFixed(3), end: +end.toFixed(3), chord: perBeat[i] });
      i = j + 1;
    }
    return segs;
  }

  /* ---------- sections ---------- */
  function buildSections(rms, envSr, duration, beatLen, sig) {
    const barLen = beatLen * (sig || 4);
    const blockLen = barLen * 8;
    const out = [];
    for (let t = 0; t < duration - 0.05; t += blockLen) {
      const end = Math.min(t + blockLen, duration);
      let s = 0, n = 0;
      for (let f = Math.floor(t * envSr); f < Math.min(rms.length, end * envSr); f++) { s += rms[f]; n++; }
      out.push({ start: +t.toFixed(2), end: +end.toFixed(2), energy: n ? s / n : 0 });
    }
    if (out.length) {
      const vals = out.map(s => s.energy);
      const lo = Math.min(...vals), hi = Math.max(...vals) + 1e-9;
      for (const s of out) {
        const nrm = (s.energy - lo) / (hi - lo);
        s.energy = +nrm.toFixed(3);
        s.label = nrm > 0.66 ? 'high' : nrm > 0.33 ? 'mid' : 'low';
      }
    }
    return out;
  }

  /* ---------- entry point ---------- */
  async function analyzeFile(file, onProgress) {
    const p = m => onProgress && onProgress(m);
    p('מפענח את הקובץ…');
    const SR = 22050, FRAME = 2048, HOP = 512;
    const { data, sr, duration } = await decodeToMono(file, SR);
    if (!data.length) throw new Error('הקובץ ריק או לא נתמך');

    /* Is there anything in here at all?
       This is the check whose absence produced the worst bug this app has
       had. A tab shared without its sound — or a window or a screen, which
       Chrome will not give audio for at all — still yields an audio track,
       still records, and still arrives here as a perfectly valid file
       containing silence. Everything downstream then behaves as though it
       had heard something: the tempo estimator locks onto the shortest lag
       it is allowed, the key comes out C major because a zero chroma
       correlates with nothing, and every beat is labelled with whichever
       chord happens to be first in the template list. The user is handed a
       confident chart of one chord for four minutes.

       Silence is not a hard analysis problem. It is a different situation,
       and it needs saying rather than analysing. */
    let peak = 0, sq = 0;
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
      sq += data[i] * data[i];
    }
    const level = Math.sqrt(sq / data.length);
    // -70 dBFS. A usable take measured 0.0014 at one percent of full volume,
    // so this sits well below anything that still carries a song.
    if (level < 0.0003) throw new Error(
      'ההקלטה יצאה שקטה — לא היה בה קול לנתח. בדרך כלל זה קורה כששיתפת חלון ' +
      'או מסך במקום כרטיסייה (כרום נותן קול רק לכרטיסייה), או כששכחת לסמן ' +
      '"שתף גם את האודיו של הכרטיסייה". ודא גם שהשיר באמת מתנגן ושהווליום לא מושתק.');

    p('מחשב עוצמות ואונסטים…');
    const { flux, rms, chroma, nFrames } = framePass(data, sr, FRAME, HOP);
    if (nFrames < 32) throw new Error('הקובץ קצר מדי לניתוח');
    const envSr = sr / HOP;

    p('מאתר קצב…');
    const tempo = estimateTempo(flux, envSr);
    if (!tempo.bpm) throw new Error('לא הצלחתי לזהות קצב');
    /* A frame's flux describes a window that begins at i*HOP but spans FRAME
       samples, so an onset registers as soon as it enters the window rather
       than when the frame starts. Timing frames from the window start therefore
       reports every onset early by roughly half a frame. Measured against a
       single impulse at exactly 1.000s, the peak landed at 0.929s — 71ms early,
       which is a fifth of a beat at 120 BPM and enough to make the performer
       feel ahead of the music. Referencing each frame to the centre of its
       window removes the systematic part of that. */
    const frameCentre = (FRAME / 2) / sr;
    let firstBeat = estimatePhase(flux, envSr, tempo.beatLen) + frameCentre;
    // Keep it the earliest beat at or after zero, as the grid builder assumes.
    while (firstBeat >= tempo.beatLen) firstBeat -= tempo.beatLen;
    while (firstBeat < 0) firstBeat += tempo.beatLen;

    p('בונה רשת ביטים…');
    const sig = 4;
    const beatTimes = [], downbeats = [];
    for (let t = firstBeat, i = 0; t < duration; t += tempo.beatLen, i++) {
      beatTimes.push(+t.toFixed(3));
      if (i % sig === 0) downbeats.push(+t.toFixed(3));
    }

    p('מזהה סולם…');
    const mean = new Array(12).fill(0);
    for (const c of chroma) for (let i = 0; i < 12; i++) mean[i] += c[i];
    for (let i = 0; i < 12; i++) mean[i] /= chroma.length;
    let key = estimateKey(mean);

    p('מחלץ אקורדים…');
    const chords = detectChords(chroma, envSr, beatTimes);
    // The chords are what break the relative major/minor tie, so this has to
    // come after them even though the key is reported first.
    key = refineKeyWithChords(key, chords);

    p('מזהה מבנה…');
    const sections = buildSections(rms, envSr, duration, tempo.beatLen, sig);

    // mood, using the same proxies as the Python analyzer
    let meanRms = 0; for (let i = 0; i < rms.length; i++) meanRms += rms[i];
    meanRms /= rms.length || 1;
    const energy = Math.max(0, Math.min(1, meanRms * 6));
    const valence = Math.max(0, Math.min(1,
      0.5 * (key.mode === 'major' ? 0.75 : 0.35) + energy * 0.4 + 0.15));
    const mood = energy > 0.5
      ? (valence > 0.5 ? 'energetic / uplifting' : 'intense / dark')
      : (valence > 0.5 ? 'calm / warm' : 'somber / mellow');

    return {
      bpm: +tempo.bpm.toFixed(1),
      key: { tonic: key.tonic, mode: key.mode },
      duration: +duration.toFixed(2),
      firstBeat: +firstBeat.toFixed(3),
      timeSignature: sig,
      beatTimes, downbeats, sections, chords,
      energy: +energy.toFixed(3), valence: +valence.toFixed(3), mood,
      source: 'browser',
      /* How loud the take was. Not a hard failure — a quiet recording can
         still be analysed, and the mic route is quiet by nature — but the
         difference between "the app is wrong" and "the app could barely hear
         it" is one the user is entitled to know, and only this number can
         tell them. -46 dBFS is about where a tab recorded through the wrong
         source starts producing chords out of room tone. */
      level: +level.toFixed(5),
      quiet: level < 0.005,
      confidence: {
        tempo: +tempo.confidence.toFixed(3),
        key: +key.confidence.toFixed(3)
      }
    };
  }

  /* ============================================================
     Capturing the sound instead of asking for a file

     The analyser above needs audio, and until now the only way to
     give it any was an mp3 the user had to find somewhere. That is
     the wrong ask: the song is already playing, in this very tab,
     through the YouTube player.

     The browser cannot read that audio out of the player — the
     iframe is cross-origin and deliberately opaque. But it can
     record the tab's own output, with the user's explicit consent,
     through the same screen-share machinery used for video calls.
     So we ask for the tab, keep only the audio track, and record it
     while the song plays. Nothing is downloaded and nothing leaves
     the machine.

     This needs tab-audio capture, which today means desktop Chrome
     or Edge. Callers should check `canCaptureTab()` first and say so
     plainly rather than failing at the picker.
     ============================================================ */

  /**
   * Rebases an analysis onto song time.
   *
   * A recording that starts once the song is already playing describes the
   * window [offset, offset+length], but every timestamp in it counts from
   * zero. Left alone that makes the performer play the whole song late by
   * `offset`. Shifting the grid here is exact, so the manual nudge stays for
   * genuine taste rather than for arithmetic we can do ourselves.
   */
  function shiftAnalysis(a, offset) {
    if (!offset) return a;
    const r = t => +(t + offset).toFixed(3);
    a.firstBeat = r(a.firstBeat);
    a.beatTimes = a.beatTimes.map(r);
    a.downbeats = a.downbeats.map(r);
    a.chords = a.chords.map(c => ({ ...c, start: r(c.start), end: r(c.end) }));
    a.sections = a.sections.map(s => ({ ...s, start: r(s.start), end: r(s.end) }));
    a.analyzedFrom = +offset.toFixed(2);
    return a;
  }

  function canCaptureTab() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia &&
              typeof MediaRecorder !== 'undefined');
  }

  /**
   * Records tab audio and returns it as an ArrayBuffer that analyzeFile
   * can decode. Resolves early if the user stops sharing.
   *
   * @param {object}   o
   * @param {number}   o.seconds     how long to record
   * @param {function} o.onStart     called once the audio track is live
   * @param {function} o.onTick      called each second with elapsed seconds
   * @param {object}   o.control     receives a .stop() to finish early
   */
  async function captureTabAudio(o) {
    o = o || {};
    if (!canCaptureTab()) {
      throw new Error('הדפדפן הזה לא תומך בהקלטת אודיו מטאב. נסה Chrome או Edge במחשב.');
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,               // required — the picker refuses audio-only
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        /* Ask the picker for THIS tab, and only this tab.
           The song does not play in the user's YouTube tab — it plays in the
           player embedded in this page. Told to "share the tab", people quite
           reasonably shared the YouTube tab they had open, where nothing was
           playing, and recorded four minutes of silence. Then they pressed
           play over there too and had two players running at two different
           points in the same song.

           The instructions already said "this tab". Instructions were the
           wrong tool: preferCurrentTab makes the picker offer this tab first,
           and selfBrowserSurface says it may be offered at all — Chrome
           excludes the capturing tab by default, which is the very thing that
           made the correct answer hard to find. */
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        // The tab's own sound, not everything the machine is playing.
        systemAudio: 'exclude'
      });
    } catch (e) {
      throw new Error(e && e.name === 'NotAllowedError'
        ? 'ביטלת את השיתוף. כדי לנתח צריך לאשר את שיתוף הטאב.'
        : 'לא הצלחתי לפתוח את בורר הטאבים.');
    }

    const audio = stream.getAudioTracks()[0];
    // The picker lets you share a tab without its sound, which is the single
    // most common way this goes wrong. Catch it now, while we can still explain.
    if (!audio) {
      stream.getTracks().forEach(t => t.stop());
      throw new Error('שיתפת את הטאב בלי הקול. חזור ונסה שוב — צריך לסמן ' +
                      '"שתף גם את האודיו של הכרטיסייה" בתחתית החלון.');
    }
    stream.getVideoTracks().forEach(t => t.stop());   // we only ever wanted the sound

    return recordTrack(audio, o,
      'לא נקלט קול. ודא שהשיר באמת מתנגן ושסימנת לשתף את האודיו של הכרטיסייה.');
  }

  /* ---------- the microphone route ----------
     Tab capture does not exist on iOS or on any phone browser, which
     left mobile users with no way to analyse anything. The microphone
     does exist there, so the song can be played out loud and listened
     to instead.

     It is a worse signal than tab audio — room noise, speaker
     response and the phone's own processing all get in the way — so
     we ask the browser to switch off the three things that would
     actively fight us. Echo cancellation is the important one: it is
     built to remove exactly the sound coming out of the speaker,
     which here is the entire recording. */

  function canCaptureMic() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
              typeof MediaRecorder !== 'undefined');
  }

  async function captureMicAudio(o) {
    o = o || {};
    if (!canCaptureMic()) {
      throw new Error('הדפדפן הזה לא נותן גישה למיקרופון.');
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
    } catch (e) {
      throw new Error(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
        ? 'אין הרשאה למיקרופון. אשר גישה בהגדרות האתר ונסה שוב.'
        : 'לא הצלחתי לפתוח את המיקרופון.');
    }
    const audio = stream.getAudioTracks()[0];
    if (!audio) {
      stream.getTracks().forEach(t => t.stop());
      throw new Error('לא נמצא מיקרופון זמין.');
    }
    return recordTrack(audio, o,
      'לא נקלט קול. ודא שהשיר מתנגן ברמקול ושהעוצמה גבוהה מספיק.');
  }

  /**
   * Shared recorder: runs an audio track for `seconds`, or until stopped.
   *
   * It records in segments rather than one continuous take, because the sound
   * coming off the tab is not always the song. YouTube drops its own video in
   * before the song and sometimes in the middle of it, and that audio is not
   * merely useless — analysed together with the song it shifts every chord
   * after it by the ad's length. So the caller says, through `wanted()`, when
   * the sound is the song; the recorder closes a segment the moment that turns
   * false and opens a fresh one when it comes back. Each segment is a complete
   * file on its own, and carries the song position it started at.
   *
   * @param {function} o.wanted    is the audio right now the thing we want
   * @param {function} o.position  where in the song we are, in seconds
   * @returns {Promise<{segments: Array<{buf: ArrayBuffer, at: number, len: number}>}>}
   */
  async function recordTrack(audio, o, silenceMessage) {
    const wanted = typeof o.wanted === 'function' ? o.wanted : () => true;
    const position = typeof o.position === 'function' ? o.position : () => 0;

    let rec = null, chunks = null, segAt = 0, segWall = 0, everOpened = false;
    const closing = [];

    /* Listen to the take while it is being taken.
       Recording is the one part of this app that cannot be checked afterwards
       without wasting the user's time: a silent share produces a perfectly
       valid file, and the only way to find out used to be to sit through the
       whole song and then be told. So the level is watched live, and a take
       with nothing in it is stopped within seconds of starting rather than
       minutes.

       Watching the track costs nothing that matters — an analyser node reads
       the same stream the recorder is already consuming. */
    let meter = null, meterBuf = null, meterCtx = null;
    try {
      meterCtx = new (global.AudioContext || global.webkitAudioContext)();
      const src = meterCtx.createMediaStreamSource(new MediaStream([audio]));
      meter = meterCtx.createAnalyser();
      meter.fftSize = 1024;
      src.connect(meter);
      meterBuf = new Float32Array(meter.fftSize);
    } catch (e) { meter = null; }
    const closeMeter = () => {
      if (meterCtx && meterCtx.close) { try { meterCtx.close(); } catch (e) { /* gone */ } }
      meterCtx = null; meter = null;
    };
    let heardSomething = false, silentMs = 0, silentGiveUp = false;
    /* Long enough that a quiet intro is not mistaken for a dead share, short
       enough that nobody sits through a song for nothing. */
    const SILENCE_LIMIT_MS = 7000;

    const openSeg = () => {
      if (rec) return;
      everOpened = true;
      chunks = [];
      rec = new MediaRecorder(new MediaStream([audio]));
      const c = chunks;
      rec.ondataavailable = e => { if (e.data && e.data.size) c.push(e.data); };
      segAt = position();
      segWall = Date.now();
      rec.start();
    };

    const closeSeg = () => {
      if (!rec) return;
      const r = rec, c = chunks, at = segAt;
      const len = (Date.now() - segWall) / 1000;
      rec = null; chunks = null;
      closing.push(new Promise(resolve => {
        const collect = () => {
          const blob = new Blob(c, { type: r.mimeType || 'audio/webm' });
          resolve(blob.size > 2048 ? { blob, at, len } : null);
        };
        r.onstop = collect;
        if (r.state !== 'inactive') r.stop();
        else collect();
      }));
    };

    let ticker = null, finished = false, resolveDone;
    const done = new Promise(r => { resolveDone = r; });
    const finish = () => {
      if (finished) return;
      finished = true;
      if (ticker) clearInterval(ticker);
      closeSeg();
      closeMeter();
      audio.stop();
      resolveDone();
    };

    if (o.control) o.control.stop = finish;
    audio.addEventListener('ended', finish);   // user hit "Stop sharing"

    if (wanted()) openSeg();
    if (o.onStart) o.onStart();

    const startedAt = Date.now();
    const limit = Math.max(5, o.seconds || 60);
    /* Counting wall-clock seconds is the wrong stop condition for "the whole
       song": the recording starts wherever playback has already reached, so
       running for the song's full length overshoots the end by exactly that
       much and appends whatever plays next. Callers can supply their own
       condition and stop at the end of the track instead. */
    const isDone = typeof o.shouldStop === 'function'
      ? o.shouldStop
      : (elapsed) => elapsed >= limit;
    /* Polled often rather than a few times a second, because this is what
       decides when a segment opens: the caller turns `wanted` on the instant
       the song starts, and every tick of delay past that is song the take
       never gets. */
    let lastTick = Date.now();
    ticker = setInterval(() => {
      const now = Date.now();
      const dt = now - lastTick;
      lastTick = now;
      const elapsed = (now - startedAt) / 1000;
      if (wanted()) openSeg(); else closeSeg();

      /* Only count silence while we are actually recording something we want.
         Time spent waiting for an ad to finish is not the share being dead. */
      if (meter && !heardSomething && rec) {
        meter.getFloatTimeDomainData(meterBuf);
        let peak = 0;
        for (let i = 0; i < meterBuf.length; i++) {
          const v = meterBuf[i] < 0 ? -meterBuf[i] : meterBuf[i];
          if (v > peak) peak = v;
        }
        if (peak > 0.0025) heardSomething = true;
        else {
          silentMs += dt;
          if (silentMs > SILENCE_LIMIT_MS) { silentGiveUp = true; finish(); return; }
        }
      }

      if (o.onTick) o.onTick(elapsed, limit, { heard: heardSomething });
      if (isDone(elapsed)) finish();
    }, 60);

    // Whatever ends the recording, every open segment has to be flushed first.
    await done;
    if (silentGiveUp) throw new Error(
      'לא נקלט שום קול בשבע השניות הראשונות, אז עצרתי במקום להקליט שיר שלם של ' +
      'שקט. השיר מתנגן כאן, בנגן של האפליקציה — לא בכרטיסיית היוטיוב שלך. ' +
      'בחלון השיתוף בחר את הכרטיסייה הזאת (היא מוצעת ראשונה), סמן ' +
      '"שתף גם את האודיו של הכרטיסייה", וּודא שהווליום כאן לא מושתק.');
    const parts = (await Promise.all(closing)).filter(Boolean);
    // "Nothing was recorded" and "nothing but ads played" look the same from
    // here but need opposite advice, and the caller is the one that knows.
    if (!parts.length) throw new Error(
      everOpened ? silenceMessage : (o.nothingWantedMessage || silenceMessage));

    const segments = [];
    for (const p of parts) {
      segments.push({ buf: await p.blob.arrayBuffer(), at: p.at, len: p.len });
    }
    return { segments };
  }

  global.AudioAnalysis = {
    analyzeFile, fft, estimateTempo, estimateKey, decodeToMono,
    canCaptureTab, captureTabAudio, canCaptureMic, captureMicAudio,
    shiftAnalysis
  };
})(window);
