/* ============================================================
   lessons.js — learn chords and notes, with a speaking teacher
   Speech uses the Web Speech API. Hebrew voices exist on most
   platforms; when one isn't installed we fall back to the default
   voice rather than failing silently, and say so in the UI.
   Includes a Web Audio metronome + reference tones so a learner
   can hear the chord as well as see the fingering.
   ============================================================ */
(function (global) {
  'use strict';
  const MM = global.MM;

  /* ---------------- speech ---------------- */
  const Speech = (function () {
    const synth = global.speechSynthesis;
    let voices = [];
    let preferred = null;
    const listeners = [];

    function refresh() {
      if (!synth) return;
      voices = synth.getVoices() || [];
      preferred = voices.find(v => /^he/i.test(v.lang)) ||
        voices.find(v => /iw|hebrew/i.test(v.lang + v.name)) || null;
      listeners.forEach(f => f(!!preferred, voices.length));
    }
    if (synth) {
      refresh();
      synth.onvoiceschanged = refresh;
    }

    return {
      get supported() { return !!synth; },
      get hasHebrew() { return !!preferred; },
      onReady(f) { listeners.push(f); f(!!preferred, voices.length); },
      speak(text, opts) {
        if (!synth || !text) return null;
        opts = opts || {};
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (preferred) u.voice = preferred;
        u.lang = preferred ? preferred.lang : (opts.lang || 'he-IL');
        u.rate = opts.rate != null ? opts.rate : 0.95;
        u.pitch = opts.pitch != null ? opts.pitch : 1;
        u.volume = 1;
        if (opts.onend) u.onend = opts.onend;
        synth.speak(u);
        return u;
      },
      stop() { if (synth) synth.cancel(); },
      get speaking() { return synth ? synth.speaking : false; }
    };
  })();

  /* ---------------- audio: metronome + tones ---------------- */
  const Audio = (function () {
    let ctx = null;
    const ensure = () => {
      if (!ctx) ctx = new (global.AudioContext || global.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    };
    function click(accent) {
      const c = ensure();
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = accent ? 1600 : 1000;
      g.gain.setValueAtTime(accent ? .32 : .18, c.currentTime);
      g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + .06);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + .07);
    }
    const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);
    function tone(midi, dur, delay, gainV) {
      const c = ensure();
      const t0 = c.currentTime + (delay || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle';
      o.frequency.value = midiToFreq(midi);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gainV || .16, t0 + .02);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + (dur || 1.1));
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + (dur || 1.1) + .05);
    }
    /** Play a chord: block (all together) or strum (rolled). */
    function playChord(name, mode) {
      const v = MM.pianoVoicing(name, 4);
      if (!v) return;
      const notes = [v.bass.midi].concat(v.keys.map(k => k.midi));
      notes.forEach((m, i) => tone(m, 1.5, mode === 'strum' ? i * 0.055 : 0, .13));
    }
    let metroTimer = null;
    function startMetronome(bpm, sig, onBeat) {
      stopMetronome();
      let i = 0;
      const interval = 60000 / bpm;
      const step = () => {
        const accent = i % (sig || 4) === 0;
        click(accent);
        if (onBeat) onBeat(i, accent);
        i++;
      };
      step();
      metroTimer = setInterval(step, interval);
    }
    function stopMetronome() { if (metroTimer) { clearInterval(metroTimer); metroTimer = null; } }
    return { click, tone, playChord, startMetronome, stopMetronome, ensure, get running() { return !!metroTimer; } };
  })();

  /* ---------------- lesson content ---------------- */
  const GUITAR_LESSONS = [
    {
      id: 'g1', title: 'ארבעת האקורדים הפתוחים הראשונים',
      level: 'מתחיל', instrument: 'guitar',
      chords: ['Em', 'Am', 'C', 'G'],
      intro: 'נתחיל מארבעה אקורדים פתוחים. אקורד פתוח נקרא כך כי חלק מהמיתרים מצלצלים בלי שאף אצבע לוחצת עליהם. שים לב למספרים על העיגולים — הם אומרים איזו אצבע לוחצת: אחת זו האצבע המורה, שתיים האמה, שלוש הקמיצה וארבע הזרת.',
      tips: [
        'לחץ עם קצה האצבע, ממש ליד הפרט — לא באמצע בין שני פרטים. ככה הצליל יוצא נקי בלי זמזום.',
        'האגודל נשאר מאחורי צוואר הגיטרה, בערך מול האצבע האמצעית.',
        'אם מיתר מזמזם, בדוק שהאצבע לא נוגעת במיתר השכן.'
      ]
    },
    {
      id: 'g2', title: 'מעבר בין אקורדים בלי לעצור',
      level: 'מתחיל', instrument: 'guitar',
      chords: ['Am', 'C'],
      intro: 'הסוד במעבר חלק הוא אצבעות עוגן. בין לה מינור לדו מז\'ור, האצבע הראשונה כמעט לא זזה. תרגל את המעבר לאט עם המטרונום, ורק אחר כך תאיץ.',
      tips: [
        'זהה אצבע שנשארת באותו מקום בשני האקורדים — היא העוגן שלך.',
        'תרגל מעבר אחד בלבד, ארבע פעמים בדקה, לפני שאתה מוסיף אקורד שלישי.',
        'עדיף מעבר איטי ונקי ממעבר מהיר ומזמזם.'
      ]
    },
    {
      id: 'g3', title: 'אקורדי ברה — פה מז\'ור',
      level: 'מתקדם', instrument: 'guitar',
      chords: ['F', 'Bm', 'Fm'],
      intro: 'אקורד ברה הוא אקורד שבו האצבע המורה שוכבת שטוחה על כל המיתרים ויוצרת nut מלאכותי. זה האתגר הראשון האמיתי בגיטרה, וזה עניין של טכניקה — לא של כוח.',
      tips: [
        'גלגל את האצבע המורה קצת על הצד שלה — הצד קשה יותר מהבטן הרכה ולוחץ טוב יותר.',
        'קרב את האגודל למרכז גב הצוואר ומשוך את המרפק פנימה לגוף.',
        'תרגל בפרט 5 קודם — שם המיתרים רכים יותר — ורק אז רד לפרט 1.'
      ]
    },
    {
      id: 'g4', title: 'אקורדי שביעית ובלוז',
      level: 'ביניים', instrument: 'guitar',
      chords: ['E7', 'A7', 'B7', 'Am7'],
      intro: 'אקורד שביעית מוסיף צליל אחד לאקורד הרגיל ומייד נותן צבע של בלוז. שים לב כמה שינוי קטן באצבע אחת משנה את כל האופי.',
      tips: [
        'השווה בין מי מז\'ור למי שביעית — רק אצבע אחת משתנה.',
        'רצף בלוז קלאסי: מי שביעית, לה שביעית, סי שביעית.',
        'נגן אותם עם גרוב מתנדנד (shuffle) ולא ישר.'
      ]
    }
  ];

  const PIANO_LESSONS = [
    {
      id: 'p1', title: 'משולשים ראשונים ביד ימין',
      level: 'מתחיל', instrument: 'piano',
      chords: ['C', 'F', 'G', 'Am'],
      intro: 'אקורד בסיסי בפסנתר בנוי משלושה צלילים — משולש. ביד ימין נשתמש באצבע אחת, שלוש וחמש: האגודל, האמה והזרת. שמור על אצבעות מעוגלות ופרק כף יד רפוי.',
      tips: [
        'האצבעות מעוגלות כאילו אתה מחזיק תפוח קטן.',
        'הזרוע מקבילה לרצפה, הגב זקוף — זה מונע מתח.',
        'נגן את שלושת הצלילים בדיוק יחד; אם אחד מאחר, האקורד נשמע מרוח.'
      ]
    },
    {
      id: 'p2', title: 'יד שמאל — בס ומרווח חמישית',
      level: 'מתחיל', instrument: 'piano',
      chords: ['C', 'G', 'Am', 'F'],
      intro: 'יד שמאל מחזיקה את הבס. ברוב השירים מספיק שתנגן את צליל היסוד באוקטבה נמוכה, ותן ליד ימין את ההרמוניה. זה מיד נשמע מלא.',
      tips: [
        'יד שמאל על הצליל הנמוך, יד ימין על המשולש — שתי שכבות נפרדות.',
        'נגן את הבס בדיוק על הפעמה הראשונה של כל תיבה.',
        'אל תלחץ חזק — עוצמה מגיעה ממשקל הזרוע, לא מהאצבעות.'
      ]
    },
    {
      id: 'p3', title: 'היפוכים — לנוע בלי לקפוץ',
      level: 'ביניים', instrument: 'piano',
      chords: ['C', 'F', 'G'],
      intro: 'היפוך הוא אותו אקורד עם סדר צלילים שונה. במקום לקפוץ עם כל היד בין אקורדים רחוקים, אתה מוצא היפוך שקרוב למקום שבו היד כבר נמצאת. זה סוד הנגינה הזורמת.',
      tips: [
        'חפש את הצליל המשותף בין שני אקורדים והשאר עליו אצבע.',
        'תנועה של פחות מחמישה סנטימטרים בין אקורדים — זה היעד.',
        'תרגל את אותו רצף בשלושה היפוכים שונים.'
      ]
    },
    {
      id: 'p4', title: 'קריאת תווים — הצלילים על הסולם',
      level: 'מתחיל', instrument: 'piano',
      chords: ['C', 'Dm', 'Em', 'F', 'G', 'Am'],
      intro: 'הקלידים חוזרים על עצמם כל שבעה קלידים לבנים. מצא את הזוג של שני קלידים שחורים — הקליד הלבן שמשמאלו הוא דו. משם הכול נפתח: דו, רה, מי, פה, סול, לה, סי.',
      tips: [
        'זוג שחורים — דו נמצא משמאל לזוג. שלושה שחורים — פה נמצא משמאל לשלישייה.',
        'שיר את שם הצליל בזמן שאתה מנגן אותו. זה מקצר את הלמידה בחצי.',
        'התחל תמיד מדו באמצע הפסנתר.'
      ]
    }
  ];

  /** Build the spoken script for a lesson step. */
  function speakChordScript(chord, instrument) {
    const heName = chordNameHe(chord);
    if (instrument === 'piano') {
      const v = MM.pianoVoicing(chord, 4);
      if (!v) return heName;
      const keys = v.keys.map(k => `${MM.PITCHES_HE[k.note]} עם אצבע ${k.finger}`).join(', ');
      return `${heName}. ביד ימין: ${keys}. ביד שמאל, הבס ${MM.PITCHES_HE[v.bass.note]}.`;
    }
    const f = MM.guitarFingering(chord);
    if (!f) return heName;
    let s = `${heName}. `;
    if (f.barre) {
      s += `זה אקורד ברה. האצבע המורה שוכבת שטוחה על כל המיתרים בפרט ${f.baseFret}. `;
    }
    const parts = [];
    f.shape.forEach((fr, i) => {
      if (typeof fr === 'number' && fr > 0 && f.fingers[i] > 0) {
        if (f.barre && fr === f.baseFret) return;
        parts.push(`אצבע ${f.fingers[i]} על מיתר ${6 - i} בפרט ${fr}`);
      }
    });
    if (parts.length) s += parts.join(', ') + '. ';
    const open = f.shape.filter(x => x === 0).length;
    const muted = f.shape.filter(x => x === 'x').length;
    if (open) s += `${open} מיתרים מצלצלים פתוחים. `;
    if (muted) s += `${muted} מיתרים מושתקים ולא מנוגנים.`;
    return s;
  }

  function chordNameHe(chord) {
    const p = MM.parseChord(chord);
    if (!p) return chord;
    const root = MM.PITCHES_HE[p.root] || p.root;
    const qual = { '': ' מז׳ור', 'm': ' מינור', '7': ' שביעית', 'm7': ' מינור שביעית',
      'maj7': ' מז׳ור שביעית', 'sus4': ' סוס ארבע', 'sus2': ' סוס שתיים',
      'dim': ' מוקטן', 'aug': ' מוגדל' }[p.suffix] || '';
    return root + qual;
  }

  /** A short spoken intro for a whole lesson. */
  function lessonScript(lesson) {
    return `${lesson.title}. ${lesson.intro}`;
  }

  global.Lessons = {
    Speech, Audio, GUITAR_LESSONS, PIANO_LESSONS,
    speakChordScript, chordNameHe, lessonScript,
    all() { return GUITAR_LESSONS.concat(PIANO_LESSONS); }
  };
})(window);
