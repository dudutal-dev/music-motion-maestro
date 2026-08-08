/* ============================================================
   app.js — UI, routing, and the wiring that ties it together
   ============================================================ */
(function (global) {
  'use strict';
  const MM = global.MM, A = global.Analysis, P = global.Player,
    PF = global.Performer, CH = global.Characters, LS = global.Lessons,
    AA = global.AudioAnalysis;
  const Store = MM.Store;

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = t => {
    if (!isFinite(t) || t < 0) t = 0;
    return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  };

  const state = {
    route: 'home',
    filter: { genre: null, artist: null, q: '' },
    currentTrackId: null,
    performer: null,
    stageChar: null,
    stageMode: 'anim',
    chordInst: 'guitar',
    posterGroups: ['major', 'minor', 'seventh', 'sus'],
    posterChar: null,
    stageBackdrop: 'none',      // pure black — matches frames shot on black
    stageBlend: 'screen',
    // null = decide on first use. On a wide screen the settings live in their
    // own column and cost the stage nothing, so they stay open; on a phone they
    // stack above it and push the performance off the screen, so they fold.
    stageSettings: null,
    stageFocus: false,
    /* The stage holds the character's id, not the character.
       It used to keep the object, and switching instrument replaced it with a
       plain copy carrying the new instrument. From then on the stage was
       looking at a snapshot: attaching an image to that character afterwards
       changed nothing it could see, so the realistic view stayed greyed out
       with "no image attached" no matter what you did. The instrument override
       lives on its own now, and the character is always read fresh. */
    stageCharId: null,
    stageInst: null,        // null = follow whatever the character plays
    transpose: 0,
    capo: 0,
    loop: null,
    lastBar: -1,
    navOpen: false,
    lastBeatIndex: -1,
    activeLesson: null
  };

  /* ---------------- toast ---------------- */
  let toastTimer;
  function toast(msg, isErr) {
    const old = $('.toast'); if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2600);
  }

  /* ---------------- modal ---------------- */
  function modal(title, bodyHtml, footHtml) {
    closeModal();
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div class="modal-title">${title}</div>
        <button class="btn btn-icon btn-ghost" data-action="close-modal" aria-label="סגור">✕</button></div>
      <div class="modal-body">${bodyHtml}</div>
      ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ''}
    </div>`;
    back.addEventListener('click', e => { if (e.target === back) closeModal(); });
    document.body.appendChild(back);
    return back;
  }
  const closeModal = () => { const m = $('.modal-back'); if (m) m.remove(); };

  /* ============================================================
     Views
     ============================================================ */
  const icons = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5 12 3l9 7.5V21H3z"/></svg>',
    guide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M9 8h6M9 12h4"/></svg>',
    lib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h4v16H4zM11 4h3v16h-3zM17.5 5l3 15"/></svg>',
    stage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="3"/><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/></svg>',
    chars: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20v-1.6A4.9 4.9 0 0 1 7.4 13.5h3.2a4.9 4.9 0 0 1 4.9 4.9V20"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6.1M18.5 13.9a4.9 4.9 0 0 1 3 4.5V20"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18" cy="18" r="2.5"/></svg>',
    chords: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M12 3v18M16 3v18M4 9h16M4 15h16"/></svg>',
    poster: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    lessons: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6.5S9.5 4 6 4H3v13h3c3.5 0 6 2 6 2s2.5-2 6-2h3V4h-3c-3.5 0-6 2.5-6 2.5z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14.5H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 8.5a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 6h2.5v12H7zM19 6v12l-9-6z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 6h-2.5v12H17zM5 6v12l9-6z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
  };

  function renderSidebar() {
    const nav = [
      ['home', 'ראשי', icons.home],
      ['guide', 'מדריך עבודה', icons.guide],
      ['library', 'הספרייה שלי', icons.lib],
      ['stage', 'במה חיה', icons.stage],
      ['chart', 'תרשים אקורדים', icons.chart],
      ['characters', 'דמויות', icons.chars],
      ['chords', 'ספריית אקורדים', icons.chords],
      ['poster', 'הרכבת פוסטר', icons.poster],
      ['lessons', 'שיעורים', icons.lessons],
      ['settings', 'הגדרות', icons.settings]
    ];
    const s = Store.state;
    const analyzed = s.tracks.filter(t => t.analysis && t.analysis.bpm).length;
    $('#sidebar').innerHTML = `
      <div class="brand">
        <div class="brand-mark">M</div>
        <div><div class="brand-name">MAESTRO</div><div class="brand-sub">Studio</div></div>
      </div>
      <div class="nav-group">
        ${nav.map(([r, label, ic]) => `
          <button class="nav-item ${state.route === r ? 'active' : ''}" data-route="${r}">
            ${ic}<span>${label}</span></button>`).join('')}
      </div>
      <div class="nav-group">
        <div class="nav-label">פעולות</div>
        <button class="nav-item" data-action="add-track">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          <span>הוסף שיר</span></button>
        <button class="nav-item" data-action="new-character">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          <span>דמות חדשה</span></button>
      </div>
      <div class="sidebar-foot">
        <div class="mini-stat"><span>שירים</span><b>${s.tracks.length}</b></div>
        <div class="mini-stat"><span>מנותחים</span><b>${analyzed}</b></div>
        <div class="mini-stat"><span>דמויות</span><b>${s.characters.length}</b></div>
      </div>`;
  }

  const trackCard = t => `
    <div class="card" data-track="${t.id}">
      <div class="card-art">
        <img src="${MM.thumbUrl(t.videoId)}" alt="" loading="lazy">
        ${t.analysis && t.analysis.bpm ? `<span class="badge-analyzed">${Math.round(t.analysis.bpm)} BPM</span>` : ''}
        <button class="card-play" data-action="play-track" data-id="${t.id}" aria-label="נגן">${icons.play}</button>
      </div>
      <div class="card-title">${esc(t.title)}</div>
      <div class="card-meta">${esc(t.artist || '—')}${t.genre ? ' · ' + esc(t.genre) : ''}</div>
    </div>`;

  function filteredTracks() {
    const { genre, artist, q } = state.filter;
    return Store.state.tracks.filter(t => {
      if (genre && t.genre !== genre) return false;
      if (artist && t.artist !== artist) return false;
      if (q) {
        const hay = `${t.title} ${t.artist} ${t.genre} ${t.album || ''}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }

  function viewHome() {
    const s = Store.state;
    if (!s.tracks.length) {
      return `<div class="page">${pageHead('ספריית המוזיקה', 'הוסף קישור יוטיוב, נתח אותו, וצפה בדמות מנגנת אותו בסינכרון מלא')}
        <div class="empty">
          <div class="empty-icon">🎵</div>
          <h3>הספרייה ריקה</h3>
          <p>הוסף שיר ראשון — הדבק קישור יוטיוב, סווג לפי ז׳אנר ואמן, ונתח אותו כדי לקבל BPM, סולם ואקורדים.</p>
          <button class="btn btn-primary" data-action="add-track">הוסף שיר ראשון</button>
        </div></div>`;
    }
    const recent = s.tracks.slice(0, 12);
    const analyzed = s.tracks.filter(t => t.analysis && t.analysis.bpm).slice(0, 12);
    const genres = [...new Set(s.tracks.map(t => t.genre).filter(Boolean))];
    return `<div class="page">
      ${pageHead('ערב טוב', 'המוזיקה שלך, מנותחת ומוכנה לבמה')}
      ${genres.length ? `<div class="chips">${genres.map(g =>
        `<button class="chip" data-genre="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : ''}
      <div class="section-head"><div class="section-title">נוספו לאחרונה</div>
        <button class="section-more" data-route="library">הצג הכל</button></div>
      <div class="grid">${recent.map(trackCard).join('')}</div>
      ${analyzed.length ? `
        <div class="section-head"><div class="section-title">מוכנים לבמה</div>
          <button class="section-more" data-route="stage">לבמה החיה</button></div>
        <div class="grid">${analyzed.map(trackCard).join('')}</div>` : ''}
    </div>`;
  }

  const pageHead = (title, sub) =>
    `<div class="page-head"><h1 class="page-title">${esc(title)}</h1>
     ${sub ? `<div class="page-sub">${esc(sub)}</div>` : ''}</div>`;

  function viewLibrary() {
    const s = Store.state;
    const genres = [...new Set(s.tracks.map(t => t.genre).filter(Boolean))];
    const artists = [...new Set(s.tracks.map(t => t.artist).filter(Boolean))];
    const list = filteredTracks();
    return `<div class="page">
      ${pageHead('הספרייה שלי', `${s.tracks.length} שירים · ${s.tracks.filter(t => t.analysis && t.analysis.bpm).length} מנותחים`)}
      <div class="chips">
        <button class="chip ${!state.filter.genre ? 'active' : ''}" data-genre="">כל הז׳אנרים</button>
        ${genres.map(g => `<button class="chip ${state.filter.genre === g ? 'active' : ''}" data-genre="${esc(g)}">${esc(g)}</button>`).join('')}
      </div>
      ${artists.length > 1 ? `<div class="chips" style="margin-top:10px">
        <button class="chip ${!state.filter.artist ? 'active' : ''}" data-artist="">כל האמנים</button>
        ${artists.map(a => `<button class="chip ${state.filter.artist === a ? 'active' : ''}" data-artist="${esc(a)}">${esc(a)}</button>`).join('')}
      </div>` : ''}
      <div class="section-head"><div class="section-title">${list.length} שירים</div>
        <button class="section-more" data-action="add-track">+ הוסף</button></div>
      ${list.length ? `<div class="rows">${list.map((t, i) => trackRow(t, i)).join('')}</div>`
        : Store.state.tracks.length
          ? `<div class="empty"><p>אין תוצאות לסינון הזה.</p></div>`
          : `<div class="empty"><div class="empty-icon">🎧</div><h3>הספרייה ריקה</h3>
             <p>הוסף שיר מיוטיוב — או טען את ספריית התרגול ותראה את הבמה עובדת מיד,
                בלי קישור ובלי רשת.</p>
             <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
               <button class="btn btn-primary" data-action="add-track">+ הוסף שיר</button>
               <button class="btn" data-action="load-practice">טען ספריית תרגול</button>
             </div></div>`}
    </div>`;
  }

  function trackRow(t, i) {
    const a = t.analysis;
    const on = state.currentTrackId === t.id;
    return `<div class="row ${on ? 'playing' : ''}" data-track="${t.id}">
      <div class="row-idx">${i + 1}</div>
      <img class="row-art" src="${MM.thumbUrl(t.videoId)}" alt="" loading="lazy">
      <div style="min-width:0">
        <div class="row-title">${esc(t.title)}</div>
        <div class="row-artist">${esc(t.artist || '—')}${t.album ? ' · ' + esc(t.album) : ''}</div>
      </div>
      <div class="row-analysis">
        ${a && a.bpm ? `<span class="pill on">${Math.round(a.bpm)} BPM</span>
          ${MM.keyLabel(a) ? `<span class="pill on">${esc(MM.keyLabel(a))}</span>` : ''}`
        : `<span class="pill">לא נותח</span>`}
      </div>
      <div class="row-tag">${esc(t.genre || '')}</div>
      <div class="row-acts">
        <button class="btn btn-sm btn-ghost" data-action="analyze" data-id="${t.id}">
          ${a && a.bpm ? 'ערוך' : 'נתח'}</button>
        <button class="btn btn-icon btn-ghost" data-action="del-track" data-id="${t.id}"
          title="הסר מהספרייה" aria-label="הסר מהספרייה">🗑</button>
      </div>
    </div>`;
  }

  /* ---------------- stage ---------------- */
  /** Entering the stage with nothing selected is a dead end — pick the first
   *  analyzed track and cue it so there's always something to look at. */
  /**
   * Keeps the stage following the song that is actually loaded in the player.
   *
   * This used to return as soon as any track was selected, without checking
   * what the player held. Analysing a track loads that video, so after
   * analysing a second song the player sat on song B while the stage still
   * followed song A — the character fretted one song's chords over another
   * song's audio, in perfect sync with nothing.
   */
  /**
   * Repairs a track whose chords stop before the song does.
   *
   * Analyses saved before the progression was carried forward still end
   * partway through, and re-analysing a four-minute song to fix that is a poor
   * thing to ask. Extending on first use costs nothing and is persisted, so it
   * happens once per track rather than on every render.
   */
  function ensureChordCoverage(t) {
    const a = t && t.analysis;
    if (!a || !a.bpm || !a.chords || !a.chords.length) return;
    const songLen = Math.max(a.duration || 0, t.id === state.currentTrackId ? (P.duration || 0) : 0);
    if (!songLen) return;
    if (a.chords[a.chords.length - 1].end >= songLen - 0.5) return;
    A.extendChords(a, songLen);
    if (songLen > (a.duration || 0)) a.duration = +songLen.toFixed(2);
    Store.updateTrack(t.id, { analysis: a });
  }

  /** The character on stage, read fresh so later edits are always visible. */
  function stageChar() {
    return state.stageCharId ? Store.getCharacter(state.stageCharId) : null;
  }
  /** The instrument being played: an explicit override, else the character's. */
  function stageInstrument() {
    if (state.stageInst) return state.stageInst;
    const c = stageChar();
    return c && c.instrument === 'piano' ? 'piano' : 'guitar';
  }

  function ensureStageTrack() {
    const cur = state.currentTrackId ? Store.getTrack(state.currentTrackId) : null;

    if (P.videoId) {
      const loaded = Store.state.tracks.find(t => t.videoId === P.videoId);
      if (loaded && (!cur || cur.videoId !== P.videoId)) {
        state.currentTrackId = loaded.id;
        ensureChordCoverage(loaded);
        state.lastBeatIndex = -1;
        lastReadoutChord = null;
        return;
      }
    }
    if (cur) { ensureChordCoverage(cur); return; }

    const first = Store.state.tracks.find(t => t.analysis && t.analysis.bpm) || Store.state.tracks[0];
    if (!first) return;
    state.currentTrackId = first.id;
    ensureChordCoverage(first);
    state.lastBeatIndex = -1;
    lastReadoutChord = null;
    // A practice track has no video, and load() ignores an empty id — walking
    // straight to the stage after a reload would leave the player holding
    // nothing, so pressing play did nothing at all.
    if (first.videoId) P.load(first.videoId, false);   // cue, don't autoplay
    else P.loadSilent((first.analysis && first.analysis.duration) || 0);
  }

  /**
   * Focus mode: the stage and the chord, nothing else.
   *
   * The settings column had grown past a screenful, so on a phone the stage
   * itself was scrolled away by the controls that configure it. Here everything
   * but the performance is taken out of the layout — same behaviour on desktop
   * and mobile, since the complaint applies to both.
   *
   * Real fullscreen is requested when the browser allows it, but the layout
   * does not depend on that: it is a class on the shell, so it still works if
   * the request is refused, which iOS Safari does on non-video elements.
   */
  function setStageFocus(on) {
    state.stageFocus = on;
    document.body.classList.toggle('stage-focus', on);
    try {
      if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (!on && document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (e) { /* layout mode stands on its own */ }
    render();
  }

  /* ---------------- working guide ----------------
     A manual that reads the user's own data. A generic "how to use this"
     page makes you work out where you are in it; this one already knows,
     marks each step done or not, says what is missing, and links straight
     to the screen that fixes it. */
  function viewGuide() {
    const tracks = Store.state.tracks;
    const chars = Store.state.characters;
    const analysed = tracks.filter(t => t.analysis && t.analysis.bpm);
    const withArt = chars.filter(c => c.portrait);
    const posterN = Object.keys(posterImages).length;
    const firstUnanalysed = tracks.find(t => !(t.analysis && t.analysis.bpm));
    const stageReady = analysed.length && chars.length;

    /** One step: a state, a reason, and the button that resolves it. */
    const step = (n, title, done, body, action) => `
      <div class="guide-step ${done ? 'done' : ''}">
        <div class="guide-num">${done ? '✓' : n}</div>
        <div class="guide-body">
          <h3>${title}</h3>
          ${body}
          ${action || ''}
        </div>
      </div>`;
    const go = (route, label) => `<button class="btn btn-sm" data-route="${route}">${label}</button>`;

    return `<div class="page">
      ${pageHead('מדריך עבודה', 'הדרך מקישור יוטיוב עד דמות שמנגנת את השיר')}

      <div class="panel" style="margin-bottom:22px">
        <div class="panel-title">איך האפליקציה בנויה</div>
        <div class="panel-desc">
          שני דברים נפרדים מרכיבים את מה שאתה רואה על הבמה, וכדאי להכיר את ההבדל:
          <br><br>
          <b>הדיוק מחושב.</b> האקורדים, מיקום האצבעות, הדיאגרמות ורשת הביטים —
          האפליקציה מחשבת אותם בעצמה ומאמתת מול תורת המוזיקה. לכן הם נכונים תמיד.
          <br><br>
          <b>המראה מיוצר.</b> הדמות הריאליסטית מגיעה מתמונות שאתה מייצר בכלי חיצוני.
          מודלי תמונות לא מדייקים באצבוע — ולכן הדיוק אף פעם לא נשען עליהן.
          התמונות נותנות את המראה, החישוב נותן את הנכונות.
        </div>
      </div>

      ${step(1, 'הוסף שיר', tracks.length > 0, `
        <p>הדבק קישור יוטיוב — <b>שם השיר, האמן והעטיפה מתמלאים לבד</b>.</p>
        <div class="guide-state">${tracks.length
          ? `יש ${tracks.length} שירים בספרייה.`
          : 'עדיין אין שירים.'}</div>`,
        `<button class="btn btn-sm" data-action="add-track">+ הוסף שיר</button>
         <button class="btn btn-sm" data-action="load-practice">טען ספריית תרגול</button>
         <div class="hint" style="margin-top:8px">ספריית התרגול היא 8 פרוגרסיות סטנדרטיות עם
           אקורדים מאומתים — בלי קישור, בלי פרסומות ובלי רשת. הבמה מריצה אותן על שעון פנימי
           עם מטרונום, כדי שיהיה מה לראות עוד לפני שהוספת שיר.</div>`)}

      ${step(2, 'נתח את השיר', analysed.length > 0, `
        <p><b>זה השער.</b> בלי BPM ואקורדים הבמה תישאר ריקה — אין למה לסנכרן.</p>
        <p>ארבעה מסלולים, לפי מה שיש לך:</p>
        <ul class="guide-list">
          <li><b>🔴 הקלט מהשיר · הכרטיסייה</b> — הכי מדויק. השיר מתנגן והאפליקציה
            מקליטה את הקול של הכרטיסייה. <b>Chrome/Edge במחשב בלבד.</b>
            חובה לסמן "שתף גם את האודיו של הכרטיסייה" — זה הכשל הנפוץ ביותר.</li>
          <li><b>🎤 הקלט מהשיר · מיקרופון</b> — <b>עובד גם באייפון</b>. השיר מתנגן
            ברמקול והאפליקציה מקשיבה. קצב וסולם יוצאים טוב, אקורדים פחות.</li>
          <li><b>🎧 קובץ אודיו</b> — אם יש לך mp3.</li>
          <li><b>ניתוח מונחה</b> — הקשת קצב + פרוגרסיה ידנית. עובד בכל מקום.</li>
        </ul>
        <p><b>כמה להקליט.</b> הפרוגרסיה חוזרת על עצמה, ולכן דקה מספיקה לרוב השירים.
          <b>"כל השיר"</b> מקליט עד הסוף בפועל — בלי הגבלת זמן, בלי תקרה בשניות.
          מה שלא נמדד מושלם לפי המחזור ומסומן על הבמה <b>משוער</b> ולא <b>מדוד</b>,
          כדי שלא תבלבל השערה עם מדידה.</p>
        <p><b>פרסומות.</b> אם יוטיוב מכניס פרסומת, האפליקציה מזהה אותה, עוצרת את
          ההקלטה ואת שעון השיר, וממשיכה לבד כשהשיר חוזר — בדיוק מאותו מקום.
          הקול של הפרסומת לא נכנס לניתוח, והאקורדים שאחריה לא זזים.
          אין צורך לעשות כלום, רק לא לסגור את החלון.</p>
        <div class="guide-state">${analysed.length
          ? `${analysed.length} מתוך ${tracks.length} שירים מנותחים.`
          : 'אף שיר לא נותח עדיין.'}</div>`,
        firstUnanalysed
          ? `<button class="btn btn-sm" data-action="analyze" data-id="${firstUnanalysed.id}">נתח את "${esc(firstUnanalysed.title)}"</button>`
          : go('library', 'לספרייה'))}

      ${step(3, 'צור דמות', chars.length > 0, `
        <p>נועלים דמות פעם אחת והיא משמשת לכל שיר.</p>
        <p><b>צרף לה תמונה</b> — זה מה שפותח את התצוגה הריאליסטית בבמה.
        בלי תמונה תקבל רק את האנימציה.</p>
        <div class="guide-state">${chars.length
          ? `${chars.length} דמויות · ${withArt.length} עם תמונה מצורפת.`
          : 'עדיין אין דמויות.'}</div>`,
        `<button class="btn btn-sm" data-action="new-character">+ דמות חדשה</button> ${chars.length ? go('characters', 'לדמויות') : ''}`)}

      ${step(4, 'הפק פרומפטים לאקורדים', posterN > 0, `
        <p>מ<b>הרכבת פוסטר</b> → <b>קבל פרומפטים לאקורדים שנבחרו</b>. מקבלים פרומפט
        לכל אקורד, עם אותה דמות נעולה בכל אחד — רק היד משתנה.</p>
        <p><b>לתמונות שיגיעו לבמה:</b> בחר לדמות רקע <b>"רקע שחור נקי"</b>.
        הבמה ממזגת שחור אל תוך הרקע שלה בלי לחתוך כלום — התוצאה הכי נקייה.</p>
        <div class="guide-state">${posterN
          ? `${posterN} תמונות אקורד שמורות.`
          : 'עדיין לא שובצו תמונות.'}</div>`,
        go('poster', 'להרכבת פוסטר'))}

      ${step(5, 'הרכב את הפוסטר', posterN >= 4, `
        <p>גוררים את התמונות לתאים. שם האקורד והדיאגרמה <b>נצרבים על כל תא</b> —
        שם חי הדיוק, לא בתמונה.</p>
        <p><b>וזה גם מאגר הפריימים של הבמה:</b> ככל שהפוסטר מלא יותר, כך הדמות
        מתחלפת נכון ליותר אקורדים. לשיר טיפוסי מספיקות 4 תמונות.</p>
        <p>אם הרקע לא שחור — <b>"הסר רקע מכולן"</b> חותך אותו. יש ביטול.</p>
        <div class="guide-state">${posterN >= 4
          ? `${posterN} תמונות — מספיק לשיר שלם.`
          : `${posterN} תמונות. מומלץ לפחות 4.`}</div>`,
        go('poster', 'לפוסטר'))}

      ${step(6, 'הבמה החיה', !!stageReady, `
        <p>בוחרים דמות, כלי, ולוחצים נגן.</p>
        <ul class="guide-list">
          <li><b>⛶ מסך מלא</b> — רק ההופעה והאקורד. יוצאים ב-Esc.</li>
          <li><b>🖼️ דמות ריאליסטית</b> — נפתח רק אם צירפת תמונה לדמות.</li>
          <li><b>שילוב בתמונה</b> — למי שהתמונות שלו על רקע שחור.</li>
          <li><b>רקע הבמה</b> — הסצנה שנשארת קבועה בזמן שהנגן מתחלף.</li>
        </ul>
        <p><b>איך יודעים שזה עובד:</b> ב-F האצבע המורה נשכבת לרוחב (ברה);
        הזרוע נעה אחרת בין אקורד לאקורד; ההחלפה נופלת בדיוק על ההחלפה ב-HUD.
        מקדים או מאחר? ניתוח → <b>היסט לביט הראשון</b>.</p>
        <div class="guide-state">${stageReady
          ? 'מוכן — יש שיר מנותח ודמות.'
          : `חסר: ${[!analysed.length && 'שיר מנותח', !chars.length && 'דמות'].filter(Boolean).join(' ו')}.`}</div>`,
        go('stage', 'לבמה החיה'))}

      ${step(7, 'לנגן וללמוד', false, `
        <p><b>תרשים אקורדים</b> — השיר נפרס לתיבות, התיבה הנוכחית נדלקת בזמן אמת,
        ולחיצה על סקשן מריצה אותו בלולאה. יש טרנספוזיציה וקאפו.</p>
        <p><b>שיעורים</b> — 8 שיעורים עם מטרונום, נגינת האקורד והקראה בעברית.</p>`,
        `${go('chart', 'לתרשים')} ${go('lessons', 'לשיעורים')}`)}

      ${step(8, 'גבה', false, `
        <p>הכול נשמר <b>בדפדפן הזה בלבד</b>. הגיבוי הוא הדבר היחיד שעובר בין מכשירים —
        והוא כולל גם את תמונות הפוסטר, ולכן הקובץ כבד.</p>
        <p>סדר מומלץ: לשבץ תמונות → לרענן פעם אחת כדי לוודא שהן חזרו → ואז לייצא.</p>`,
        go('settings', 'להגדרות'))}
    </div>`;
  }

  function viewStage() {
    if (state.stageSettings === null) state.stageSettings = window.innerWidth >= 1080;
    const t = state.currentTrackId ? Store.getTrack(state.currentTrackId) : null;
    const chars = Store.state.characters;
    const analyzed = t && t.analysis && t.analysis.bpm;
    return `<div class="page">
      <div class="stage-head">
        ${pageHead('הבמה החיה', t
          ? `מנגן: ${esc(t.title)}${t.artist ? ' · ' + esc(t.artist) : ''}`
          : 'דמות שמנגנת את השיר — האקורדים, הידיים והתנועה נעולים למוזיקה')}
        <button class="btn btn-sm" data-action="stage-focus" ${analyzed ? '' : 'disabled'}>⛶ מסך מלא</button>
      </div>
      <div class="stage-wrap">
        <div>
          <div class="stage" id="stage">
            ${analyzed ? '' : `<div class="stage-empty">
              <div class="empty-icon">🎸</div>
              <h3>${t ? 'השיר עוד לא נותח' : 'לא נבחר שיר'}</h3>
              <p>${t ? 'נתח את השיר כדי לקבל BPM ואקורדים — בלי זה אי אפשר לסנכרן את הידיים.'
                : 'בחר שיר מהספרייה ונתח אותו כדי להעלות את הדמות לבמה.'}</p>
              ${t ? `<button class="btn btn-primary" data-action="analyze" data-id="${t.id}">נתח עכשיו</button>`
                : `<button class="btn btn-primary" data-route="library">לספרייה</button>`}
            </div>`}
            ${analyzed ? `<button class="stage-exit" data-action="stage-unfocus" aria-label="צא ממסך מלא">✕</button>` : ''}
            ${analyzed ? `<div class="stage-chordcard" id="stage-chordcard">
              <div class="scc-chord" id="scc-chord">—</div>
              <div class="scc-diagram" id="scc-diagram"></div>
              <div class="scc-hand" id="scc-hand"></div>
            </div>` : ''}
            ${analyzed ? `<div class="stage-hud">
              <span class="hud-pill">BPM <b id="hud-bpm">${Math.round(t.analysis.bpm)}</b></span>
              <span class="hud-pill">אקורד <b id="hud-chord">—</b></span>
              <span class="hud-pill">תיבה <b id="hud-bar">—</b></span>
              <span class="hud-pill" id="hud-section">—</span>
              ${t.analysis.analysedTo ? `<span class="hud-pill" id="hud-src">מדוד</span>` : ''}
              <span class="hud-pill" id="hud-ad" style="display:${P.adPlaying ? '' : 'none'};color:var(--warn)">פרסומת</span>
            </div>` : ''}
          </div>
        </div>
        <div>
          <div class="side-panel ${state.stageSettings ? '' : 'collapsed'}" style="margin-bottom:16px">
            <button class="panel-toggle" data-action="stage-settings">
              <span>הגדרות הבמה</span>
              <span class="panel-caret">${state.stageSettings ? '▾' : '▸'}</span>
            </button>
            <div class="panel-body">
            <h3>תצוגה</h3>
            <div class="chips">
              <button class="chip ${state.stageMode === 'anim' ? 'active' : ''}" data-mode="anim">🎬 אנימציה</button>
              <button class="chip ${state.stageMode === 'hero' ? 'active' : ''}" data-mode="hero"
                ${stageChar() && stageChar().portrait ? '' : 'disabled'}>🖼️ דמות ריאליסטית</button>
              <button class="chip ${state.stageMode === 'neck' ? 'active' : ''}" data-mode="neck"
                ${stageChar() && stageChar().portrait && stageChar().neck ? '' : 'disabled'}>🎯 אצבעות על התמונה</button>
              <button class="chip ${state.stageMode === 'gl' ? 'active' : ''}" data-mode="gl">🧊 צוואר תלת־ממד</button>
            </div>
            ${(() => {
              const c = stageChar();
              if (!c || !c.portrait) return '';
              if (c.neck) return `<div class="hint" style="margin-top:9px">
                "אצבעות על התמונה" מצייר את האצבוע המדויק על הגיטרה שבתמונה שלך —
                הדמות נשארת התמונה, רק הסימונים זזים לפי השיר.</div>`;
              return `<div class="hint" style="margin-top:9px">
                כדי להפעיל "אצבעות על התמונה" צריך לכייל פעם אחת איפה הגיטרה נמצאת בתמונה —
                בעריכת הדמות, כפתור "כייל את הצוואר".</div>`;
            })()}
            ${(() => {
              // In realistic mode the poster supplies a real photo per chord.
              // Say how many are in play, so a still hero is never a mystery.
              if (!(stageChar() && stageChar().portrait)) return '';
              const n = Object.keys(posterImages).length;
              const backdrops = [['none', 'שחור'], ['dark', 'אולם חשוך'],
                                 ['stage', 'במה'], ['warm', 'שעת זהב']];
              const blends = [['screen', 'מיזוג — לרקע שחור'], ['normal', 'ללא מיזוג']];
              return `<div class="hint" style="margin-top:9px">${n
                ? `<b>${n}</b> תמונות אקורד מהפוסטר — התמונה מתחלפת עם האקורד.`
                : 'אין תמונות אקורד. הדמות תישאר על תמונה אחת — הרכב פוסטר כדי שהיא תתחלף לפי האקורד.'}
                ${n ? '' : '<button class="btn btn-sm" style="margin-top:9px" data-route="poster">להרכבת פוסטר</button>'}
              </div>
              <h3 style="margin-top:16px">שילוב בתמונה</h3>
              <div class="chips">
                ${blends.map(([v, he]) =>
                  `<button class="chip ${(state.stageBlend || 'screen') === v ? 'active' : ''}" data-blend="${v}">${he}</button>`).join('')}
              </div>
              <div class="hint" style="margin-top:7px">
                אם התמונות צולמו על <b>רקע שחור</b>, המיזוג מעלים אותו אל תוך רקע
                הבמה בלי לחתוך כלום — ולכן גם בלי קצה חיתוך שמסגיר את החיבור.
                כבה אותו אם התמונות כבר חתוכות או שהרקע שלהן בהיר.
              </div>
              <h3 style="margin-top:16px">רקע הבמה</h3>
              <div class="chips">
                ${backdrops.map(([v, he]) =>
                  `<button class="chip ${(state.stageBackdrop || 'none') === v ? 'active' : ''}" data-bd="${v}">${he}</button>`).join('')}
              </div>`;
            })()}
            ${(() => {
              // A greyed-out button with a hover tooltip explains nothing — least
              // of all on a touch screen. Say what is missing, and offer the fix.
              if (stageChar() && stageChar().portrait) return '';
              const sc = stageChar();
              const named = sc && sc.id;
              return `<div class="hint" style="margin-top:9px">
                ${named
                  ? `ל<b>${esc(sc.name)}</b> אין תמונה מצורפת, ולכן התצוגה
                     הריאליסטית כבויה. האנימציה עובדת — אבל היא לא מציגה את הדמות עצמה.`
                  : 'בחר דמות למטה, וצרף לה תמונה כדי להפעיל את התצוגה הריאליסטית.'}
                ${named ? `<button class="btn btn-sm" style="margin-top:9px"
                   data-action="edit-char" data-id="${sc.id}">צרף תמונה לדמות</button>` : ''}
              </div>`;
            })()}
            <h3 style="margin-top:16px">כלי נגינה</h3>
            <div class="chips">
              <button class="chip ${stageInstrument() !== 'piano' ? 'active' : ''}" data-inst="guitar">🎸 גיטרה</button>
              <button class="chip ${stageInstrument() === 'piano' ? 'active' : ''}" data-inst="piano">🎹 פסנתר</button>
            </div>
            ${chars.length ? `<div style="margin-top:16px">
              <h3>דמות</h3>
              <select class="field" id="stage-char" style="width:100%;background:var(--bg-elev);border:1px solid var(--line);border-radius:8px;padding:9px">
                <option value="">— דמות ברירת מחדל —</option>
                ${chars.map(c => `<option value="${c.id}" ${state.stageCharId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
              </select></div>` : ''}
            </div><!-- /panel-body -->
          </div>
          <div class="side-panel">
            <h3>מיקום הידיים כרגע</h3>
            <div class="hand-readout" id="hand-readout">בחר שיר מנותח ולחץ נגן.</div>
            <div id="chord-diagram"></div>
            <h3 style="margin-top:18px">האקורדים בשיר</h3>
            <div class="next-chords" id="next-chords"></div>
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- characters ---------------- */
  function viewCharacters() {
    const cs = Store.state.characters;
    return `<div class="page">
      ${pageHead('דמויות', 'נועלים דמות פעם אחת — משתמשים בה בכל שיר')}
      <div class="section-head"><div class="section-title">${cs.length} דמויות</div>
        <button class="btn btn-primary btn-sm" data-action="new-character">+ דמות חדשה</button></div>
      ${cs.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
        ${cs.map(c => {
          const st = CH.STYLES.find(s => s.id === c.style);
          return `<div class="lesson-card" data-char="${c.id}" style="padding:0;overflow:hidden">
            ${c.portrait
              ? `<img src="${c.portrait}" alt="" style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block">`
              : `<div style="aspect-ratio:4/5;display:grid;place-items:center;background:var(--panel-2);font-size:40px;opacity:.4">${c.instrument === 'piano' ? '🎹' : '🎸'}</div>`}
            <div style="padding:18px">
              <div class="lesson-num">${c.instrument === 'piano' ? '🎹 פסנתר' : '🎸 גיטרה'}</div>
              <h4>${esc(c.name)}</h4>
              <p>${esc((c.description || '').slice(0, 90))}${(c.description || '').length > 90 ? '…' : ''}</p>
              <div style="margin-top:12px;display:flex;gap:7px;flex-wrap:wrap">
                <span class="pill${st && st.photoreal ? ' on' : ''}">${esc(st ? st.he : '—')}</span>
              </div>
              <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-sm" data-action="master-prompt" data-id="${c.id}">פרומפט-מאסטר</button>
                <button class="btn btn-sm" data-action="char-brief" data-id="${c.id}">תדריך</button>
                <button class="btn btn-sm btn-ghost" data-action="edit-char" data-id="${c.id}">ערוך</button>
              </div>
            </div>
          </div>`;
        }).join('')}</div>`
        : `<div class="empty"><div class="empty-icon">🎭</div><h3>אין דמויות עדיין</h3>
           <p>צור דמות — היא תישמר ותשמש לכל שיר בספרייה, עם פרומפט-מאסטר לסטוריבורד.</p>
           <button class="btn btn-primary" data-action="new-character">צור דמות</button></div>`}
    </div>`;
  }

  /* ---------------- play-along chord chart ----------------
     The stage is for watching; this is for playing. Bars laid out on a
     grid, the current one lit as the track moves, click any bar to jump
     there, loop a section to drill it, and transpose or capo the whole
     chart without touching the analysis. */
  function buildBars(a, transpose) {
    const sig = a.timeSignature || 4;
    const barLen = (60 / a.bpm) * sig;
    const bars = [];
    for (let t = a.firstBeat || 0, i = 0; t < a.duration - 0.01; t += barLen, i++) {
      const seg = A.chordAt(a, t + 0.01);
      const sec = A.sectionAt(a, t + 0.01);
      let chord = seg ? seg.chord : null;
      if (chord && transpose) chord = MM.transposeChord(chord, transpose);
      bars.push({
        index: i, start: +t.toFixed(3), end: Math.min(t + barLen, a.duration),
        chord, label: sec ? sec.label : 'mid',
        isSectionStart: !!(sec && Math.abs(sec.start - t) < barLen * 0.5)
      });
    }
    return bars;
  }

  function viewChart() {
    const t = state.currentTrackId ? Store.getTrack(state.currentTrackId) : null;
    if (!t || !t.analysis || !t.analysis.bpm) {
      return `<div class="page">${pageHead('תרשים אקורדים', 'לנגן יחד עם השיר')}
        <div class="empty"><div class="empty-icon">🎼</div>
          <h3>${t ? 'השיר עוד לא נותח' : 'לא נבחר שיר'}</h3>
          <p>צריך BPM ואקורדים כדי לפרוס את התרשים על תיבות.</p>
          ${t ? `<button class="btn btn-primary" data-action="analyze" data-id="${t.id}">נתח עכשיו</button>`
             : `<button class="btn btn-primary" data-route="library">לספרייה</button>`}
        </div></div>`;
    }
    const a = t.analysis;
    const bars = buildBars(a, state.transpose);
    const sounding = MM.transposeChord ? state.transpose : 0;
    const capoShapes = state.capo
      ? [...new Set(A.progressionOf(a).map(c => MM.transposeChord(c, state.transpose - state.capo)))]
      : null;
    return `<div class="page">
      ${pageHead('תרשים אקורדים', `${esc(t.title)} · ${Math.round(a.bpm)} BPM · ${bars.length} תיבות`)}
      <div class="panel" style="padding:16px 20px">
        <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
          <div>
            <label style="font-size:11.5px;font-weight:700;color:var(--text-3);letter-spacing:.06em">טרנספוזיציה</label>
            <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
              <button class="btn btn-sm" data-transpose="-1">−</button>
              <span class="pill" style="min-width:56px;text-align:center">${sounding > 0 ? '+' : ''}${sounding}</span>
              <button class="btn btn-sm" data-transpose="1">+</button>
              ${state.transpose ? '<button class="btn btn-sm btn-ghost" data-transpose="0">איפוס</button>' : ''}
            </div>
          </div>
          <div>
            <label style="font-size:11.5px;font-weight:700;color:var(--text-3);letter-spacing:.06em">קאפו</label>
            <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
              <button class="btn btn-sm" data-capo="-1">−</button>
              <span class="pill" style="min-width:56px;text-align:center">${state.capo || 'ללא'}</span>
              <button class="btn btn-sm" data-capo="1">+</button>
            </div>
          </div>
          <div style="flex:1;min-width:180px">
            ${capoShapes ? `<label style="font-size:11.5px;font-weight:700;color:var(--text-3)">הצורות שתנגן עם קאפו ${state.capo}</label>
              <div class="next-chords" style="margin-top:6px">${capoShapes.map(c =>
                `<span class="next-chord" style="padding:5px 10px;font-size:12.5px">${esc(c)}</span>`).join('')}</div>`
              : '<div class="hint">קאפו ממיר את התרשים לצורות קלות יותר בלי לשנות את הצליל.</div>'}
          </div>
          <button class="btn btn-sm ${state.loop ? 'btn-primary' : ''}" data-action="clear-loop"
            ${state.loop ? '' : 'disabled'}>${state.loop ? '⟲ לולאה פעילה — בטל' : 'לולאה כבויה'}</button>
        </div>
      </div>
      <div class="chips" style="margin-bottom:14px">
        ${(a.sections || []).map((s, i) => `
          <button class="chip" data-loop-section="${i}">
            ${{ low: 'שקט', mid: 'ביניים', high: 'שיא' }[s.label] || s.label} ${fmt(s.start)}
          </button>`).join('')}
      </div>
      <div class="chart-grid" id="chart-grid">
        ${bars.map(b => `
          <div class="chart-bar ${b.label} ${b.isSectionStart ? 'section-start' : ''}"
               data-bar="${b.index}" data-t="${b.start}">
            <span class="chart-num">${b.index + 1}</span>
            <span class="chart-chord">${esc(b.chord || '·')}</span>
          </div>`).join('')}
      </div>
      <div class="hint" style="margin-top:14px">לחץ על תיבה כדי לקפוץ אליה · לחץ על סקשן כדי להריץ אותו בלולאה</div>
    </div>`;
  }

  /* ---------------- chord library ---------------- */
  function viewChords() {
    const isPiano = state.chordInst === 'piano';
    const total = MM.CHORD_GROUPS.reduce((n, g) => n + g.chords.length, 0);
    return `<div class="page">
      ${pageHead('ספריית האקורדים', `${total} אקורדים · האצבעות בדיוק על האקורד`)}
      <div class="chips" style="margin-bottom:8px">
        <button class="chip ${!isPiano ? 'active' : ''}" data-cinst="guitar">🎸 גיטרה</button>
        <button class="chip ${isPiano ? 'active' : ''}" data-cinst="piano">🎹 פסנתר</button>
        <button class="btn btn-sm" data-action="chord-poster" style="margin-inline-start:auto">
          🖼️ צור פוסטר עם דמות</button>
      </div>
      <div class="panel" style="padding:14px 18px;margin-bottom:24px">
        <div style="font-size:12.5px;color:var(--text-3);line-height:1.7">
          <b style="color:var(--text-2)">מספרי אצבעות:</b> 1 = מורה · 2 = אמה · 3 = קמיצה · 4 = זרת
          &nbsp;·&nbsp; <b style="color:var(--text-2)">✕</b> = מיתר שלא מנוגן
          &nbsp;·&nbsp; <b style="color:var(--text-2)">o</b> = מיתר פתוח
        </div>
      </div>
      ${MM.CHORD_GROUPS.map(g => `
        <div class="section-head"><div class="section-title">${esc(g.he)}</div>
          <span class="section-more">${g.chords.length}</span></div>
        <div style="direction:ltr;display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(${isPiano ? 250 : 132}px,1fr))">
          ${g.chords.map(ch => `
            <div style="text-align:center">
              ${isPiano ? PF.keyboardDiagramSVG(ch, 240) : PF.chordDiagramSVG(ch, 128)}
              ${isPiano ? `<div style="margin-top:6px;font-weight:800;font-size:13px">${ch}</div>` : ''}
              <div style="margin-top:8px;display:flex;gap:5px;justify-content:center">
                <button class="btn btn-sm" data-action="hear-chord" data-chord="${ch}" data-inst="${isPiano ? 'piano' : 'guitar'}">▶</button>
                <button class="btn btn-sm btn-ghost" data-action="speak-chord" data-chord="${ch}" data-inst="${isPiano ? 'piano' : 'guitar'}">🔊</button>
                ${isPiano ? '' : `<button class="btn btn-sm btn-ghost" data-action="export-diagram" data-chord="${ch}" title="הורד דיאגרמה לצירוף לפרומפט">⬇</button>`}
              </div>
            </div>`).join('')}
        </div>`).join('')}
    </div>`;
  }

  /** @param charId  preselect this character  @param groupIds  preselect these groups */
  function chordPosterModal(charId, groupIds) {
    const chars = Store.state.characters;
    if (!chars.length) {
      return modal('פוסטר אקורדים', `<div class="empty">
        <div class="empty-icon">🎭</div><h3>צריך דמות קודם</h3>
        <p>הפוסטר מציג את אותה דמות מנגנת כל אקורד — צור דמות ונעל אותה.</p></div>`,
        `<button class="btn btn-primary" data-action="new-character">צור דמות</button>
         <button class="btn btn-ghost" data-action="close-modal">סגור</button>`);
    }
    const c = (charId && Store.getCharacter(charId)) || chars[0];
    const wanted = groupIds && groupIds.length ? groupIds : null;
    modal('פוסטר אקורדים עם דמות', `
      <div class="field" style="margin-bottom:14px">
        <label>דמות</label>
        <select id="poster-char">${chars.map(x =>
          `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      </div>
      <div class="field" style="margin-bottom:14px">
        <label>רמת צילום</label>
        <select id="poster-tier">${CH.SHOT_TIERS.map(t =>
          `<option value="${t.id}" ${t.id === 'balanced' ? 'selected' : ''}>${esc(t.he)}</option>`).join('')}</select>
        <div class="hint" id="poster-tier-note"></div>
      </div>
      <div class="field" style="margin-bottom:14px">
        <label>קבוצות אקורדים</label>
        <div class="chips" id="poster-groups">
          ${MM.CHORD_GROUPS.map((g, i) =>
            `<button class="chip ${wanted ? (wanted.includes(g.id) ? 'active' : '') : (i < 4 ? 'active' : '')}"
               data-group="${g.id}">${esc(g.he)}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>פרומפטים — אחד לכל אקורד</label>
        <textarea id="poster-text" readonly style="min-height:340px"></textarea>
      </div>`,
      `<button class="btn btn-primary" data-action="copy-poster">העתק</button>
       <button class="btn" data-action="download-poster">הורד .md</button>
       <button class="btn btn-ghost" data-action="close-modal">סגור</button>`);

    const rebuild = () => {
      const ch = Store.getCharacter($('#poster-char').value) || c;
      const tierId = $('#poster-tier').value;
      const tier = CH.SHOT_TIERS.find(t => t.id === tierId);
      $('#poster-tier-note').textContent = tier ? tier.note : '';
      const on = [...document.querySelectorAll('#poster-groups .chip.active')].map(b => b.dataset.group);
      const groups = MM.CHORD_GROUPS.filter(g => on.includes(g.id));
      if (!groups.length) { $('#poster-text').value = 'בחר לפחות קבוצת אקורדים אחת.'; return; }
      // One ready prompt per chord at the chosen tier, plus the shared setup.
      const L = ['# 1️⃣ פרומפט פתיחה — הדבק אותו פעם אחת', '',
        '```', CH.chordSessionOpener(ch, groups, tierId), '```', '',
        '---', '', '# 2️⃣ פרומפטים בודדים (אם תרצה להריץ אקורד לבד)', '',
        CH.chordPosterPrompts(ch, groups), '', '---', '',
        `# פרומפט מוכן לכל אקורד — ${tier ? tier.he : tierId}`, ''];
      for (const g of groups) {
        L.push('## ' + g.he, '');
        for (const chord of g.chords) {
          L.push('### ' + chord, '```', CH.chordShotPrompt(ch, chord, tierId), '```', '');
        }
      }
      $('#poster-text').value = L.join('\n');
    };
    $('#poster-char').addEventListener('change', rebuild);
    $('#poster-tier').addEventListener('change', rebuild);
    $('#poster-groups').addEventListener('click', e => {
      const b = e.target.closest('[data-group]');
      if (b) { b.classList.toggle('active'); rebuild(); }
    });
    rebuild();
  }

  /**
   * Export a chord diagram as a PNG.
   * Text can say which finger goes on which string, but that clause competes
   * with everything else in the prompt and is the first thing to blur. A
   * diagram states the same thing as a picture, which an image model can
   * attach to directly — and the app already computes it exactly.
   */
  function exportChordDiagram(chord, scale) {
    const s = scale || 4;
    const W = 150, H = Math.round(W * PF.DIAGRAM_ASPECT);
    let svg = PF.chordDiagramSVG(chord, W);
    if (!/xmlns=/.test(svg)) svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = W * s; cv.height = H * s;
      const x = cv.getContext('2d');
      x.fillStyle = '#0a0a0c';
      x.fillRect(0, 0, cv.width, cv.height);
      x.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `chord-${chord.replace('#', 'sharp')}.png`; a.click();
        URL.revokeObjectURL(url);
        toast(`דיאגרמת ${chord} הורדה — צרף אותה לפרומפט`);
      }, 'image/png');
    };
    img.onerror = () => toast('לא הצלחתי לייצא את הדיאגרמה', true);
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }

  /* ---------------- poster assembler ----------------
     The generated images arrive one per chord — no model holds 30 distinct
     correct hand shapes in a single frame. This lays them out into the sheet
     and burns in the chord name and diagram, which is where the accuracy
     actually lives.

     The images are kept in IndexedDB, not localStorage: thirty of them are far
     past that budget. This object is the in-memory mirror that rendering reads,
     since the view is synchronous and IndexedDB is not. */
  const posterImages = {};
  let postersLoaded = false, postersPersist = true;
  let posterBackup = null;      // pre-cut-out originals, for undo

  /** Fills the mirror from storage once, then re-renders if the user is looking. */
  function loadPosters() {
    if (postersLoaded) return Promise.resolve();
    postersLoaded = true;
    const redraw = () => {
      // The stage and the guide read these too, so they need the same nudge.
      if (['poster', 'stage', 'guide'].includes(state.route)) render();
    };
    return MM.Posters.all().then(map => {
      Object.assign(posterImages, map);
      redraw();
    }).catch(() => {
      // Private browsing disables IndexedDB. Keep working for this session and
      // say so, rather than failing silently and losing the work again later.
      postersPersist = false;
      redraw();
    });
  }

  /**
   * Puts the right photograph on the hero stage for the chord being played.
   *
   * The realistic view was a single portrait that never changed, so the
   * character stood still through the whole song. The poster is already a
   * photograph of that character per chord, which is exactly the frame this
   * needs — so the stage draws from it, and falls back to the portrait for
   * chords with no image yet. Two stacked frames crossfade the change.
   */
  function setHeroImage(chord) {
    const a = $('#hero-img'), alt = $('#hero-img-alt');
    if (!a || !alt) return;
    const want = (chord && posterImages[chord]) ||
                 (stageChar() && stageChar().portrait);
    if (!want) return;
    const showing = a.classList.contains('show') ? a : alt;
    if (showing.getAttribute('src') === want) return;
    const hidden = showing === a ? alt : a;
    hidden.setAttribute('src', want);
    hidden.classList.add('show');
    showing.classList.remove('show');
  }

  /** Writes through to storage; the caller has already updated the mirror. */
  function persistPoster(chord, url) {
    if (!postersPersist) return;
    (url === null ? MM.Posters.remove(chord) : MM.Posters.set(chord, url)).catch(() => {
      postersPersist = false;
      toast('התמונות לא נשמרות בדפדפן הזה — ייצא את הפוסטר לפני שתסגור', true);
    });
  }

  function viewPoster() {
    const groups = MM.CHORD_GROUPS.filter(g => state.posterGroups.includes(g.id));
    const filled = Object.keys(posterImages).length;
    const total = groups.reduce((n, g) => n + g.chords.length, 0);
    return `<div class="page">
      ${pageHead('הרכבת פוסטר', 'תמונה לכל אקורד — כאן הן הופכות לגיליון אחד')}
      <div class="panel">
        <div class="panel-title">איך זה עובד</div>
        <div class="panel-desc" style="margin-bottom:14px">
          מייצרים תמונה לכל אקורד בכלי החיצוני (פרומפט לכל אקורד במסך ספריית האקורדים),
          גוררים אותן לתאים כאן, ומורידים את הפוסטר המוכן. שם האקורד והדיאגרמה נצרבים
          על כל תא — הם המקור לדיוק.</div>
        <div class="chips">
          ${MM.CHORD_GROUPS.filter(g => ['major','minor','seventh','sus'].includes(g.id)).map(g =>
            `<button class="chip ${state.posterGroups.includes(g.id) ? 'active' : ''}" data-pgroup="${g.id}">${esc(g.he)}</button>`).join('')}
          <span class="pill" style="margin-inline-start:auto">${filled}/${total} תאים</span>
        </div>
        ${(() => {
          /* The prompts that produce these images are generated per character,
             but that lived only on the chord-library screen — so from here there
             was no visible connection between a poster and the character it is
             supposed to show. Close the loop where the poster is actually built. */
          const chars = Store.state.characters;
          if (!chars.length) {
            return `<div class="hint" style="margin-top:14px">
              הפוסטר מציג את אותה דמות מנגנת כל אקורד.
              <button class="btn btn-sm" style="margin-top:8px" data-action="new-character">צור דמות</button>
            </div>`;
          }
          return `<div class="field" style="max-width:340px;margin-top:16px">
            <label>הדמות של הפוסטר</label>
            <select id="poster-owner">
              ${chars.map(c => `<option value="${c.id}" ${state.posterChar === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select>
            <div class="hint">ממנה נבנים הפרומפטים — אותה דמות נעולה בכל תא, רק היד משתנה.</div>
            <button class="btn btn-sm" style="margin-top:10px" data-action="poster-prompts">
              קבל פרומפטים לאקורדים שנבחרו
            </button>
          </div>`;
        })()}
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
          <button class="btn" data-action="poster-bulk">בחר תמונות בכמות</button>
          <button class="btn" data-action="poster-cutout" ${filled ? '' : 'disabled'}>הסר רקע מכולן</button>
          ${posterBackup ? '<button class="btn btn-ghost" data-action="poster-undo-cutout">בטל הסרת רקע</button>' : ''}
          <button class="btn btn-primary" data-action="poster-export" ${filled ? '' : 'disabled'}>הורד פוסטר PNG</button>
          <button class="btn btn-ghost" data-action="poster-clear" ${filled ? '' : 'disabled'}>נקה</button>
        </div>
        <div class="hint" style="margin-top:8px">בבחירה בכמות: מיין את הקבצים לפי שם והם ישובצו לפי הסדר.</div>
        <div class="hint" style="margin-top:6px">
          <b>הסרת רקע</b> חותכת את הדמות מהרקע, כך שבבמה יישאר רקע אחד קבוע ורק
          הנגן יתחלף — זה מה שגורם לרצף להיראות מתמשך ולא כמו מצגת שקופיות.
          עובד מצוין על רקע אחיד, פחות טוב על סצנה עמוסה. אפשר לבטל אחרי שרואים את התוצאה.
          לתמונות הבאות — בחר בדמות <b>רקע להסרה — לבמה החיה</b>, והפרומפט יבקש רקע שטוח
          שנחתך נקי.
        </div>
      </div>
      ${groups.map(g => `
        <div class="section-head"><div class="section-title">${esc(g.he)}</div></div>
        <div style="direction:ltr;display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
          ${g.chords.map(ch => `
            <div class="poster-cell ${posterImages[ch] ? 'filled' : ''}" data-cell="${ch}">
              ${posterImages[ch]
                ? `<img src="${posterImages[ch]}" alt="">`
                : `<div class="poster-empty">${PF.chordDiagramSVG(ch, 96)}</div>`}
              <div class="poster-label">${ch}</div>
            </div>`).join('')}
        </div>`).join('')}
    </div>`;
  }

  /** Render the assembled sheet to a canvas and download it. */
  async function exportPoster() {
    const groups = MM.CHORD_GROUPS.filter(g => state.posterGroups.includes(g.id));
    const cols = 7, cellW = 300, cellH = 380, pad = 28, headH = 130, groupH = 46;
    const rowsPerGroup = groups.map(g => Math.ceil(g.chords.length / cols));
    const W = pad * 2 + cols * cellW + (cols - 1) * 12;
    const H = headH + groups.reduce((h, g, i) => h + groupH + rowsPerGroup[i] * (cellH + 12), 0) + pad * 2;

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    x.fillStyle = '#07070a'; x.fillRect(0, 0, W, H);

    x.textAlign = 'center';
    x.fillStyle = '#f0f0f4';
    x.font = '700 62px Heebo, sans-serif';
    x.fillText('ALL GUITAR CHORDS', W / 2, 78);
    x.fillStyle = '#c8a24a';
    x.font = '600 22px Heebo, sans-serif';
    x.fillText('FINGERS EXACTLY ON THE CHORD', W / 2, 110);

    const svgToImg = svg => new Promise(res => {
      // An SVG loaded through <img> is parsed standalone, so it needs the
      // namespace declaration the inline-DOM version gets for free.
      if (!/xmlns=/.test(svg)) svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    });
    const load = src => new Promise(res => {
      const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = src;
    });

    let y = headH;
    for (const g of groups) {
      x.textAlign = 'left';
      x.fillStyle = '#c8a24a';
      x.font = '700 24px Heebo, sans-serif';
      x.fillText(g.en || g.id.toUpperCase(), pad, y + 28);
      y += groupH;

      for (let i = 0; i < g.chords.length; i++) {
        const ch = g.chords[i];
        const cx = pad + (i % cols) * (cellW + 12);
        const cy = y + Math.floor(i / cols) * (cellH + 12);

        x.fillStyle = '#101014';
        x.fillRect(cx, cy, cellW, cellH);
        const src = posterImages[ch];
        if (src) {
          const img = await load(src);
          if (img) {
            // cover-fit
            const s = Math.max(cellW / img.width, cellH / img.height);
            const dw = img.width * s, dh = img.height * s;
            x.save(); x.beginPath(); x.rect(cx, cy, cellW, cellH); x.clip();
            x.drawImage(img, cx + (cellW - dw) / 2, cy + (cellH - dh) / 2, dw, dh);
            x.restore();
          }
        }
        // chord name
        x.textAlign = 'left';
        x.fillStyle = '#ffffff';
        x.font = '700 26px Heebo, sans-serif';
        x.fillText(ch, cx + 14, cy + 34);
        // diagram, burned in bottom-right
        const dImg = await svgToImg(PF.chordDiagramSVG(ch, 104));
        if (dImg) {
          const dw = 104, dh = Math.round(104 * PF.DIAGRAM_ASPECT);
          x.fillStyle = 'rgba(0,0,0,.62)';
          x.fillRect(cx + cellW - dw - 12, cy + cellH - dh - 12, dw, dh);
          x.drawImage(dImg, cx + cellW - dw - 12, cy + cellH - dh - 12, dw, dh);
        }
        x.strokeStyle = 'rgba(255,255,255,.12)';
        x.strokeRect(cx + .5, cy + .5, cellW - 1, cellH - 1);
      }
      y += rowsPerGroup[groups.indexOf(g)] * (cellH + 12);
    }

    x.textAlign = 'center';
    x.fillStyle = 'rgba(255,255,255,.55)';
    x.font = '500 18px Heebo, sans-serif';
    x.fillText('FINGER NUMBERS:  1 = INDEX   2 = MIDDLE   3 = RING   4 = PINKY        ' +
      '✕ = DO NOT PLAY STRING        o = OPEN STRING', W / 2, H - 26);

    cv.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'all-guitar-chords.png'; a.click();
      URL.revokeObjectURL(url);
      toast('הפוסטר הורד');
    }, 'image/png');
  }

  /* ---------------- lessons ---------------- */
  function viewLessons() {
    if (state.activeLesson) return viewLessonDetail(state.activeLesson);
    const g = LS.GUITAR_LESSONS, p = LS.PIANO_LESSONS;
    const card = l => `<div class="lesson-card" data-lesson="${l.id}">
      <div class="lesson-num">${l.level} · ${l.instrument === 'piano' ? 'פסנתר' : 'גיטרה'}</div>
      <h4>${esc(l.title)}</h4>
      <p>${esc(l.intro.slice(0, 100))}…</p>
      <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
        ${l.chords.slice(0, 4).map(c => `<span class="pill">${c}</span>`).join('')}
      </div></div>`;
    return `<div class="page">
      ${pageHead('שיעורים', 'לימוד אקורדים ותווים — עם מורה שמדבר, מטרונום וצליל')}
      <div class="panel" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:220px">
          <div class="panel-title">🔊 מורה מדבר</div>
          <div class="panel-desc" style="margin:0" id="speech-status">בודק זמינות קול…</div>
        </div>
        <button class="btn" data-action="test-speech">בדוק קול</button>
      </div>
      <div class="section-head"><div class="section-title">🎸 גיטרה</div></div>
      <div class="lesson-grid">${g.map(card).join('')}</div>
      <div class="section-head"><div class="section-title">🎹 פסנתר</div></div>
      <div class="lesson-grid">${p.map(card).join('')}</div>
    </div>`;
  }

  function viewLessonDetail(id) {
    const l = LS.all().find(x => x.id === id);
    if (!l) { state.activeLesson = null; return viewLessons(); }
    const isPiano = l.instrument === 'piano';
    return `<div class="page">
      <button class="btn btn-sm btn-ghost" data-action="back-lessons" style="margin:14px 0">← כל השיעורים</button>
      ${pageHead(l.title, `${l.level} · ${isPiano ? 'פסנתר' : 'גיטרה'}`)}
      <div class="panel">
        <div class="panel-desc" style="font-size:14.5px;color:var(--text-2)">${esc(l.intro)}</div>
        <button class="btn speak-btn" data-action="speak-lesson" data-id="${l.id}">🔊 הקרא לי את ההסבר</button>
      </div>
      <div class="panel">
        <div class="panel-title">האקורדים בשיעור</div>
        <div class="panel-desc">לחץ על אקורד כדי לשמוע אותו ולקבל הסבר מדובר על מיקום כל אצבע.</div>
        <div class="diagram-box">
          ${l.chords.map(c => `<div style="text-align:center">
            ${isPiano ? PF.keyboardDiagramSVG(c, 260) : PF.chordDiagramSVG(c, 132)}
            ${isPiano ? `<div style="margin-top:6px;font-weight:800">${c}</div>` : ''}
            <div style="margin-top:9px;display:flex;gap:6px;justify-content:center">
              <button class="btn btn-sm" data-action="hear-chord" data-chord="${c}" data-inst="${l.instrument}">▶ צליל</button>
              <button class="btn btn-sm btn-ghost" data-action="speak-chord" data-chord="${c}" data-inst="${l.instrument}">🔊 הסבר</button>
            </div></div>`).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">טיפים</div>
        <ul style="padding-inline-start:20px;line-height:2;color:var(--text-2);font-size:14px">
          ${l.tips.map(t => `<li>${esc(t)}</li>`).join('')}
        </ul>
        <button class="btn btn-sm speak-btn" data-action="speak-tips" data-id="${l.id}">🔊 הקרא טיפים</button>
      </div>
      <div class="panel">
        <div class="panel-title">מטרונום לתרגול</div>
        <div class="panel-desc">תרגל את המעברים לאט. עדיף נקי ואיטי ממהיר ומזמזם.</div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <input type="range" id="metro-bpm" min="40" max="180" value="70" style="flex:1;min-width:180px">
          <span class="pill" id="metro-val">70 BPM</span>
          <button class="btn" data-action="toggle-metro">▶ הפעל</button>
        </div>
      </div>
    </div>`;
  }

  function viewSettings() {
    const s = Store.state;
    return `<div class="page">
      ${pageHead('הגדרות', 'נתונים, גיבוי וחיבור לסקיל')}
      <div class="panel">
        <div class="panel-title">חיבור לצנרת הניתוח</div>
        <div class="panel-desc">האפליקציה קוראת את פלט הסקיל <code>music-motion-maestro</code>.
          הרץ את הצנרת על קישור יוטיוב, ואז הדבק את ה-JSON במסך הניתוח של השיר.</div>
        <div class="code">python scripts/fetch_audio.py "&lt;YOUTUBE_URL&gt;" --out work/
python scripts/analyze_music.py work/audio.wav --out work/analysis.json
python scripts/extract_chords.py work/audio.wav --beats work/analysis.json --out work/chords.json
python scripts/build_sync_map.py work/analysis.json --chords work/chords.json --out work/sync_map.json</div>
      </div>
      <div class="panel">
        <div class="panel-title">גיבוי</div>
        <div class="panel-desc">${s.tracks.length} שירים · ${s.characters.length} דמויות · <span id="backup-posters">…</span> תמונות פוסטר,
          שמורים בדפדפן הזה. הגיבוי כולל את הכל — כולל תמונות הפוסטר, ולכן הקובץ
          יכול להיות כבד.</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" data-action="export">ייצא גיבוי</button>
          <button class="btn" data-action="import">ייבא גיבוי</button>
          <button class="btn btn-ghost" data-action="wipe" style="color:var(--bad)">מחק הכל</button>
        </div>
      </div>
    </div>`;
  }

  /* ============================================================
     Render
     ============================================================ */
  function render() {
    renderSidebar();
    if (state.route === 'stage' || state.route === 'chart') ensureStageTrack();
    // The guide reports how many chord images exist, so it needs them loaded.
    if (['poster', 'stage', 'guide'].includes(state.route)) loadPosters();
    if (state.route === 'settings') {
      loadPosters().then(() => {
        const el = $('#backup-posters');
        if (el) el.textContent = Object.keys(posterImages).length;
      });
    }
    const views = {
      home: viewHome, guide: viewGuide, library: viewLibrary, stage: viewStage,
      chart: viewChart, characters: viewCharacters, chords: viewChords, poster: viewPoster,
      lessons: viewLessons, settings: viewSettings
    };
    $('#view').innerHTML = (views[state.route] || viewHome)();

    if (state.route === 'stage') mountStage();
    if (state.route === 'lessons') {
      LS.Speech.onReady((hasHe, n) => {
        const st = $('#speech-status');
        if (!st) return;
        st.textContent = !LS.Speech.supported ? 'הדפדפן הזה לא תומך בהקראה.'
          : hasHe ? 'קול עברי זמין ✓ — לחץ על "הסבר" בכל אקורד.'
          : `לא נמצא קול עברי מותקן (${n} קולות זמינים) — ההקראה תשתמש בקול ברירת המחדל.`;
      });
      const mb = $('#metro-bpm');
      if (mb) mb.addEventListener('input', () => { $('#metro-val').textContent = mb.value + ' BPM'; });
    }
    updatePlayerBar();
  }

  /* ---------------- stage mount + sync loop ---------------- */
  function mountStage() {
    const host = $('#stage');
    const t = state.currentTrackId ? Store.getTrack(state.currentTrackId) : null;
    if (!host || !t || !t.analysis || !t.analysis.bpm) { state.performer = null; return; }
    // These are markup, not performer output, so carry them across the rebuild.
    const hud = host.querySelector('.stage-hud');
    const exit = host.querySelector('.stage-exit');
    const card = host.querySelector('.stage-chordcard');
    host.innerHTML = '';

    const neckMode = state.stageMode === 'neck' && stageChar() &&
                     stageChar().portrait && Neck.isCalibrated(stageChar().neck);
    const heroMode = state.stageMode === 'hero' && stageChar() && stageChar().portrait;
    if (state.stageMode === 'gl') {
      /* The neck and the fretting hand, built from the millimetre geometry
         rather than drawn over a picture. No body and no player: those are
         the parts that need an artist, and this exists to find out whether
         the geometry and the reaching hold up before any of that is spent. */
      state.performer = null;
      const wrap = document.createElement('div');
      wrap.className = 'gl-stage';
      wrap.innerHTML = `<canvas id="gl-canvas"></canvas>
        <div class="gl-hint" id="gl-hint">גרור כדי לסובב</div>`;
      host.appendChild(wrap);
      startGl(wrap.querySelector('#gl-canvas'));
    } else if (neckMode) {
      /* The picture is the performer and stays exactly as it was generated;
         only the fingering is drawn over it, in the place the calibration
         says the guitar actually is. Nothing here is an approximation of the
         look — the look is a photograph — and nothing is an approximation of
         the fingering either. */
      state.performer = null;
      const wrap = document.createElement('div');
      wrap.className = 'neck-stage';
      wrap.innerHTML =
        `<img id="neck-stage-img" src="${stageChar().portrait}" alt="">
         <canvas id="neck-stage-cv"></canvas>`;
      host.appendChild(wrap);
      // The overlay is normally repainted when the chord changes, which is not
      // enough on the way in: the picture has to be laid out before anything
      // can be drawn on it.
      const im = wrap.querySelector('#neck-stage-img');
      const first = () => drawNeckOverlay(liveChord());
      if (im.complete && im.naturalWidth) requestAnimationFrame(first);
      else im.addEventListener('load', first);
    } else if (heroMode) {
      // The realistic render is the visual; the fingering stays exact in the
      // overlay, so you get the photoreal look without losing the accuracy.
      state.performer = null;
      const wrap = document.createElement('div');
      wrap.className = 'hero-stage';
      wrap.innerHTML =
        `<div class="hero-backdrop" data-bd="${esc(state.stageBackdrop || 'dark')}"></div>
         <div class="hero-glow" id="hero-glow"></div>
         <div class="hero-frames" id="hero-frames" data-blend="${esc(state.stageBlend || 'screen')}">
           <img id="hero-img" class="hero-layer show" src="${stageChar().portrait}" alt="">
           <img id="hero-img-alt" class="hero-layer" alt="">
         </div>
         <div class="hero-overlay">
           <div class="hero-chord" id="hero-chord">—</div>
           <div class="hero-hand" id="hero-hand"></div>
           <div id="hero-diagram"></div>
         </div>
         <div class="hero-vignette"></div>`;
      host.appendChild(wrap);
    } else {
      const holder = document.createElement('div');
      host.appendChild(holder);
      state.performer = PF.create(holder);
      state.performer.setInstrument(
        stageInstrument());
      state.performer.setPalette((stageChar() || {}).palette);
    }
    if (hud) host.appendChild(hud);
    if (exit) host.appendChild(exit);
    if (card) host.appendChild(card);

    const sel = $('#stage-char');
    if (sel) sel.addEventListener('change', () => {
      state.stageCharId = sel.value || null;
      state.stageInst = null;   // a new character brings its own instrument
      render();
    });
    renderChordList(t);

    // Prime the readouts now. They are otherwise only refreshed by the player
    // loop, which leaves the panel blank until playback starts.
    lastReadoutChord = null;
    const at = A.chordAt(t.analysis, P.time() || 0);
    const first = at || (t.analysis.chords && t.analysis.chords[0]);
    updateHandReadout(first ? first.chord : null);
  }

  function renderChordList(t) {
    const box = $('#next-chords');
    if (!box) return;
    const prog = A.progressionOf(t.analysis);
    box.innerHTML = prog.length
      ? prog.slice(0, 24).map(c => `<span class="next-chord" data-c="${c}">${c}</span>`).join('')
      : '<span style="color:var(--text-3);font-size:13px">אין אקורדים בניתוח</span>';
  }

  /** Runs every frame — this is where music becomes motion. */
  function syncFrame(time) {
    const t = state.currentTrackId ? Store.getTrack(state.currentTrackId) : null;
    if (!t || !t.analysis || !t.analysis.bpm) return;
    const a = t.analysis;
    const beat = A.beatPhase(a, time);
    const seg = A.chordAt(a, time);
    const chord = seg ? seg.chord : null;
    const sec = A.sectionAt(a, time);
    const energy = sec ? ({ low: .35, mid: .62, high: .95 }[sec.label] || .6) : .6;

    if (state.stageMode === 'gl') drawGl(chord);
    if (state.stageMode === 'neck') {
      /* The strumming hand has to be redrawn every frame — it is the thing
         that moves between chord changes, and without it a chord that has
         already been struck just sits there looking frozen. */
      drawNeckOverlay(chord, { beat, energy, playing: P.playing && !P.adPlaying });
    }
    if (state.performer) {
      state.performer.update({ chord, beat, playing: P.playing, energy });
    } else if (state.stageMode === 'hero') {
      // A still render can't fret a chord, but it can breathe with the music:
      // a subtle push on each beat keeps the hero alive without faking playing.
      const frames = $('#hero-frames');
      const pulse = P.playing ? Math.max(0, 1 - beat.phase * 3.2) * (beat.isDown ? 1 : .55) : 0;
      if (frames) {
        const sway = P.playing ? Math.sin((beat.index % 8 + beat.phase) / 8 * Math.PI * 2) : 0;
        // A slow drift across the bar keeps the frame alive between chord
        // changes, when the photograph itself is not changing at all.
        const drift = P.playing ? Math.sin((beat.index % 32 + beat.phase) / 32 * Math.PI * 2) : 0;
        frames.style.transform =
          `scale(${(1.02 + pulse * 0.02 * energy + drift * 0.012).toFixed(4)}) ` +
          `translate(${(sway * 6 * energy).toFixed(2)}px, ${(drift * 5).toFixed(2)}px)`;
      }
      // Stage light behind the performer, breathing on the beat.
      const glow = $('#hero-glow');
      if (glow) {
        glow.style.opacity = (0.28 + pulse * 0.5 * energy).toFixed(3);
        glow.style.transform = `scale(${(1 + pulse * 0.10 * energy).toFixed(4)})`;
      }
      const hc = $('#hero-chord');
      if (hc && hc.textContent !== (chord || '—')) hc.textContent = chord || '—';
    }

    // loop the selected section
    if (state.loop && time >= state.loop.end - 0.02) {
      P.seek(state.loop.start);
      return;
    }

    if (state.route === 'chart') {
      const sig = a.timeSignature || 4;
      const barLen = (60 / a.bpm) * sig;
      const idx = Math.floor((time - (a.firstBeat || 0)) / barLen);
      if (idx !== state.lastBar) {
        state.lastBar = idx;
        const grid = $('#chart-grid');
        if (grid) {
          const prev = grid.querySelector('.chart-bar.now');
          if (prev) prev.classList.remove('now');
          const cur = grid.querySelector(`[data-bar="${idx}"]`);
          if (cur) {
            cur.classList.add('now');
            if (P.playing) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }
      }
    }

    // beat pulse in the player bar
    if (beat.index !== state.lastBeatIndex) {
      state.lastBeatIndex = beat.index;
      const dot = $('#beat-dot');
      if (dot && P.playing) {
        dot.classList.add('hit');
        setTimeout(() => dot.classList.remove('hit'), 90);
      }
    }
    const cn = $('#chord-now');
    if (cn && cn.textContent !== (chord || '—')) cn.textContent = chord || '—';

    if (state.route === 'stage') {
      const hc = $('#hud-chord'); if (hc && hc.textContent !== (chord || '—')) hc.textContent = chord || '—';
      const hb = $('#hud-bar');
      if (hb) {
        const bar = Math.floor(beat.index / (a.timeSignature || 4)) + 1;
        const bt = (beat.index % (a.timeSignature || 4)) + 1;
        const label = `${bar}.${bt}`;
        if (hb.textContent !== label) hb.textContent = label;
      }
      const hs = $('#hud-section');
      if (hs && sec) {
        const nm = { low: 'שקט', mid: 'ביניים', high: 'שיא' }[sec.label] || sec.label;
        if (hs.textContent !== nm) hs.textContent = nm;
      }
      updateHandReadout(chord);
    }
  }

  /* ---------------- the 3D neck ----------------
     One renderer for the life of the stage: WebGL contexts are a limited
     resource and a browser will start dropping the oldest if a new one is
     made on every re-render. */
  let gl3d = null, glDrag = null, glFps = { n: 0, at: 0, value: 0 };

  function startGl(canvas) {
    stopGl();
    try {
      /* Twelve frets, not the seven the chords need. The extra five are never
         played here; they run the neck out of the right-hand side of the
         frame instead of ending it in mid-air, and they carry the twelfth's
         double marker, which is the one a player uses to find position. */
      gl3d = Neck3D.create(canvas, { frets: 12 });
    } catch (e) {
      gl3d = null;
      console.error(e);
    }
    if (!gl3d) {
      const hint = $('#gl-hint');
      if (hint) hint.textContent = 'הדפדפן הזה לא תומך בתלת־ממד (WebGL). נסה תצוגה אחרת.';
      return;
    }
    // Dragging turns the neck. Pointer events cover mouse and touch together,
    // and capture keeps the drag alive when it leaves the canvas.
    const down = (e) => {
      glDrag = { x: e.clientX, y: e.clientY, ...gl3d.view };
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (!glDrag || !gl3d) return;
      gl3d.setView(glDrag.orbit + (e.clientX - glDrag.x) * 0.006,
                   glDrag.tilt - (e.clientY - glDrag.y) * 0.006);
      e.preventDefault();
    };
    const up = () => { glDrag = null; };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    gl3d.canvas = canvas;
    drawGl(liveChord());
  }

  function stopGl() {
    if (gl3d && gl3d.dispose) { try { gl3d.dispose(); } catch (e) { /* already gone */ } }
    gl3d = null; glDrag = null;
  }

  /* Chord targets never change for a given chord, and solving a finger now
     searches two dozen bend directions for clearance — far too much to redo
     sixty times a second for a shape that is standing still. */
  const glTargetCache = new Map();
  function targetsFor(chord) {
    if (!chord) return null;
    if (!glTargetCache.has(chord)) glTargetCache.set(chord, Fretboard.chordTargets(chord));
    return glTargetCache.get(chord);
  }

  /**
   * What the hand should be doing at this instant.
   *
   * A real player leaves the old chord before the new one sounds, so the
   * hand arrives with the beat instead of jumping on it. The app knows the
   * whole chord timeline in advance, so the move can start early by exactly
   * the time it needs — capped at half a beat, because at a fast tempo there
   * is no more than that to spare.
   */
  function glTargetsAt(time) {
    const t = state.currentTrackId ? Store.getTrack(state.currentTrackId) : null;
    const a = t && t.analysis;
    if (!a || !a.chords) return targetsFor(liveChord());
    const seg = A.chordAt(a, time);
    if (!seg) return null;
    const beat = a.bpm ? 60 / a.bpm : 0.5;
    const travel = Math.min(0.22, beat * 0.5);
    const next = A.chordAt(a, seg.end + 0.01);
    if (!next || next.chord === seg.chord) return targetsFor(seg.chord);
    const startsMovingAt = seg.end - travel;
    if (time < startsMovingAt) return targetsFor(seg.chord);
    const u = Math.max(0, Math.min(1, (time - startsMovingAt) / travel));
    // Ease so the hand sets off and settles rather than sliding at a
    // constant rate, which reads as a machine part.
    const e = u * u * (3 - 2 * u);
    return Neck3D.blendTargets(targetsFor(seg.chord), targetsFor(next.chord), e);
  }

  function drawGl(chord) {
    if (!gl3d || !gl3d.canvas) return;
    const box = gl3d.canvas.parentElement.getBoundingClientRect();
    if (!box.width || !box.height) return;
    gl3d.canvas.style.width = box.width + 'px';
    gl3d.canvas.style.height = box.height + 'px';
    const targets = glTargetsAt(P.time() || 0) || targetsFor(chord);
    gl3d.render(box.width, box.height, gl3d.pose(targets), state.glTargets !== false);
    // A frame counter, because the whole reason to build this before the
    // character is to find out what it costs on a phone.
    const now = performance.now();
    glFps.n++;
    if (now - glFps.at > 1000) {
      glFps.value = Math.round(glFps.n * 1000 / (now - glFps.at));
      glFps.n = 0; glFps.at = now;
      const hint = $('#gl-hint');
      if (hint) hint.textContent = `גרור כדי לסובב · ${glFps.value} fps`;
    }
  }

  /** Whatever chord the song is on right now, or null between analyses. */
  function liveChord() {
    const t = state.currentTrackId ? Store.getTrack(state.currentTrackId) : null;
    const seg = t && t.analysis ? A.chordAt(t.analysis, P.time() || 0) : null;
    return seg ? seg.chord : null;
  }

  /**
   * Paints the fingering onto the character's photograph.
   *
   * Sized from the picture as it is actually laid out rather than from its
   * natural size, because `object-fit: contain` leaves bars at the sides on
   * some shapes and the marks have to sit on the picture, not on the box.
   */
  function drawNeckOverlay(chord, motion) {
    const img = $('#neck-stage-img'), cv = $('#neck-stage-cv');
    if (!img || !cv) return;
    const c = stageChar();
    if (!c || !Neck.isCalibrated(c.neck)) return;
    const host = cv.parentElement.getBoundingClientRect();
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh || !host.width) return;
    // where `contain` actually put the picture inside the box
    const k = Math.min(host.width / nw, host.height / nh);
    const w = nw * k, h = nh * k;
    const ox = (host.width - w) / 2, oy = (host.height - h) / 2;

    if (cv.width !== Math.round(host.width * devicePixelRatio) ||
        cv.height !== Math.round(host.height * devicePixelRatio)) {
      cv.width = Math.round(host.width * devicePixelRatio);
      cv.height = Math.round(host.height * devicePixelRatio);
      cv.style.width = host.width + 'px';
      cv.style.height = host.height + 'px';
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, host.width, host.height);
    ctx.save();
    ctx.translate(ox, oy);
    const f = chord ? MM.guitarFingering(chord) : null;
    const cal = scaleCal(c.neck, w, h);
    const S = Math.max(w, h);
    Neck.draw(ctx, cal, f, { scale: S });
    const m = motion || {};
    Neck.drawStrum(ctx, cal, f, {
      scale: S,
      phase: m.beat ? m.beat.phase : 0.5,
      isDown: m.beat ? m.beat.isDown : false,
      energy: m.energy,
      playing: m.playing !== false
    });
    ctx.restore();
  }

  let lastReadoutChord = null;
  function updateHandReadout(chord) {
    if (chord === lastReadoutChord) return;
    lastReadoutChord = chord;
    const box = $('#hand-readout'), dia = $('#chord-diagram');
    if (!box) return;
    if (!chord) { box.textContent = 'אין אקורד בנקודה הזו.'; if (dia) dia.innerHTML = ''; return; }
    const isPiano = state.performer
      ? state.performer.instrument === 'piano'
      : stageInstrument() === 'piano';
    let handText = '', diagram = '';
    if (isPiano) {
      const v = MM.pianoVoicing(chord, 4);
      handText = v ? v.placementHe : '';
      diagram = PF.keyboardDiagramSVG(chord, 270);
    } else {
      const f = MM.guitarFingering(chord);
      handText = f ? f.placementHe : 'אין צורת אקורד בספרייה';
      diagram = f ? PF.chordDiagramSVG(chord, 150) : '';
    }
    box.innerHTML = `<b>${esc(chord)}</b><br>${esc(handText)}`;
    if (dia) dia.innerHTML = diagram;
    // hero mode shows the same fingering as an overlay on the render
    const hh = $('#hero-hand'), hd = $('#hero-diagram'), hc = $('#hero-chord');
    if (hh) hh.textContent = handText;
    if (hd) hd.innerHTML = diagram;
    if (hc) hc.textContent = chord;
    setHeroImage(chord);
    // The neck overlay is not repainted here: it now redraws every frame from
    // syncFrame, because the strumming hand moves between chord changes.
    // The same fingering on the stage itself, which is all that survives into
    // focus mode — the side panel that used to carry it is out of the layout.
    // Say plainly whether this chord was heard or carried over from the
    // analysed part, so an inference is never mistaken for a reading.
    const hs = $('#hud-src');
    if (hs) {
      const t2 = state.currentTrackId ? Store.getTrack(state.currentTrackId) : null;
      const seg = t2 && t2.analysis ? A.chordAt(t2.analysis, P.time() || 0) : null;
      const ext = !!(seg && seg.extended);
      const label = ext ? 'משוער' : 'מדוד';
      if (hs.textContent !== label) {
        hs.textContent = label;
        hs.style.color = ext ? 'var(--warn)' : '';
      }
    }
    const sc = $('#scc-chord'), sd = $('#scc-diagram'), sh = $('#scc-hand');
    if (sc) sc.textContent = chord;
    if (sd) sd.innerHTML = diagram;
    if (sh) sh.textContent = handText;
    document.querySelectorAll('.next-chord').forEach(n =>
      n.classList.toggle('current', n.dataset.c === chord));
  }

  /* ---------------- player bar ---------------- */
  function updatePlayerBar() {
    const t = state.currentTrackId ? Store.getTrack(state.currentTrackId) : null;
    const bar = $('#player');
    if (!t) {
      bar.innerHTML = `<div class="np"><div class="np-text"><div class="np-title" style="color:var(--text-3)">לא מנגן</div>
        <div class="np-artist">בחר שיר מהספרייה</div></div></div>`;
      return;
    }
    bar.innerHTML = `
      <div class="np">
        <img class="np-art" src="${MM.thumbUrl(t.videoId)}" alt="">
        <div class="np-text">
          <div class="np-title">${esc(t.title)}</div>
          <div class="np-artist">${esc(t.artist || '—')}${t.analysis && t.analysis.bpm ? ' · ' + Math.round(t.analysis.bpm) + ' BPM' : ''}</div>
        </div>
      </div>
      <div class="transport">
        <div class="transport-btns">
          <button class="tbtn" data-action="prev" aria-label="הקודם">${icons.prev}</button>
          <button class="tbtn" data-action="back10" aria-label="אחורה" style="font-size:11px;font-weight:800">-10</button>
          <button class="tbtn tbtn-play" data-action="toggle" aria-label="נגן">${P.playing ? icons.pause : icons.play}</button>
          <button class="tbtn" data-action="fwd10" aria-label="קדימה" style="font-size:11px;font-weight:800">+10</button>
          <button class="tbtn" data-action="next" aria-label="הבא">${icons.next}</button>
        </div>
        <div class="scrub">
          <span class="time" id="t-cur">0:00</span>
          <div class="bar" id="scrub"><div class="bar-fill" id="scrub-fill" style="width:0%">
            <div class="bar-knob"></div></div></div>
          <span class="time" id="t-dur">0:00</span>
        </div>
      </div>
      <div class="player-right">
        <span class="chord-now" id="chord-now">—</span>
        <span class="beat-dot" id="beat-dot"></span>
        <button class="btn btn-sm" data-route="stage">לבמה</button>
      </div>`;
  }

  /* A metronome for practice tracks. The performer needs a pulse to ride and
     the player needs something audible; the lessons module already owns a
     Web Audio click, so this borrows it rather than growing a second one. */
  function startClick(t) {
    if (!t || !t.analysis || !t.analysis.bpm || !LS || !LS.Audio) return;
    try {
      LS.Audio.ensure();
      LS.Audio.startMetronome(t.analysis.bpm, t.analysis.timeSignature || 4);
    } catch (e) { /* no audio context: the stage still runs, just silently */ }
  }
  function stopClick() {
    try { if (LS && LS.Audio) LS.Audio.stopMetronome(); } catch (e) {}
  }

  function playTrack(id) {
    const t = Store.getTrack(id);
    if (!t) return;
    state.currentTrackId = id;
    state.lastBeatIndex = -1;
    state.lastBar = -1;
    state.loop = null;
    lastReadoutChord = null;
    ensureChordCoverage(t);
    stopClick();
    if (t.videoId) {
      P.load(t.videoId, true);
    } else {
      // A practice track has nothing to stream. The clock runs on its own and
      // a click marks the beat, so the stage still has something to follow.
      P.loadSilent((t.analysis && t.analysis.duration) || 0);
      P.play();
      startClick(t);
    }
    updatePlayerBar();
    if (state.route === 'stage') render();
    else renderSidebar();
  }

  function neighbourTrack(dir) {
    const list = filteredTracks().length ? filteredTracks() : Store.state.tracks;
    if (!list.length) return;
    const i = list.findIndex(t => t.id === state.currentTrackId);
    const n = list[(i + dir + list.length) % list.length];
    if (n) playTrack(n.id);
  }

  /* ============================================================
     Modals: add track / analyze / character / master prompt
     ============================================================ */
  function addTrackModal() {
    modal('הוסף שיר', `
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1">
          <label>קישור יוטיוב</label>
          <div style="display:flex;gap:12px;align-items:flex-start">
            <img id="f-thumb" alt="" style="width:104px;aspect-ratio:16/9;object-fit:cover;
                 border-radius:8px;border:1px solid var(--line);background:var(--panel-2);display:none">
            <div style="flex:1;min-width:0">
              <input id="f-url" placeholder="https://www.youtube.com/watch?v=..." autofocus>
              <div class="hint" id="f-url-hint">הדבק את הקישור — השם, האמן והעטיפה יתמלאו לבד.</div>
            </div>
          </div>
        </div>
        <div class="field"><label>שם השיר</label><input id="f-title" placeholder="שם השיר"></div>
        <div class="field"><label>אמן</label><input id="f-artist" placeholder="שם האמן"></div>
        <div class="field"><label>ז׳אנר</label><input id="f-genre" placeholder="פופ / רוק / מזרחית…" list="genres">
          <datalist id="genres">${[...new Set(Store.state.tracks.map(t => t.genre).filter(Boolean))]
            .map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>
        <div class="field"><label>אלבום (רשות)</label><input id="f-album" placeholder="אלבום"></div>
      </div>`,
      `<button class="btn btn-primary" data-action="save-track">שמור והוסף</button>
       <button class="btn btn-ghost" data-action="close-modal">ביטול</button>`);
    wireTrackAutofill();
  }

  /* Fills the form from the link. The cover comes straight off the video id,
     so it always appears; the title and artist need a lookup that can fail,
     and when it does we say so and leave the fields to the user rather than
     blocking the add. Anything already typed is never overwritten. */
  function wireTrackAutofill() {
    const url = $('#f-url'), thumb = $('#f-thumb'), hint = $('#f-url-hint');
    if (!url) return;
    let lastId = null;

    const apply = () => {
      const id = MM.parseVideoId(url.value.trim());
      if (!id) {
        thumb.style.display = 'none';
        lastId = null;
        return;
      }
      if (id === lastId) return;
      lastId = id;

      thumb.src = MM.thumbUrl(id);
      thumb.style.display = '';
      hint.textContent = 'מושך את פרטי השיר…';

      MM.fetchMeta(id).then(meta => {
        if (lastId !== id) return;                 // link changed while we waited
        if (!meta) {
          hint.textContent = 'לא הצלחתי למשוך את הפרטים אוטומטית — מלא שם ואמן ידנית.';
          return;
        }
        const title = $('#f-title'), artist = $('#f-artist');
        if (title && !title.value.trim()) title.value = meta.title;
        if (artist && !artist.value.trim()) artist.value = meta.artist;
        hint.textContent = 'הפרטים מולאו מהקישור. אפשר לתקן.';
      });
    };

    url.addEventListener('input', apply);
    url.addEventListener('paste', () => setTimeout(apply, 0));
    if (url.value.trim()) apply();
  }

  function saveTrack() {
    const url = $('#f-url').value.trim();
    const videoId = MM.parseVideoId(url);
    if (!videoId) return toast('הקישור לא תקין — הדבק קישור יוטיוב מלא', true);
    const title = $('#f-title').value.trim() || 'שיר ללא שם';
    const t = Store.addTrack({
      videoId, url, title,
      artist: $('#f-artist').value.trim(),
      genre: $('#f-genre').value.trim(),
      album: $('#f-album').value.trim(),
      analysis: null
    });
    closeModal();
    toast('נוסף לספרייה');
    render();
    setTimeout(() => analyzeModal(t.id), 260);
  }

  let autoAnalysis = null;
  let captureControl = {};

  /* Offers only the capture routes this browser actually has, and defaults to
     the best one available. Tab audio is the accurate route but exists on
     desktop Chrome and Edge alone; the microphone is what phones have. Showing
     a dead option and letting it fail at the picker is how the previous
     version left mobile users stranded. */
  function wireCaptureSource() {
    const sel = $('#cap-source'), hint = $('#cap-source-hint');
    if (!sel) return;
    const opts = [];
    if (AA.canCaptureTab()) opts.push(['tab', '🔊 הקול של הכרטיסייה — מדויק']);
    if (AA.canCaptureMic()) opts.push(['mic', '🎤 מיקרופון — עובד גם בנייד']);

    if (!opts.length) {
      sel.innerHTML = '<option>אין קליטה זמינה בדפדפן הזה</option>';
      sel.disabled = true;
      const btn = $('[data-action="capture-tab"]');
      if (btn) btn.disabled = true;
      hint.innerHTML = 'הדפדפן הזה לא מאפשר לא הקלטת כרטיסייה ולא מיקרופון. ' +
                       'השתמש ב<b>"ניתוח מונחה"</b> — הוא עובד בכל מקום.';
      return;
    }
    sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

    const sync = () => {
      hint.innerHTML = sel.value === 'tab'
        ? 'כשייפתח חלון השיתוף: בחר <b>"כרטיסייה"</b> → את <b>הכרטיסייה הזאת</b> → ' +
          'וסמן למטה <b>"שתף גם את האודיו של הכרטיסייה"</b>. בלי הסימון הזה לא ייקלט קול.'
        : 'השיר ינוגן ברמקול והאפליקציה תקשיב לו. <b>הגבר את העוצמה</b>, החזק את ' +
          'הטלפון קרוב, והימנע מרעש. פחות מדויק מקליטת כרטיסייה — ' +
          'הקצב והסולם יוצאים טוב, האקורדים פחות.';
    };
    sel.addEventListener('change', sync);
    sync();
  }

  /* Records this tab's own audio while the song plays, then runs the same
     analyser the file path uses. The player is driven from the top so the
     recording starts where the song does — that keeps the detected beat grid
     aligned to real song time instead of to wherever playback happened to be. */
  async function startTabCapture(trackId) {
    const status = $('#cap-status'), out = $('#cap-result');
    const startBtn = $('[data-action="capture-tab"]'), stopBtn = $('[data-action="capture-stop"]');
    if (!status) return;
    out.innerHTML = '';

    const source = ($('#cap-source') && $('#cap-source').value) || 'tab';
    const capture = source === 'mic' ? AA.captureMicAudio : AA.captureTabAudio;
    if ((source === 'mic' && !AA.canCaptureMic()) || (source === 'tab' && !AA.canCaptureTab())) {
      out.innerHTML = `<div class="hand-readout" style="color:var(--bad)">
        מקור הקליטה הזה לא זמין בדפדפן הזה. השתמש ב"ניתוח מונחה".</div>`;
      return;
    }

    const t = Store.getTrack(trackId);
    const pick = parseFloat($('#cap-secs').value);

    /* "Whole song" used to record for the song's length in wall-clock
       seconds. But recording starts wherever playback has already reached --
       choosing a tab takes several seconds -- so it ran past the end by
       exactly that much and appended whatever played next, while the opening
       it had already passed was never captured at all. It now stops when
       playback reaches the end of the track, which is the thing actually
       meant by "the whole song". */
    const whole = !(pick > 0);

    /* Cue the video before anything else. A cued video reports its own length
       with no ad on top of it, and that number is what tells an ad apart from
       the song for the rest of the recording — as well as being the "whole
       song" stop line. Asking for it up front also means the user is never
       told to "press play once first". */
    if (t && t.videoId && P.ready && (P.videoId !== t.videoId || !P.duration)) {
      status.textContent = 'טוען את השיר…';
      P.load(t.videoId, false);
      for (let i = 0; i < 40 && !P.duration; i++) await new Promise(r => setTimeout(r, 150));
    }
    const songLen = Math.ceil(P.duration || 0);
    if (whole && !songLen) {
      out.innerHTML = `<div class="hand-readout" style="color:var(--bad)">
        לא הצלחתי לקרוא את אורך השיר מהנגן. נסה שוב, או בחר משך קבוע.</div>`;
      status.textContent = '';
      return;
    }
    const secs = whole ? songLen : pick;

    captureControl = {};
    startBtn.disabled = true;
    stopBtn.style.display = '';
    // Seconds of song actually recorded — ad time does not count toward the
    // fixed-length choice, or a pre-roll would eat most of "record a minute".
    let songSecs = 0, lastTick = 0, adSeen = false;
    // Ads and stalls make wall clock longer than the song; this is the point
    // past which something has clearly gone wrong and we stop regardless.
    const ceiling = whole ? songLen * 2 + 180 : secs * 3 + 120;
    let rolling = false, playFailed = false, watch = null;

    const restore = () => {
      startBtn.disabled = false;
      stopBtn.style.display = 'none';
      captureControl = {};
      if (watch) { clearInterval(watch); watch = null; }
    };

    try {
      /* Ask for the audio before touching the player.
         The song used to be started first, on the reasoning that the tab
         picker takes a few seconds and the recording would otherwise open on
         silence. But that is exactly backwards: the song played through the
         whole permission dialog and those seconds — the intro, usually the
         part with the clearest chords — were never recorded at all. Now the
         stream goes live first and the song starts from the top afterwards,
         so nothing plays into a recorder that is not listening yet. */
      status.textContent = source === 'mic'
        ? 'אשר גישה למיקרופון — השיר יתחיל מיד אחרי כן'
        : 'בחר את הכרטיסייה הזאת וסמן "שתף גם את האודיו" — השיר יתחיל מיד אחרי כן';
      const { segments } = await capture({
        seconds: secs,
        control: captureControl,
        /* Two reasons not to be recording: the song has not started yet, and
           an ad is playing over it. An ad's sound in the take would shift
           every chord after it by the ad's length. */
        wanted: () => rolling && !P.adPlaying,
        onStart: () => {
          // The stream is live, so now the song can run from the top.
          if (t && t.videoId && P.ready) {
            P.seek(0); P.play();
            const from = Date.now();
            watch = setInterval(() => {
              // An ad counts as started: playback is running, and `wanted`
              // holds the recorder off on its own until the song is back.
              if (P.playing) { rolling = true; clearInterval(watch); watch = null; }
              else if (Date.now() - from > 5000) {
                playFailed = true;
                clearInterval(watch); watch = null;
                if (captureControl.stop) captureControl.stop();
              }
            }, 60);
          } else {
            rolling = true;      // nothing here drives playback; take what is audible
          }
        },
        position: () => Math.max(0, P.time() || 0),
        nothingWantedMessage: 'רק פרסומות התנגנו לאורך כל ההקלטה. המתן שהשיר יתחיל ונסה שוב.',
        /* For the whole song, the end of the track is the stop condition; a
           fixed length counts recorded song, not wall clock, so an ad does
           not eat most of "record a minute". The 2s floor keeps a mis-read
           duration from ending the recording immediately, and the ceiling
           makes sure a stalled player or an endless ad break ends the
           recording rather than leaving it running forever. */
        shouldStop: (elapsed) => {
          if (elapsed >= ceiling) return true;
          return whole
            ? (elapsed > 2 && !P.adPlaying && P.duration > 0 &&
               P.time() >= P.duration - 0.25)
            : songSecs >= secs;
        },
        onTick: (elapsed) => {
          const dt = lastTick ? elapsed - lastTick : 0;
          lastTick = elapsed;
          if (!rolling) {
            // The seconds before the song answers are nobody's: they are not
            // song, so they must not count against a fixed-length take.
            status.textContent = 'מתחיל את השיר…';
            return;
          }
          if (P.adPlaying) {
            adSeen = true;
            status.textContent = 'פרסומת מתנגנת — ההקלטה ממתינה ותמשיך מעצמה…';
            return;
          }
          songSecs += dt;
          // Against the song, not against a stopwatch: with ads in the way the
          // two differ, and the song's own position is what the user can verify.
          const at = Math.floor(P.time() || 0);
          const of = Math.round(P.duration || secs);
          status.textContent = whole
            ? `מקליט… ${fmt(at)} / ${fmt(of)} מהשיר`
            : `מקליט… ${Math.floor(songSecs)} / ${Math.round(secs)} שניות`;
        }
      });

      P.pause();
      status.textContent = 'מנתח…';
      /* Each segment is a piece of the same song at a known position, so each
         is analysed on its own and rebased onto song time before they are
         stitched back together. Pieces too short to hold a bar or two say
         nothing reliable about tempo, so they are left out. */
      const long = segments.filter(s => s.len >= 8);
      /* ...unless nothing is that long, which is what stopping early looks
         like. A short take is still the take the user asked for, so analyse
         the best of what there is rather than refusing outright. */
      const chosen = long.length ? long
        : segments.length ? [segments.reduce((a, b) => b.len > a.len ? b : a)] : [];
      const parts = [];
      for (const [i, seg] of chosen.entries()) {
        status.textContent = chosen.length > 1
          ? `מנתח קטע ${i + 1} מתוך ${chosen.length}…` : 'מנתח…';
        parts.push(AA.shiftAnalysis(
          await AA.analyzeFile(seg.buf, m => { status.textContent = m; }), seg.at));
      }
      if (!parts.length) throw new Error(
        'ההקלטה נקטעה על ידי פרסומות ולא נשאר בה מספיק מהשיר כדי לנתח. נסה שוב.');
      const a = A.mergeAnalyses(parts);
      /* The recorder opens on the first tick after playback is confirmed, so
         the take can begin a fraction of a second into the song. Left alone
         that fraction has no chord over it at all; the opening chord plainly
         covers it, so it is pulled back to the top of the song. */
      if (a.chords.length && a.chords[0].start > 0 && a.chords[0].start < 1.5) {
        a.chords[0] = { ...a.chords[0], start: 0 };
        if (a.sections && a.sections.length) a.sections[0].start = 0;
      }
      // The recording may be shorter than the song; the chart should still span
      // the whole track, so keep the player's length as the authority.
      if (P.duration && P.duration > a.duration) a.duration = +P.duration.toFixed(2);
      autoAnalysis = a;
      status.textContent = '';
      out.innerHTML = renderAutoResult(a, 'הקלטה מהכרטיסייה') +
        (adSeen ? `<div class="hint" style="margin-top:8px;color:var(--warn)">
          זוהתה פרסומת במהלך ההשמעה. הקול שלה לא נכלל בניתוח, וההקלטה נמשכה
          אחריה${parts.length > 1 ? ` — השיר נותח ב-${parts.length} קטעים` : ''}.</div>` : '');
    } catch (err) {
      P.pause();
      status.textContent = '';
      // Autoplay is the one failure the recorder cannot describe: it got a
      // live stream and heard nothing, because the song never started.
      const msg = playFailed
        ? 'הדפדפן לא נתן לשיר להתחיל לבד. לחץ נגן פעם אחת כדי לאשר לו, ואז הפעל ניתוח שוב.'
        : (err.message || 'ההקלטה נכשלה');
      out.innerHTML = `<div class="hand-readout" style="color:var(--bad)">${esc(msg)}</div>`;
    } finally {
      restore();
    }
  }

  /** Show what the analyzer found, and be honest about how sure it is. */
  function renderAutoResult(a, filename) {
    const prog = A.progressionOf(a);
    const conf = a.confidence || {};
    const badge = v => v >= .7 ? 'on' : '';
    const note = v => v >= .7 ? 'ביטחון גבוה' : v >= .45 ? 'ביטחון בינוני — כדאי לאמת' : 'ביטחון נמוך — בדוק ידנית';
    return `
      <div class="hand-readout" style="margin-bottom:12px">
        <b>${esc(filename)}</b><br>${esc(A.summaryLine(a))}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <span class="pill ${badge(conf.tempo)}">קצב ${Math.round(a.bpm)} BPM · ${esc(note(conf.tempo || 0))}</span>
        ${MM.keyLabel(a) ? `<span class="pill ${badge(conf.key)}">סולם ${esc(MM.keyLabel(a))} · ${esc(note(conf.key || 0))}</span>` : ''}
        <span class="pill">${(a.beatTimes || []).length} ביטים</span>
        <span class="pill">${(a.sections || []).length} סקשנים</span>
      </div>
      ${prog.length ? `<div class="next-chords">${prog.slice(0, 20).map(c =>
        `<span class="next-chord">${esc(c)}</span>`).join('')}</div>` : ''}
      <div class="hint" style="margin-top:10px">
        זיהוי אקורדים הוא הערכה — במיקס צפוף הוא פחות מדויק. אפשר לתקן ידנית בלשונית "ניתוח מונחה".
      </div>`;
  }

  function analyzeModal(id) {
    const t = Store.getTrack(id);
    if (!t) return;
    const a = t.analysis || {};
    const prog = a.chords ? A.progressionOf(a).join(' ') : '';
    const dur = a.duration || Math.round(P.duration) || 0;
    modal(`ניתוח — ${esc(t.title)}`, `
      <div class="tabs">
        <button class="tab active" data-tab="tab">🔴 הקלט מהשיר</button>
        <button class="tab" data-tab="auto">🎧 נתח קובץ אודיו</button>
        <button class="tab" data-tab="assist">ניתוח מונחה</button>
        <button class="tab" data-tab="json">ייבוא מהסקיל</button>
      </div>
      <div id="tab-tab">
        <div class="panel-desc" style="margin-bottom:16px">
          אין צורך בקובץ אודיו. האפליקציה מקליטה את הקול של הכרטיסייה הזאת
          ומוציאה ממנו <b>BPM, סולם, אקורדים ומבנה</b>.
          <b>סדר הפעולות:</b> קודם תתבקש לאשר, ורק אחרי שתאשר השיר יתחיל
          מההתחלה — כדי שגם הפתיחה תיכנס להקלטה ולא תתנגן בזמן שאתה מאשר.
          ההקלטה לא נשמרת ולא נשלחת לשום מקום.
        </div>
        <div class="field" style="max-width:340px">
          <label>מאיפה לקלוט</label>
          <select id="cap-source"></select>
          <div class="hint" id="cap-source-hint"></div>
        </div>
        <div class="field" style="max-width:280px">
          <label>כמה להקליט</label>
          <select id="cap-secs">
            <option value="60">דקה — מהיר, מספיק לרוב השירים</option>
            <option value="120">שתי דקות</option>
            <option value="0">כל השיר — הכי מדויק (לוקח כאורך השיר)</option>
          </select>
          <div class="hint">הפרוגרסיה חוזרת על עצמה, ולכן דקה בדרך כלל מספיקה.
            "כל השיר" מקליט עד הסוף בפועל, בלי הגבלת זמן — ולכן נמשך בדיוק כאורך השיר.
            אם יוטיוב מכניס פרסומת, ההקלטה עוצרת לזמן הפרסומת וממשיכה אחריה לבד;
            הפרסומת לא נכנסת לניתוח.</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px">
          <button class="btn btn-primary" data-action="capture-tab">התחל הקלטה וניתוח</button>
          <button class="btn btn-ghost" data-action="capture-stop" style="display:none">עצור וסיים</button>
          <span id="cap-status" style="font-size:13px;color:var(--text-3)"></span>
        </div>
        <div id="cap-result" style="margin-top:16px"></div>
      </div>
      <div id="tab-auto" style="display:none">
        <div class="panel-desc" style="margin-bottom:16px">
          העלה קובץ אודיו של השיר (mp3 / wav / m4a) והאפליקציה תוציא לבד
          <b>BPM, רשת ביטים, סולם, אקורדים ומבנה</b> — בלי פייתון ובלי הזנה ידנית.
          הניתוח רץ מקומית בדפדפן; הקובץ לא נשלח לשום מקום.
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary" data-action="pick-audio">בחר קובץ אודיו</button>
          <span id="auto-status" style="font-size:13px;color:var(--text-3)"></span>
        </div>
        <div id="auto-result" style="margin-top:16px"></div>
      </div>
      <div id="tab-assist" style="display:none">
        <div class="form-grid">
          <div class="field"><label>BPM (קצב)</label>
            <div style="display:flex;gap:8px">
              <input id="a-bpm" type="number" step="0.1" value="${a.bpm || ''}" placeholder="120" style="flex:1">
              <button class="btn btn-sm" data-action="tap">הקש קצב</button>
            </div>
            <div class="hint" id="tap-hint">לחץ "הקש קצב" בקצב השיר — לפחות 4 הקשות.</div></div>
          <div class="field"><label>אורך (שניות)</label>
            <input id="a-dur" type="number" value="${dur}" placeholder="200">
            <div class="hint">נטען אוטומטית מהנגן אם השיר מנוגן.</div></div>
          <div class="field"><label>סולם</label>
            <select id="a-tonic">${MM.PITCHES.map(p =>
              `<option ${a.key && a.key.tonic === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
          <div class="field"><label>מודוס</label>
            <select id="a-mode">
              <option value="major" ${a.key && a.key.mode === 'major' ? 'selected' : ''}>מז׳ור</option>
              <option value="minor" ${a.key && a.key.mode === 'minor' ? 'selected' : ''}>מינור</option>
            </select></div>
          <div class="field"><label>היסט לביט הראשון (שניות)</label>
            <input id="a-off" type="number" step="0.01" value="${a.firstBeat || 0}">
            <div class="hint">אם הדמות "מקדימה" או "מאחרת" — כוונן כאן.</div></div>
          <div class="field"><label>תיבות לכל אקורד</label>
            <input id="a-bars" type="number" step="0.5" value="${a.barsPerChord || 1}"></div>
          <div class="field" style="grid-column:1/-1"><label>פרוגרסיית אקורדים</label>
            <input id="a-prog" value="${esc(prog)}" placeholder="Am F C G">
            <div class="hint">רווח בין אקורדים. הפרוגרסיה תחזור על עצמה לאורך השיר.
              אקורדים נתמכים: ${MM.CHORD_NAMES.slice(0, 24).join(' ')}…</div></div>
        </div>
      </div>
      <div id="tab-json" style="display:none">
        <div class="field">
          <label>הדבק JSON מהצנרת של הסקיל</label>
          <textarea id="a-json" placeholder='הדבק כאן את התוכן של analysis.json ו/או chords.json — אפשר גם מערך של שניהם' style="min-height:200px"></textarea>
          <div class="hint">מזוהים אוטומטית: bpm, key, beat_times, downbeats, sections, chords, cut_grid.</div>
        </div>
        <div class="code">python scripts/analyze_music.py work/audio.wav --out work/analysis.json
python scripts/extract_chords.py work/audio.wav --beats work/analysis.json --out work/chords.json</div>
      </div>`,
      `<button class="btn btn-primary" data-action="save-analysis" data-id="${id}">שמור ניתוח</button>
       <button class="btn btn-ghost" data-action="close-modal">ביטול</button>`);

    autoAnalysis = null;
    wireCaptureSource();
    const tapper = A.TapTempo();
    const back = $('.modal-back');
    back.addEventListener('click', e => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        back.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === tab));
        for (const t of ['tab', 'auto', 'assist', 'json'])
          $('#tab-' + t).style.display = tab.dataset.tab === t ? '' : 'none';
      }
      if (e.target.closest('[data-action="capture-tab"]')) { startTabCapture(id); return; }
      if (e.target.closest('[data-action="capture-stop"]')) {
        if (captureControl.stop) captureControl.stop();
        return;
      }
      if (e.target.closest('[data-action="pick-audio"]')) {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'audio/*';
        inp.onchange = async () => {
          const f = inp.files[0]; if (!f) return;
          const status = $('#auto-status'), out = $('#auto-result');
          out.innerHTML = '';
          try {
            const a = await AA.analyzeFile(f, m => { status.textContent = m; });
            autoAnalysis = a;
            status.textContent = '';
            out.innerHTML = renderAutoResult(a, f.name);
          } catch (err) {
            status.textContent = '';
            out.innerHTML = `<div class="hand-readout" style="color:var(--bad)">${esc(err.message || 'הניתוח נכשל')}</div>`;
          }
        };
        inp.click();
        return;
      }
      if (e.target.closest('[data-action="tap"]')) {
        const bpm = tapper.tap();
        $('#tap-hint').textContent = bpm ? `${tapper.count} הקשות · ${bpm} BPM` : 'המשך להקיש…';
        if (bpm) $('#a-bpm').value = bpm;
      }
    });
    if (!dur && P.duration) $('#a-dur').value = Math.round(P.duration);
  }

  function saveAnalysis(id) {
    const t = Store.getTrack(id);
    if (!t) return;
    const jsonText = ($('#a-json') && $('#a-json').value || '').trim();
    const jsonVisible = $('#tab-json').style.display !== 'none';
    // Both the recorder and the file picker land in autoAnalysis.
    const shown = sel => $(sel) && $(sel).style.display !== 'none';
    const capVisible = shown('#tab-tab'), autoVisible = shown('#tab-auto');
    let analysis;
    try {
      if (capVisible || autoVisible) {
        if (!autoAnalysis) {
          return toast(capVisible ? 'הקלט ונתח קודם, או עבור ללשונית אחרת'
                                  : 'נתח קודם קובץ אודיו, או עבור ללשונית אחרת', true);
        }
        analysis = autoAnalysis;
      } else if (jsonVisible && jsonText) {
        analysis = A.fromSkillJson(JSON.parse(jsonText), P.duration);
      } else {
        const bpm = parseFloat($('#a-bpm').value);
        if (!bpm || bpm < 20 || bpm > 300) return toast('הזן BPM תקין (20–300)', true);
        const duration = parseFloat($('#a-dur').value) || P.duration || 0;
        if (!duration) return toast('הזן אורך שיר בשניות', true);
        const progRaw = ($('#a-prog').value || '').trim();
        const progression = progRaw ? progRaw.split(/[\s,|]+/).filter(Boolean) : [];
        const unknown = progression.filter(c => !MM.GUITAR[c]);
        if (unknown.length) toast('אקורדים לא מוכרים: ' + unknown.join(', '), true);
        analysis = A.fromProgression({
          bpm, duration,
          key: { tonic: $('#a-tonic').value, mode: $('#a-mode').value },
          firstBeat: parseFloat($('#a-off').value) || 0,
          barsPerChord: parseFloat($('#a-bars').value) || 1,
          progression
        });
        analysis.barsPerChord = parseFloat($('#a-bars').value) || 1;
      }
    } catch (e) {
      return toast('ה-JSON לא תקין: ' + e.message, true);
    }
    /* Carry the progression over the part of the song that was not analysed,
       so the stage does not fall silent partway through a track that is still
       playing. Marked as inference, not measurement. */
    const songLen = Math.max(analysis.duration || 0, P.duration || 0);
    A.extendChords(analysis, songLen);
    if (songLen > (analysis.duration || 0)) analysis.duration = +songLen.toFixed(2);

    Store.updateTrack(id, { analysis });
    closeModal();
    toast(analysis.analysedTo
      ? `הניתוח נשמר · נותח עד ${fmt(analysis.analysedTo)}, המשך הפרוגרסיה הושלם`
      : 'הניתוח נשמר · ' + A.summaryLine(analysis));
    lastReadoutChord = null;
    render();
  }

  const opts = (arr, sel) => arr.map(o =>
    `<option value="${o.id}" ${sel === o.id ? 'selected' : ''}>${esc(o.he)}</option>`).join('');

  function characterModal(id) {
    const c = id ? Store.getCharacter(id) : {};
    modal(id ? 'עריכת דמות' : 'דמות חדשה', `
      <div class="form-grid">
        <div class="field"><label>שם הדמות</label>
          <input id="c-name" value="${esc(c.name || '')}" placeholder="למשל: נעם, הגיטריסט" autofocus></div>
        <div class="field"><label>כלי נגינה</label>
          <select id="c-inst">
            <option value="guitar" ${c.instrument === 'guitar' ? 'selected' : ''}>🎸 גיטרה</option>
            <option value="piano" ${c.instrument === 'piano' ? 'selected' : ''}>🎹 פסנתר</option>
          </select></div>
        <div class="field"><label>סגנון</label>
          <select id="c-style">${opts(CH.STYLES, c.style)}</select>
          <div class="hint">סגנונות "ריאליסטי" פותחים שדות פוטוריאליזם נוספים.</div></div>
        <div class="field"><label>גיל / מראה כללי</label>
          <input id="c-age" value="${esc(c.age || '')}" placeholder="a man in his mid-20s"></div>
        <div class="field"><label>ארכיטיפ</label>
          <select id="c-archetype">${opts(CH.ARCHETYPES, c.archetype)}</select>
          <div class="hint">דמות לא-אנושית חייבת הצהרה מפורשת, אחרת המודל מחזיר אותה לאנושית.</div></div>
        <div class="field" style="grid-column:1/-1"><label>מאפיינים ייחודיים / לא-אנושיים</label>
          <input id="c-features" value="${esc(c.features || '')}"
            placeholder="long pointed ears, silver-white waist-length hair, pale luminous blue eyes"></div>

        <div class="field" style="grid-column:1/-1"><label>זהות הדמות (ננעלת וחוזרת מילה במילה)</label>
          <textarea id="c-desc" placeholder="פנים, שיער, מבנה גוף, פרט חתימה — באנגלית עובד הכי טוב">${esc(c.description || '')}</textarea>
          <div class="hint">לדוגמה: short dark curly hair, light stubble, warm olive skin, calm confident gaze, thin red string bracelet on the right wrist</div></div>
        <div class="field"><label>לבוש (ברירת מחדל)</label>
          <input id="c-wardrobe" value="${esc(c.wardrobe || '')}" placeholder="cream ribbed knit polo shirt, off-white trousers"></div>
        <div class="field"><label>לבוש בסקשנים בשיא</label>
          <input id="c-wardrobe-alt" value="${esc(c.wardrobeAlt || '')}" placeholder="black leather jacket over a black tee, leather trousers">
          <div class="hint">רשות. הלבוש מתחלף בפזמונים — הזהות נשארת זהה.</div></div>
        <div class="field"><label>שפה עיצובית לכלי</label>
          <select id="c-insttheme">${opts(CH.INSTRUMENT_THEMES, c.instrumentTheme)}</select></div>
        <div class="field"><label>עיצוב הכלי (פירוט חופשי)</label>
          <input id="c-instdetail" value="${esc(c.instrumentDetail || '')}" placeholder="custom electric guitar, polished gold body">
          <div class="hint">כמה שיותר ספציפי — הכלי הוא חצי מהקומפוזיציה.</div></div>

        <div id="photoreal-fields" style="display:contents">
          <div class="field"><label>מצלמה / עדשה</label><select id="c-camera">${opts(CH.CAMERAS, c.camera)}</select></div>
          <div class="field"><label>תאורה</label><select id="c-lighting">${opts(CH.LIGHTING, c.lighting)}</select></div>
          <div class="field"><label>רקע ל-hero</label><select id="c-backdrop">${opts(CH.BACKDROPS, c.backdrop)}</select></div>
          <div class="field"><label>מרקם עור</label><select id="c-skin">${opts(CH.SKIN, c.skin)}</select></div>
        </div>
        <div class="field" style="grid-column:1/-1"><label>סצנת ההופעה (לפאנלים של הקליפ)</label>
          <select id="c-scene">${opts(CH.SCENES, c.scene)}</select>
          <div class="hint">ה-hero הוא פורטרט מבוקר שנועל זהות; הפאנלים מתרחשים בסצנה החיה.</div></div>

        <div class="field"><label>פלטת צבעים</label>
          <select id="c-palette">${CH.PALETTES.map(p =>
            `<option value="${esc(p.v)}" ${c.palette === p.v ? 'selected' : ''}>${p.he}</option>`).join('')}</select></div>
        <div class="field"><label>עולם / סביבה (עוקף את הרקע)</label>
          <input id="c-world" value="${esc(c.world || '')}" placeholder="השאר ריק כדי להשתמש ברקע שנבחר"></div>

        <div class="field" style="grid-column:1/-1"><label>תמונת הדמות (hero keyframe)</label>
          <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
            <img id="c-portrait-prev" src="${c.portrait || ''}"
              style="width:96px;height:120px;object-fit:cover;border-radius:10px;border:1px solid var(--line);background:var(--panel-2);${c.portrait ? '' : 'display:none'}">
            <button class="btn btn-sm" data-action="pick-portrait">בחר תמונה</button>
            <button class="btn btn-sm" data-action="calibrate-neck" ${c.portrait ? '' : 'disabled'}>
              <span id="c-neck-label">${c.neck ? '✓ הצוואר מכויל — כייל מחדש' : 'כייל את הצוואר'}</span></button>
            ${c.portrait ? '<button class="btn btn-sm btn-ghost" data-action="clear-portrait" style="color:var(--bad)">הסר</button>' : ''}
          </div>
          <div class="hint">אחרי שיצרת את ה-hero בכלי חיצוני — צרף אותו כאן. הוא יופיע על הדמות ויוכל לעלות לבמה.
            <b>כיול הצוואר</b> מסמן על התמונה איפה הגיטרה נמצאת, וכך האפליקציה יכולה לצייר את
            האצבעות במקום הנכון עליה — הדמות נשארת התמונה שלך, רק הסימונים משתנים.</div></div>
      </div>`,
      `<button class="btn btn-primary" data-action="save-char" ${id ? `data-id="${id}"` : ''}>שמור דמות</button>
       ${id ? `<button class="btn" data-action="char-brief" data-id="${id}">תדריך דמות</button>` : ''}
       ${id ? `<button class="btn btn-ghost" data-action="del-char" data-id="${id}" style="color:var(--bad)">מחק</button>` : ''}
       <button class="btn btn-ghost" data-action="close-modal">ביטול</button>`);

    pendingPortrait = c.portrait || null;
    pendingNeck = c.neck || null;
    charModalId = id || null;
    const styleSel = $('#c-style');
    const syncPhotoreal = () => {
      const on = CH.isPhotoreal({ style: styleSel.value });
      $('#photoreal-fields').style.display = on ? 'contents' : 'none';
    };
    styleSel.addEventListener('change', syncPhotoreal);
    syncPhotoreal();
  }

  let pendingPortrait = null;
  let pendingNeck = null;

  /* Opening a modal closes whatever was open, so stepping out to calibrate
     the neck would throw away everything typed into the character form. The
     form is carried across and put back instead. */
  let charModalId = null, charDraft = null;
  const CHAR_FIELDS = ['c-name', 'c-instrument', 'c-style', 'c-desc', 'c-outfit',
    'c-camera', 'c-lighting', 'c-backdrop', 'c-skin', 'c-palette', 'c-world'];
  function snapshotCharForm() {
    const v = {};
    CHAR_FIELDS.forEach(k => { const el = $('#' + k); if (el) v[k] = el.value; });
    return v;
  }
  function restoreCharForm(v) {
    if (!v) return;
    CHAR_FIELDS.forEach(k => {
      const el = $('#' + k);
      if (el && v[k] != null) {
        el.value = v[k];
        // the style field drives which other fields are shown
        if (k === 'c-style') el.dispatchEvent(new Event('change'));
      }
    });
  }

  /* ---------------- neck calibration ----------------
     Marking three points on the photograph is all it takes to know where
     every string and fret falls on it — but only the person looking at the
     picture can say where they are, so this is a short guided task rather
     than something the app can work out on its own. The fret ladder drawn
     on top is the check: if it lands on the frets in the photo, it is right,
     and nobody has to take the app's word for it. */
  const NECK_STEPS = [
    { key: 'nut', label: 'ה-nut', hint: 'הקצה העליון של הצוואר — הפס שבו הפרטים מתחילים, ליד ראש הגיטרה.' },
    { key: 'twelfth', label: 'פרט 12', hint: 'אמצע המיתר. בדרך כלל מסומן בשתי נקודות על הצוואר, או נקודה גדולה אחת.' },
    { key: 'bridge', label: 'הגשר', hint: 'המקום שבו המיתרים נתפסים בגוף הגיטרה.' }
  ];
  let neckDraft = null, neckStep = 0;

  function calibrateNeckModal() {
    const src = pendingPortrait;
    if (!src) return toast('צרף קודם תמונה לדמות', true);
    neckDraft = Object.assign({ wNut: 0.012, w12: 0.018, flip: false, strum: 0.85 }, pendingNeck || {});
    neckStep = pendingNeck ? NECK_STEPS.length : 0;

    modal('כיול צוואר הגיטרה', `
      <div class="panel-desc" style="margin-bottom:14px">
        סמן שלוש נקודות על התמונה. הפרספקטיבה בצילום דוחסת את הצוואר, ולכן
        <b>פרט 12 הוא ההכרחי</b> — בלעדיו הסימונים יסטו יותר ויותר ככל שעולים בצוואר.
      </div>
      <div id="neck-step" class="hand-readout" style="margin-bottom:12px"></div>
      <div id="neck-canvas-wrap" style="position:relative;max-width:100%;margin-bottom:14px;
           border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#000">
        <img id="neck-img" src="${src}" alt="" style="width:100%;display:block">
        <canvas id="neck-cv" style="position:absolute;inset:0;width:100%;height:100%;cursor:crosshair"></canvas>
      </div>
      <div id="neck-tune" style="display:none">
        <div class="field"><label>רוחב הצוואר ליד ה-nut <span id="neck-wn"></span></label>
          <input id="neck-wnut" type="range" min="4" max="40" step="1"></div>
        <div class="field"><label>רוחב הצוואר בפרט 12 <span id="neck-w12"></span></label>
          <input id="neck-w12r" type="range" min="4" max="60" step="1"></div>
        <div class="field"><label>איפה היד הימנית פורטת <span id="neck-st"></span></label>
          <input id="neck-strum" type="range" min="55" max="120" step="1">
          <div class="hint">הזז עד שהמפרט הצהוב יושב איפה שהיד הימנית באמת פורטת בתמונה —
            מעל חור התהודה בגיטרה אקוסטית, ליד הגשר בחשמלית.</div></div>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px;margin-bottom:10px">
          <input id="neck-flip" type="checkbox"> החלף צד מיתרים (מי הנמוך בצד השני)</label>
        <div class="field"><label>אקורד לבדיקה</label>
          <select id="neck-test">${MM.CHORD_NAMES.map(n => `<option>${n}</option>`).join('')}</select></div>
        <div class="hint">הסולם הלבן צריך לשבת על הפרטים האמיתיים בתמונה, והקו הבהיר על פרט 12.
          לחיצה נוספת על התמונה מזיזה את הנקודה הקרובה ביותר, אז אפשר לתקן בלי להתחיל מחדש.
          <br><b>שים לב:</b> בגיטרה שנוצרה ב-AI הפרטים לא תמיד מצוירים במרווחים פיזיקליים.
          במקרה כזה גרור את שלוש הנקודות עד שהסולם יושב על הפרטים שרואים בתמונה —
          זה מה שקובע, ולא המיקום האנטומי המדויק שלהן.</div>
      </div>`,
      `<button class="btn btn-primary" data-action="neck-save" id="neck-save" disabled>שמור כיול</button>
       <button class="btn" data-action="neck-restart">התחל מחדש</button>
       <button class="btn btn-ghost" data-action="neck-cancel">ביטול</button>`);

    const img = $('#neck-img'), cv = $('#neck-cv');
    const paint = () => {
      const r = img.getBoundingClientRect();
      if (!r.width) return;
      cv.width = r.width * devicePixelRatio;
      cv.height = r.height * devicePixelRatio;
      const ctx = cv.getContext('2d');
      /* Everything is drawn in CSS pixels rather than in 0..1: the picture is
         not square, so a circle drawn in fractions would come out an ellipse.
         The calibration is converted to pixels for the same reason. */
      ctx.setTransform(cv.width / r.width, 0, 0, cv.height / r.height, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);

      if (Neck.isCalibrated(neckDraft)) {
        const f = MM.guitarFingering(($('#neck-test') && $('#neck-test').value) || 'C');
        const cal = scaleCal(neckDraft, r.width, r.height);
        const S = Math.max(r.width, r.height);
        Neck.draw(ctx, cal, f, { scale: S, ladder: true });
        // Parked mid-sweep, so the slider has something to aim with.
        Neck.drawStrum(ctx, cal, f, { scale: S, playing: false });
      }

      // the marks themselves, on top, so they can always be seen and moved
      NECK_STEPS.forEach((st, i) => {
        const q = neckDraft[st.key];
        if (!q) return;
        ctx.save();
        ctx.fillStyle = i === 1 ? '#ffd166' : '#00e5d0';
        ctx.strokeStyle = 'rgba(0,0,0,.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(q.x * r.width, q.y * r.height, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
      const done = neckStep >= NECK_STEPS.length;
      $('#neck-save').disabled = !Neck.isCalibrated(neckDraft);
      $('#neck-tune').style.display = done ? '' : 'none';
      $('#neck-step').innerHTML = done
        ? 'שלוש הנקודות סומנו. כוונן את רוחב הצוואר עד שהסולם יושב על הפרטים בתמונה.'
        : `<b>${neckStep + 1}/3 — לחץ על ${NECK_STEPS[neckStep].label}</b><br>${NECK_STEPS[neckStep].hint}`;
    };
    neckPaint = paint;

    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const q = { x: +((e.clientX - r.left) / r.width).toFixed(5), y: +((e.clientY - r.top) / r.height).toFixed(5) };
      if (neckStep < NECK_STEPS.length) {
        neckDraft[NECK_STEPS[neckStep].key] = q;
        neckStep++;
      } else {
        // Past the guided pass, a click re-marks whichever point is nearest,
        // so one misplaced mark does not mean starting over.
        let best = null, bd = 1e9;
        for (const st of NECK_STEPS) {
          const p2 = neckDraft[st.key];
          if (!p2) continue;
          const d = Math.hypot(p2.x - q.x, p2.y - q.y);
          if (d < bd) { bd = d; best = st.key; }
        }
        if (best) neckDraft[best] = q;
      }
      paint();
    });

    const wn = $('#neck-wnut'), w12 = $('#neck-w12r'), flip = $('#neck-flip'),
          st = $('#neck-strum');
    wn.value = Math.round(neckDraft.wNut * 1000);
    w12.value = Math.round(neckDraft.w12 * 1000);
    st.value = Math.round(neckDraft.strum * 100);
    flip.checked = !!neckDraft.flip;
    const syncTune = () => {
      neckDraft.wNut = +wn.value / 1000;
      neckDraft.w12 = +w12.value / 1000;
      neckDraft.strum = +st.value / 100;
      neckDraft.flip = flip.checked;
      $('#neck-wn').textContent = wn.value;
      $('#neck-w12').textContent = w12.value;
      $('#neck-st').textContent = st.value + '%';
      paint();
    };
    [wn, w12, st, flip].forEach(el => el.addEventListener('input', syncTune));
    $('#neck-test').addEventListener('change', paint);
    syncTune();
    if (img.complete) paint(); else img.onload = paint;
    window.addEventListener('resize', paint);
  }
  let neckPaint = null;

  /**
   * The calibration is stored as fractions of the image; a canvas drawn in
   * pixels needs them in pixels, and the two axes scale differently.
   */
  function scaleCal(cal, w, h) {
    const m = q => ({ x: q.x * w, y: q.y * h });
    const px = Math.max(w, h);
    return {
      nut: m(cal.nut), bridge: m(cal.bridge), twelfth: m(cal.twelfth),
      wNut: cal.wNut * px, w12: cal.w12 * px, flip: cal.flip,
      strum: cal.strum          // a fraction along the neck, so it does not scale
    };
  }

  /**
   * Cuts the backdrop away from a generated frame.
   *
   * Swapping whole photographs changes the background with every chord, which
   * reads as a slideshow rather than a performance. With the backdrop removed
   * the stage keeps one scene and only the player changes, which is what makes
   * the sequence look continuous.
   *
   * The method is a flood fill inward from the edges, keeping pixels within a
   * tolerance of the border colour. That is exact for the flat studio backdrops
   * these prompts produce and unreliable for busy scenes — so it is offered as
   * a step the user applies and can see, never something done silently on
   * import. Edges get a soft alpha ramp so the cut-out does not look stamped.
   */
  function cutOutBackground(dataURL, tolerance, cb) {
    const img = new Image();
    img.onload = () => {
      const w = img.width, h = img.height;
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, w, h), d = id.data;

      // Reference colour: the average of the four corners, which on a flat
      // backdrop agree and on a busy one disagree enough to fail visibly.
      const corner = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
      const cs = [corner(0, 0), corner(w - 1, 0), corner(0, h - 1), corner(w - 1, h - 1)];
      const ref = [0, 1, 2].map(c => cs.reduce((s, k) => s + k[c], 0) / 4);

      const tol2 = tolerance * tolerance;
      const near = i => {
        const dr = d[i] - ref[0], dg = d[i + 1] - ref[1], db = d[i + 2] - ref[2];
        return dr * dr + dg * dg + db * db <= tol2;
      };

      // Flood fill from every border pixel; interior background enclosed by the
      // subject is deliberately kept, so gaps under an arm stay opaque.
      const seen = new Uint8Array(w * h);
      const stack = [];
      for (let x = 0; x < w; x++) { stack.push(x, 0, x, h - 1); }
      for (let y = 0; y < h; y++) { stack.push(0, y, w - 1, y); }
      while (stack.length) {
        const y = stack.pop(), x = stack.pop();
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const p = y * w + x;
        if (seen[p]) continue;
        const i = p * 4;
        if (!near(i)) continue;
        seen[p] = 1;
        d[i + 3] = 0;
        stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
      }

      // Soften the boundary: a pixel that survived but touches a removed one
      // gets partial alpha, which hides the hard staircase edge.
      const out = new Uint8ClampedArray(d);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const p = y * w + x;
          if (seen[p]) continue;
          let cut = 0;
          if (seen[p - 1]) cut++;
          if (seen[p + 1]) cut++;
          if (seen[p - w]) cut++;
          if (seen[p + w]) cut++;
          if (cut) out[p * 4 + 3] = Math.round(255 * (1 - cut / 5));
        }
      }
      ctx.putImageData(new ImageData(out, w, h), 0, 0);

      const removed = seen.reduce((s, v) => s + v, 0) / (w * h);
      cb(cv.toDataURL('image/png'), removed);
    };
    img.onerror = () => cb(null, 0);
    img.src = dataURL;
  }

  /** True when any pixel is not fully opaque — i.e. the image has a cut-out. */
  function hasAlpha(cv) {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    return false;
  }

  /** Downscale before storing: localStorage is ~5MB and a raw render blows it. */
  function loadPortrait(file, cb) {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 720;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        // JPEG has no alpha channel, so encoding a cut-out as JPEG silently
        // fills the transparency with black. Keep PNG when there is something
        // to preserve, and take the smaller JPEG when there is not.
        cb(hasAlpha(cv) ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.82));
      };
      // Report failure through the callback too. Signalling only via a toast
      // left bulk callers waiting on a count that could never complete.
      img.onerror = () => { toast('לא הצלחתי לקרוא את התמונה', true); cb(null); };
      img.src = r.result;
    };
    r.onerror = () => { toast('לא הצלחתי לקרוא את הקובץ', true); cb(null); };
    r.readAsDataURL(file);
  }

  function saveCharacter(id) {
    const data = {
      name: $('#c-name').value.trim() || 'דמות ללא שם',
      instrument: $('#c-inst').value,
      style: $('#c-style').value,
      age: $('#c-age').value.trim(),
      archetype: $('#c-archetype').value,
      features: $('#c-features').value.trim(),
      description: $('#c-desc').value.trim(),
      wardrobe: $('#c-wardrobe').value.trim(),
      wardrobeAlt: $('#c-wardrobe-alt').value.trim(),
      scene: $('#c-scene').value,
      instrumentTheme: $('#c-insttheme').value,
      instrumentDetail: $('#c-instdetail').value.trim(),
      camera: $('#c-camera').value,
      lighting: $('#c-lighting').value,
      backdrop: $('#c-backdrop').value,
      skin: $('#c-skin').value,
      palette: $('#c-palette').value,
      world: $('#c-world').value.trim(),
      portrait: pendingPortrait,
      // The calibration describes one particular photograph, so it travels
      // with it and is dropped the moment the photograph is replaced.
      neck: pendingPortrait ? (pendingNeck || null) : null
    };
    if (id) Store.updateCharacter(id, data); else Store.addCharacter(data);
    if (!Store.save()) return toast('אין מקום בדפדפן — הסר תמונה או מחק דמות', true);
    closeModal(); toast('הדמות נשמרה'); render();
  }

  function masterPromptModal(charId) {
    const c = Store.getCharacter(charId);
    if (!c) return;
    const tracks = Store.state.tracks.filter(t => t.analysis && t.analysis.bpm);
    const t = tracks.find(x => x.id === state.currentTrackId) || tracks[0] || null;
    const out = CH.masterPrompt(c, t);
    modal(`פרומפט-מאסטר — ${esc(c.name)}`, `
      <div class="field" style="margin-bottom:16px">
        <label>שיר (הפרומפט נבנה לפי הניתוח שלו)</label>
        <select id="mp-track">
          ${tracks.length ? tracks.map(x =>
            `<option value="${x.id}" ${t && x.id === t.id ? 'selected' : ''}>${esc(x.title)} — ${Math.round(x.analysis.bpm)} BPM</option>`).join('')
            : '<option value="">— אין שירים מנותחים —</option>'}
        </select>
      </div>
      <div class="field" style="margin-bottom:16px">
        <label>פרומפט לנעילת הדמות (צור קודם keyframe אחד)</label>
        <textarea readonly style="min-height:70px">${esc(CH.keyframePrompt(c))}</textarea>
      </div>
      <div class="field">
        <label>פרומפט-מאסטר לכל הקליפ${out.panels.length ? ` (${out.panels.length} פאנלים)` : ''}</label>
        <textarea id="mp-text" readonly style="min-height:330px">${esc(out.text)}</textarea>
        <div class="hint" id="mp-health"></div>
      </div>`,
      `<button class="btn btn-primary" data-action="copy-mp">העתק פרומפט</button>
       <button class="btn" data-action="download-mp" data-id="${charId}">הורד .md</button>
       <button class="btn btn-ghost" data-action="close-modal">סגור</button>`);

    /** Show what the prompt is missing before the user pastes it somewhere. */
    const showHealth = (o, forChar) => {
      const box = $('#mp-health');
      if (!box) return;
      const sample = o.panels.length ? CH.panelPrompt(forChar, o.panels[0]) : o.text;
      const h = CH.promptHealth(sample, forChar, o.panels[0] || null);
      box.innerHTML = h.warnings.length
        ? `⚠️ ${h.warnings.map(esc).join(' · ')}`
        : `✓ ${o.panels.length} פאנלים · פרומפט פאנל ${h.words} מילים · כולל אצבוע מדויק ו-negatives`;
      box.style.color = h.warnings.length ? 'var(--warn)' : 'var(--accent)';
    };
    showHealth(out, c);

    const sel = $('#mp-track');
    if (sel) sel.addEventListener('change', () => {
      const nt = Store.getTrack(sel.value);
      const o = CH.masterPrompt(c, nt);
      $('#mp-text').value = o.text;
      showHealth(o, c);
    });
  }

  /* ============================================================
     Events
     ============================================================ */
  /**
   * Opens and closes the phone drawer.
   *
   * On a phone the sidebar slides over the page, so it has to be dismissed
   * as well as opened — and picking a screen from it is a dismissal. Leaving
   * it up meant the screen you just chose was behind the menu that chose it.
   */
  function setNav(open) {
    state.navOpen = open;
    const bar = $('#sidebar');
    if (bar) bar.classList.toggle('open', open);
    let scrim = document.querySelector('.sidebar-scrim');
    if (open && !scrim) {
      scrim = document.createElement('div');
      scrim.className = 'sidebar-scrim';
      scrim.addEventListener('click', () => setNav(false));
      document.body.appendChild(scrim);
    } else if (!open && scrim) scrim.remove();
  }

  function onClick(e) {
    const routeEl = e.target.closest('[data-route]');
    if (routeEl) {
      // Leaving the stage releases the WebGL context rather than leaving it
      // to be reclaimed whenever the browser feels like it.
      if (routeEl.dataset.route !== 'stage') stopGl();
      state.route = routeEl.dataset.route;
      state.activeLesson = null;
      // Focus mode belongs to the stage; navigating away must not leave the
      // rest of the app with its chrome hidden.
      if (state.stageFocus && routeEl.dataset.route !== 'stage') setStageFocus(false);
      setNav(false);
      render();
      $('#main').scrollTop = 0;
      return;
    }
    const act = e.target.closest('[data-action]');
    const a = act && act.dataset.action;
    // Anything picked out of the drawer dismisses it, not just the routes:
    // "הוסף שיר" opens a dialog that would otherwise sit behind the menu.
    if (act && a !== 'nav-toggle' && act.closest('#sidebar')) setNav(false);

    if (a === 'close-modal') return closeModal();
    if (a === 'add-track') return addTrackModal();
    if (a === 'save-track') return saveTrack();
    if (a === 'analyze') { closeModal(); return analyzeModal(act.dataset.id); }
    if (a === 'save-analysis') return saveAnalysis(act.dataset.id);
    if (a === 'new-character') return characterModal(null);
    if (a === 'edit-char') return characterModal(act.dataset.id);
    if (a === 'save-char') return saveCharacter(act.dataset.id);
    if (a === 'load-practice') {
      const existing = new Set(Store.state.tracks.filter(t => t.practice).map(t => t.title));
      const add = MM.practiceTracks().filter(t => !existing.has(t.title));
      add.forEach(t => Store.addTrack(t));
      toast(add.length ? `${add.length} תרגילים נוספו לספרייה` : 'ספריית התרגול כבר טעונה');
      state.route = 'library';
      return render();
    }
    if (a === 'del-track') {
      const t = Store.getTrack(act.dataset.id);
      if (!t) return;
      if (!confirm(`להסיר את "${t.title}" מהספרייה? הניתוח שלו יימחק איתו.`)) return;
      Store.removeTrack(t.id);
      // If the stage was following it, hand over rather than leaving the
      // performer bound to a track that no longer exists.
      if (state.currentTrackId === t.id) {
        state.currentTrackId = null;
        state.loop = null;
        lastReadoutChord = null;
        if (P.playing) P.pause();
      }
      toast('השיר הוסר');
      return render();
    }
    if (a === 'del-char') {
      if (confirm('למחוק את הדמות?')) { Store.removeCharacter(act.dataset.id); closeModal(); render(); }
      return;
    }
    if (a === 'calibrate-neck') {
      charDraft = snapshotCharForm();
      return calibrateNeckModal();
    }
    if (a === 'neck-restart') {
      neckStep = 0;
      neckDraft = { wNut: neckDraft.wNut, w12: neckDraft.w12, flip: neckDraft.flip };
      if (neckPaint) neckPaint();
      return;
    }
    if (a === 'neck-save' || a === 'neck-cancel') {
      const keep = a === 'neck-save';
      if (keep && !Neck.isCalibrated(neckDraft)) return toast('סמן קודם את שלוש הנקודות', true);
      const photo = pendingPortrait, cal = keep ? neckDraft : pendingNeck;
      characterModal(charModalId);      // rebuilds the form from the stored record
      restoreCharForm(charDraft);       // ...then puts back what was typed
      pendingPortrait = photo;
      pendingNeck = cal;
      const lbl = $('#c-neck-label');
      if (lbl) lbl.textContent = cal ? '✓ הצוואר מכויל — כייל מחדש' : 'כייל את הצוואר';
      if (keep) toast('הכיול נשמר — לחץ "שמור דמות" כדי לשמור אותו לצמיתות');
      return;
    }
    if (a === 'pick-portrait') {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        loadPortrait(f, dataUrl => {
          if (!dataUrl) return;
          pendingPortrait = dataUrl;
          // The old calibration described the old photograph, so it is gone.
          pendingNeck = null;
          const nl = $('#c-neck-label');
          if (nl) nl.textContent = 'כייל את הצוואר';
          const prev = $('#c-portrait-prev');
          if (prev) { prev.src = dataUrl; prev.style.display = ''; }
          toast('התמונה צורפה');
        });
      };
      inp.click(); return;
    }
    if (a === 'clear-portrait') {
      pendingPortrait = null;
      const prev = $('#c-portrait-prev');
      if (prev) { prev.src = ''; prev.style.display = 'none'; }
      act.remove(); return;
    }
    if (a === 'char-brief') {
      const c = Store.getCharacter(act.dataset.id);
      if (!c) return;
      const text = CH.characterBrief(c);
      modal(`תדריך דמות — ${esc(c.name)}`, `
        <div class="field"><label>העתק לכלי היצירה (GPT / Gemini / Midjourney)</label>
          <textarea id="brief-text" readonly style="min-height:420px">${esc(text)}</textarea></div>`,
        `<button class="btn btn-primary" data-action="copy-brief">העתק</button>
         <button class="btn btn-ghost" data-action="close-modal">סגור</button>`);
      return;
    }
    if (a === 'copy-brief') {
      const ta = $('#brief-text');
      navigator.clipboard.writeText(ta.value).then(() => toast('התדריך הועתק'),
        () => { ta.removeAttribute('readonly'); ta.select(); document.execCommand('copy'); toast('הועתק'); });
      return;
    }
    if (a === 'nav-toggle') { setNav(!state.navOpen); return; }
    if (a === 'clear-loop') { state.loop = null; return render(); }
    if (a === 'poster-export') return exportPoster();
    if (a === 'poster-cutout') {
      const chords = Object.keys(posterImages);
      if (!chords.length) return;
      // Keep the originals so a bad cut can be undone rather than redone.
      posterBackup = Object.assign({}, posterImages);
      let done = 0, weak = 0;
      toast('מסיר רקע…');
      chords.forEach(ch => {
        cutOutBackground(posterImages[ch], 62, (url, removed) => {
          if (url && removed > 0.06) { posterImages[ch] = url; persistPoster(ch, url); }
          else weak++;                       // nothing meaningful came off
          if (++done === chords.length) {
            toast(weak
              ? `הרקע הוסר מ-${chords.length - weak}; ב-${weak} הרקע לא אחיד מספיק`
              : `הרקע הוסר מ-${chords.length} תמונות`);
            render();
          }
        });
      });
      return;
    }
    if (a === 'poster-undo-cutout') {
      if (!posterBackup) return;
      Object.keys(posterBackup).forEach(ch => {
        posterImages[ch] = posterBackup[ch];
        persistPoster(ch, posterBackup[ch]);
      });
      posterBackup = null;
      toast('הרקע הוחזר');
      return render();
    }
    if (a === 'poster-prompts') {
      const sel = $('#poster-owner');
      if (sel) state.posterChar = sel.value;
      // Hand the generator the groups this poster is actually built from.
      return chordPosterModal(state.posterChar, state.posterGroups);
    }
    if (a === 'poster-clear') {
      Object.keys(posterImages).forEach(k => delete posterImages[k]);
      if (postersPersist) MM.Posters.clear().catch(() => {});
      return render();
    }
    if (a === 'poster-bulk') {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
      inp.onchange = () => {
        const files = [...inp.files].sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
        const slots = MM.CHORD_GROUPS.filter(g => state.posterGroups.includes(g.id)).flatMap(g => g.chords);
        let done = 0;
        const total = Math.min(files.length, slots.length);
        let ok = 0;
        files.slice(0, total).forEach((f, i) => {
          loadPortrait(f, url => {
            if (url) { posterImages[slots[i]] = url; persistPoster(slots[i], url); ok++; }
            // count every outcome, so one bad file cannot strand the batch
            if (++done === total) { toast(ok + ' תמונות שובצו'); render(); }
          });
        });
      };
      inp.click(); return;
    }
    const pg = e.target.closest('[data-pgroup]');
    if (pg) {
      const id = pg.dataset.pgroup;
      state.posterGroups = state.posterGroups.includes(id)
        ? state.posterGroups.filter(x => x !== id)
        : state.posterGroups.concat(id);
      return render();
    }
    const cell = e.target.closest('[data-cell]');
    if (cell) {
      const ch = cell.dataset.cell;
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => {
        const f = inp.files[0];
        if (f) loadPortrait(f, url => {
          if (url) { posterImages[ch] = url; persistPoster(ch, url); render(); }
        });
      };
      inp.click(); return;
    }
    if (a === 'export-diagram') return exportChordDiagram(act.dataset.chord);
    if (a === 'chord-poster') return chordPosterModal();
    if (a === 'copy-poster' || a === 'download-poster') {
      const ta = $('#poster-text');
      if (a === 'copy-poster') {
        navigator.clipboard.writeText(ta.value).then(() => toast('הועתק'),
          () => { ta.removeAttribute('readonly'); ta.select(); document.execCommand('copy'); toast('הועתק'); });
      } else {
        const blob = new Blob([ta.value], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = 'chord-poster.md'; link.click();
        URL.revokeObjectURL(url);
      }
      return;
    }
    if (a === 'master-prompt') return masterPromptModal(act.dataset.id);
    if (a === 'copy-mp') {
      const ta = $('#mp-text');
      navigator.clipboard.writeText(ta.value).then(() => toast('הפרומפט הועתק'),
        () => { ta.removeAttribute('readonly'); ta.select(); document.execCommand('copy'); toast('הועתק'); });
      return;
    }
    if (a === 'download-mp') {
      const c = Store.getCharacter(act.dataset.id);
      const text = $('#mp-text').value;
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `master-prompt-${(c && c.name || 'character').replace(/\s+/g, '-')}.md`;
      link.click(); URL.revokeObjectURL(url);
      return;
    }
    if (a === 'play-track') { e.stopPropagation(); return playTrack(act.dataset.id); }
    if (a === 'toggle') {
      // The click is a separate sound source, so it has to follow the transport.
      const cur = state.currentTrackId ? Store.getTrack(state.currentTrackId) : null;
      if (cur && !cur.videoId) { if (P.playing) stopClick(); else startClick(cur); }
      return P.toggle();
    }
    if (a === 'next') return neighbourTrack(1);
    if (a === 'prev') return neighbourTrack(-1);
    if (a === 'back10') return P.nudge(-10);
    if (a === 'fwd10') return P.nudge(10);
    if (a === 'export') {
      // Reading the poster out of IndexedDB is asynchronous, so the file is
      // only built once it is actually in hand.
      toast('מכין גיבוי…');
      Store.exportAll().then(json => {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = 'maestro-backup.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        const mb = (blob.size / 1048576).toFixed(1);
        toast(`הגיבוי ירד · ${mb}MB`);
      }).catch(() => toast('הכנת הגיבוי נכשלה', true));
      return;
    }
    if (a === 'import') {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          Store.importAll(r.result).then(res => {
            // Reload the mirror so the restored poster shows without a refresh.
            postersLoaded = false;
            Object.keys(posterImages).forEach(k => delete posterImages[k]);
            return loadPosters().then(() => {
              toast(res.posters
                ? `הגיבוי יובא · ${res.posters} תמונות פוסטר`
                : 'הגיבוי יובא');
              render();
            });
          }).catch(() => toast('קובץ לא תקין', true));
        };
        r.readAsText(f);
      };
      inp.click(); return;
    }
    if (a === 'wipe') {
      if (confirm('למחוק את כל השירים, הדמויות ותמונות הפוסטר? אי אפשר לבטל.')) {
        localStorage.removeItem('maestro.studio.v1');
        // The poster lives in a separate store, so wiping has to reach it too.
        MM.Posters.clear().catch(() => {}).then(() => location.reload());
      }
      return;
    }
    // lessons
    if (a === 'back-lessons') { state.activeLesson = null; return render(); }
    if (a === 'test-speech') {
      LS.Speech.speak('שלום, אני המורה שלך. נתחיל ללמוד אקורדים.');
      return;
    }
    if (a === 'speak-lesson') {
      const l = LS.all().find(x => x.id === act.dataset.id);
      if (l) LS.Speech.speak(LS.lessonScript(l));
      return;
    }
    if (a === 'speak-tips') {
      const l = LS.all().find(x => x.id === act.dataset.id);
      if (l) LS.Speech.speak(l.tips.join('. '));
      return;
    }
    if (a === 'speak-chord') {
      LS.Speech.speak(LS.speakChordScript(act.dataset.chord, act.dataset.inst));
      return;
    }
    if (a === 'hear-chord') {
      LS.Audio.playChord(act.dataset.chord, act.dataset.inst === 'piano' ? 'block' : 'strum');
      return;
    }
    if (a === 'toggle-metro') {
      if (LS.Audio.running) { LS.Audio.stopMetronome(); act.textContent = '▶ הפעל'; }
      else { LS.Audio.startMetronome(+$('#metro-bpm').value, 4); act.textContent = '■ עצור'; }
      return;
    }

    const tr = e.target.closest('[data-transpose]');
    if (tr) {
      const v = +tr.dataset.transpose;
      state.transpose = v === 0 ? 0 : Math.max(-11, Math.min(11, state.transpose + v));
      return render();
    }
    const cp = e.target.closest('[data-capo]');
    if (cp) {
      state.capo = Math.max(0, Math.min(9, state.capo + (+cp.dataset.capo)));
      return render();
    }
    const ls = e.target.closest('[data-loop-section]');
    if (ls) {
      const t = Store.getTrack(state.currentTrackId);
      const sec = t && t.analysis && t.analysis.sections[+ls.dataset.loopSection];
      if (sec) { state.loop = { start: sec.start, end: sec.end }; P.seek(sec.start); render(); }
      return;
    }
    const bar = e.target.closest('[data-bar]');
    if (bar) { P.seek(+bar.dataset.t); if (!P.playing) P.play(); return; }

    const cinst = e.target.closest('[data-cinst]');
    if (cinst) { state.chordInst = cinst.dataset.cinst; return render(); }

    // stage display mode
    const mode = e.target.closest('[data-mode]');
    if (mode && !mode.disabled) {
      if (mode.dataset.mode !== 'gl') stopGl();
      state.stageMode = mode.dataset.mode;
      lastReadoutChord = null;
      return render();
    }

    if (a === 'stage-settings') {
      state.stageSettings = !state.stageSettings;
      return render();
    }
    if (a === 'stage-focus') { return setStageFocus(true); }
    if (a === 'stage-unfocus') { return setStageFocus(false); }

    // stage backdrop and blend
    const bd = e.target.closest('[data-bd]');
    if (bd && bd.classList.contains('chip')) {
      state.stageBackdrop = bd.dataset.bd;
      return render();
    }
    const bl = e.target.closest('[data-blend]');
    if (bl && bl.classList.contains('chip')) {
      state.stageBlend = bl.dataset.blend;
      return render();
    }

    // instrument switch on stage
    const inst = e.target.closest('[data-inst]');
    if (inst && state.route === 'stage') {
      if (state.performer) state.performer.setInstrument(inst.dataset.inst);
      state.stageInst = inst.dataset.inst;
      lastReadoutChord = null;
      document.querySelectorAll('[data-inst]').forEach(b =>
        b.classList.toggle('active', b === inst));
      return;
    }

    // filters
    const g = e.target.closest('[data-genre]');
    if (g) {
      state.filter.genre = g.dataset.genre || null;
      if (state.route !== 'library') state.route = 'library';
      return render();
    }
    const ar = e.target.closest('[data-artist]');
    if (ar) { state.filter.artist = ar.dataset.artist || null; return render(); }

    const lesson = e.target.closest('[data-lesson]');
    if (lesson) { state.activeLesson = lesson.dataset.lesson; return render(); }

    const charCard = e.target.closest('[data-char]');
    if (charCard && !act) return characterModal(charCard.dataset.char);

    const card = e.target.closest('[data-track]');
    if (card && !act) return playTrack(card.dataset.track);
  }

  function bindScrub() {
    document.addEventListener('pointerdown', e => {
      const bar = e.target.closest('#scrub');
      if (!bar) return;
      const seek = ev => {
        const r = bar.getBoundingClientRect();
        // RTL-safe: measure from the visual left edge regardless of direction
        let ratio = (ev.clientX - r.left) / r.width;
        ratio = Math.max(0, Math.min(1, ratio));
        const d = P.duration;
        if (d) P.seek(ratio * d);
      };
      seek(e);
      const move = ev => seek(ev);
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }

  /* ---------------- boot ---------------- */
  function init() {
    render();
    bindScrub();
    document.addEventListener('click', onClick);

    $('#search').addEventListener('input', e => {
      state.filter.q = e.target.value;
      if (state.route !== 'library') state.route = 'library';
      render();
    });
    $('#main').addEventListener('scroll', e => {
      $('#topbar').classList.toggle('scrolled', e.target.scrollTop > 8);
    });

    document.addEventListener('keydown', e => {
      if (/input|textarea|select/i.test(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); P.toggle(); }
      if (e.code === 'ArrowLeft') P.nudge(-5);
      if (e.code === 'ArrowRight') P.nudge(5);
      // Escape backs out one level at a time: a modal first, then focus mode.
      if (e.code === 'Escape') {
        if ($('.modal-back')) closeModal();
        else if (state.stageFocus) setStageFocus(false);
      }
    });
    // Leaving fullscreen by any other route — Esc handled by the browser, the
    // system gesture, a swipe — must not leave the layout stuck in focus mode.
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && state.stageFocus) setStageFocus(false);
    });

    // The overlay is drawn in pixels over a picture whose size follows the
    // window, so it has to be repainted when that changes. Harmless when the
    // stage is not showing it.
    window.addEventListener('resize', () => drawNeckOverlay(liveChord()));

    P.init('yt-mount');
    P.on('state', () => { updatePlayerBar(); });
    /* An ad freezes the song clock, so the performer holds its last chord
       instead of playing to the ad. Without a word on screen that looks like
       the app has hung, so say what is happening. */
    P.on('ad', (on) => {
      document.body.classList.toggle('is-ad', on);
      const pill = $('#hud-ad');
      if (pill) pill.style.display = on ? '' : 'none';
      if (on) toast('פרסומת מתנגנת — הנגינה תמשיך מעצמה כשהשיר יחזור');
    });
    P.on('time', (t, dur) => {
      const cur = $('#t-cur'), du = $('#t-dur'), fill = $('#scrub-fill');
      if (cur) cur.textContent = fmt(t);
      if (du) du.textContent = fmt(dur);
      if (fill && dur) fill.style.width = Math.min(100, (t / dur) * 100) + '%';
      syncFrame(t);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
  global.App = { state, render, toast };
})(window);
