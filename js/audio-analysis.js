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
    if (!best.lag) return { bpm: 0, confidence: 0, beatLen: 0 };

    let bpm = 60 * envSr / best.lag;
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

  function detectChords(chroma, framesPerBeat, beatTimes) {
    const { t, names } = chordTemplates();
    const perBeat = [];
    for (let b = 0; b < beatTimes.length; b++) {
      const start = Math.floor(b * framesPerBeat);
      const end = Math.min(chroma.length, Math.floor((b + 1) * framesPerBeat));
      if (start >= chroma.length) break;
      const acc = new Array(12).fill(0);
      for (let f = start; f < end; f++) for (let i = 0; i < 12; i++) acc[i] += chroma[f][i];
      const norm = Math.hypot(...acc) || 1;
      for (let i = 0; i < 12; i++) acc[i] /= norm;
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

    p('מחשב עוצמות ואונסטים…');
    const { flux, rms, chroma, nFrames } = framePass(data, sr, FRAME, HOP);
    if (nFrames < 32) throw new Error('הקובץ קצר מדי לניתוח');
    const envSr = sr / HOP;

    p('מאתר קצב…');
    const tempo = estimateTempo(flux, envSr);
    if (!tempo.bpm) throw new Error('לא הצלחתי לזהות קצב');
    const firstBeat = estimatePhase(flux, envSr, tempo.beatLen);

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
    const key = estimateKey(mean);

    p('מחלץ אקורדים…');
    const framesPerBeat = tempo.beatLen * envSr;
    const chords = detectChords(chroma, framesPerBeat, beatTimes);

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
      confidence: {
        tempo: +tempo.confidence.toFixed(3),
        key: +key.confidence.toFixed(3)
      }
    };
  }

  global.AudioAnalysis = { analyzeFile, fft, estimateTempo, estimateKey, decodeToMono };
})(window);
