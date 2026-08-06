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
    lib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h4v16H4zM11 4h3v16h-3zM17.5 5l3 15"/></svg>',
    stage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="3"/><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/></svg>',
    chars: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20v-1.6A4.9 4.9 0 0 1 7.4 13.5h3.2a4.9 4.9 0 0 1 4.9 4.9V20"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6.1M18.5 13.9a4.9 4.9 0 0 1 3 4.5V20"/></svg>',
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
      ['library', 'הספרייה שלי', icons.lib],
      ['stage', 'במה חיה', icons.stage],
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
        : `<div class="empty"><p>אין תוצאות לסינון הזה.</p></div>`}
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
          <span class="pill on">${esc(a.key.tonic)}${a.key.mode === 'minor' ? 'm' : ''}</span>`
        : `<span class="pill">לא נותח</span>`}
      </div>
      <div class="row-tag">${esc(t.genre || '')}</div>
      <button class="btn btn-sm btn-ghost" data-action="analyze" data-id="${t.id}">
        ${a && a.bpm ? 'ערוך' : 'נתח'}</button>
    </div>`;
  }

  /* ---------------- stage ---------------- */
  /** Entering the stage with nothing selected is a dead end — pick the first
   *  analyzed track and cue it so there's always something to look at. */
  function ensureStageTrack() {
    if (state.currentTrackId && Store.getTrack(state.currentTrackId)) return;
    const first = Store.state.tracks.find(t => t.analysis && t.analysis.bpm) || Store.state.tracks[0];
    if (!first) return;
    state.currentTrackId = first.id;
    state.lastBeatIndex = -1;
    lastReadoutChord = null;
    P.load(first.videoId, false);   // cue, don't autoplay
  }

  function viewStage() {
    const t = state.currentTrackId ? Store.getTrack(state.currentTrackId) : null;
    const chars = Store.state.characters;
    const analyzed = t && t.analysis && t.analysis.bpm;
    return `<div class="page">
      ${pageHead('הבמה החיה', 'דמות שמנגנת את השיר — האקורדים, הידיים והתנועה נעולים למוזיקה')}
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
            ${analyzed ? `<div class="stage-hud">
              <span class="hud-pill">BPM <b id="hud-bpm">${Math.round(t.analysis.bpm)}</b></span>
              <span class="hud-pill">אקורד <b id="hud-chord">—</b></span>
              <span class="hud-pill">תיבה <b id="hud-bar">—</b></span>
              <span class="hud-pill" id="hud-section">—</span>
            </div>` : ''}
          </div>
        </div>
        <div>
          <div class="side-panel" style="margin-bottom:16px">
            <h3>תצוגה</h3>
            <div class="chips">
              <button class="chip ${state.stageMode !== 'hero' ? 'active' : ''}" data-mode="anim">🎬 אנימציה</button>
              <button class="chip ${state.stageMode === 'hero' ? 'active' : ''}" data-mode="hero"
                ${state.stageChar && state.stageChar.portrait ? '' : 'disabled title="צרף תמונה לדמות כדי להפעיל"'}>🖼️ דמות ריאליסטית</button>
            </div>
            <h3 style="margin-top:16px">כלי נגינה</h3>
            <div class="chips">
              <button class="chip ${(!state.stageChar || state.stageChar.instrument !== 'piano') ? 'active' : ''}" data-inst="guitar">🎸 גיטרה</button>
              <button class="chip ${state.stageChar && state.stageChar.instrument === 'piano' ? 'active' : ''}" data-inst="piano">🎹 פסנתר</button>
            </div>
            ${chars.length ? `<div style="margin-top:16px">
              <h3>דמות</h3>
              <select class="field" id="stage-char" style="width:100%;background:var(--bg-elev);border:1px solid var(--line);border-radius:8px;padding:9px">
                <option value="">— דמות ברירת מחדל —</option>
                ${chars.map(c => `<option value="${c.id}" ${state.stageChar && state.stageChar.id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
              </select></div>` : ''}
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
              </div>
            </div>`).join('')}
        </div>`).join('')}
    </div>`;
  }

  function chordPosterModal() {
    const chars = Store.state.characters;
    if (!chars.length) {
      return modal('פוסטר אקורדים', `<div class="empty">
        <div class="empty-icon">🎭</div><h3>צריך דמות קודם</h3>
        <p>הפוסטר מציג את אותה דמות מנגנת כל אקורד — צור דמות ונעל אותה.</p></div>`,
        `<button class="btn btn-primary" data-action="new-character">צור דמות</button>
         <button class="btn btn-ghost" data-action="close-modal">סגור</button>`);
    }
    const c = chars[0];
    modal('פוסטר אקורדים עם דמות', `
      <div class="field" style="margin-bottom:14px">
        <label>דמות</label>
        <select id="poster-char">${chars.map(x =>
          `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
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
            `<button class="chip ${i < 4 ? 'active' : ''}" data-group="${g.id}">${esc(g.he)}</button>`).join('')}
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
      const L = [CH.chordPosterPrompts(ch, groups), '', '---', '',
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

  /* ---------------- poster assembler ----------------
     The generated images arrive one per chord — no model holds 30 distinct
     correct hand shapes in a single frame. This lays them out into the sheet
     and burns in the chord name and diagram, which is where the accuracy
     actually lives. Images stay in memory only; 30 of them would blow the
     localStorage budget, and the export is the artifact worth keeping. */
  const posterImages = {};   // chord -> dataURL (session only)

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
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
          <button class="btn" data-action="poster-bulk">בחר תמונות בכמות</button>
          <button class="btn btn-primary" data-action="poster-export" ${filled ? '' : 'disabled'}>הורד פוסטר PNG</button>
          <button class="btn btn-ghost" data-action="poster-clear" ${filled ? '' : 'disabled'}>נקה</button>
        </div>
        <div class="hint" style="margin-top:8px">בבחירה בכמות: מיין את הקבצים לפי שם והם ישובצו לפי הסדר.</div>
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
          const dw = 104, dh = 104 * 1.3;
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
        <div class="panel-desc">${s.tracks.length} שירים · ${s.characters.length} דמויות שמורים בדפדפן הזה.</div>
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
    if (state.route === 'stage') ensureStageTrack();
    const views = {
      home: viewHome, library: viewLibrary, stage: viewStage,
      characters: viewCharacters, chords: viewChords, poster: viewPoster,
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
    const hud = host.querySelector('.stage-hud');
    host.innerHTML = '';

    const heroMode = state.stageMode === 'hero' && state.stageChar && state.stageChar.portrait;
    if (heroMode) {
      // The realistic render is the visual; the fingering stays exact in the
      // overlay, so you get the photoreal look without losing the accuracy.
      state.performer = null;
      const wrap = document.createElement('div');
      wrap.className = 'hero-stage';
      wrap.innerHTML =
        `<img id="hero-img" src="${state.stageChar.portrait}" alt="">
         <div class="hero-overlay">
           <div class="hero-chord" id="hero-chord">—</div>
           <div class="hero-hand" id="hero-hand"></div>
           <div id="hero-diagram"></div>
         </div>`;
      host.appendChild(wrap);
    } else {
      const holder = document.createElement('div');
      host.appendChild(holder);
      state.performer = PF.create(holder);
      state.performer.setInstrument(
        state.stageChar && state.stageChar.instrument === 'piano' ? 'piano' : 'guitar');
    }
    if (hud) host.appendChild(hud);

    const sel = $('#stage-char');
    if (sel) sel.addEventListener('change', () => {
      state.stageChar = sel.value ? Store.getCharacter(sel.value) : null;
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

    if (state.performer) {
      state.performer.update({ chord, beat, playing: P.playing, energy });
    } else if (state.stageMode === 'hero') {
      // A still render can't fret a chord, but it can breathe with the music:
      // a subtle push on each beat keeps the hero alive without faking playing.
      const img = $('#hero-img');
      if (img) {
        const pulse = P.playing ? Math.max(0, 1 - beat.phase * 3.2) * (beat.isDown ? 1 : .55) : 0;
        const sway = P.playing ? Math.sin((beat.index % 8 + beat.phase) / 8 * Math.PI * 2) : 0;
        img.style.transform =
          `scale(${(1.015 + pulse * 0.02 * energy).toFixed(4)}) translateX(${(sway * 6 * energy).toFixed(2)}px)`;
      }
      const hc = $('#hero-chord');
      if (hc && hc.textContent !== (chord || '—')) hc.textContent = chord || '—';
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

  let lastReadoutChord = null;
  function updateHandReadout(chord) {
    if (chord === lastReadoutChord) return;
    lastReadoutChord = chord;
    const box = $('#hand-readout'), dia = $('#chord-diagram');
    if (!box) return;
    if (!chord) { box.textContent = 'אין אקורד בנקודה הזו.'; if (dia) dia.innerHTML = ''; return; }
    const isPiano = state.performer
      ? state.performer.instrument === 'piano'
      : !!(state.stageChar && state.stageChar.instrument === 'piano');
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

  function playTrack(id) {
    const t = Store.getTrack(id);
    if (!t) return;
    state.currentTrackId = id;
    state.lastBeatIndex = -1;
    lastReadoutChord = null;
    if (state.stageChar && state.stageChar.instrument) {
      // keep instrument choice
    }
    P.load(t.videoId, true);
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
          <input id="f-url" placeholder="https://www.youtube.com/watch?v=..." autofocus>
          <div class="hint">הקישור נשמר קבוע במערכת ומשמש לניגון ולניתוח.</div>
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
        <span class="pill ${badge(conf.key)}">סולם ${esc(a.key.tonic)}${a.key.mode === 'minor' ? 'm' : ''} · ${esc(note(conf.key || 0))}</span>
        <span class="pill">${a.beatTimes.length} ביטים</span>
        <span class="pill">${a.sections.length} סקשנים</span>
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
        <button class="tab active" data-tab="auto">🎧 נתח קובץ אודיו</button>
        <button class="tab" data-tab="assist">ניתוח מונחה</button>
        <button class="tab" data-tab="json">ייבוא מהסקיל</button>
      </div>
      <div id="tab-auto">
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
    const tapper = A.TapTempo();
    const back = $('.modal-back');
    back.addEventListener('click', e => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        back.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === tab));
        for (const t of ['auto', 'assist', 'json'])
          $('#tab-' + t).style.display = tab.dataset.tab === t ? '' : 'none';
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
    const autoVisible = $('#tab-auto') && $('#tab-auto').style.display !== 'none';
    let analysis;
    try {
      if (autoVisible) {
        if (!autoAnalysis) return toast('נתח קודם קובץ אודיו, או עבור ללשונית אחרת', true);
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
    Store.updateTrack(id, { analysis });
    closeModal();
    toast('הניתוח נשמר · ' + A.summaryLine(analysis));
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
            ${c.portrait ? '<button class="btn btn-sm btn-ghost" data-action="clear-portrait" style="color:var(--bad)">הסר</button>' : ''}
          </div>
          <div class="hint">אחרי שיצרת את ה-hero בכלי חיצוני — צרף אותו כאן. הוא יופיע על הדמות ויוכל לעלות לבמה.</div></div>
      </div>`,
      `<button class="btn btn-primary" data-action="save-char" ${id ? `data-id="${id}"` : ''}>שמור דמות</button>
       ${id ? `<button class="btn" data-action="char-brief" data-id="${id}">תדריך דמות</button>` : ''}
       ${id ? `<button class="btn btn-ghost" data-action="del-char" data-id="${id}" style="color:var(--bad)">מחק</button>` : ''}
       <button class="btn btn-ghost" data-action="close-modal">ביטול</button>`);

    pendingPortrait = c.portrait || null;
    const styleSel = $('#c-style');
    const syncPhotoreal = () => {
      const on = CH.isPhotoreal({ style: styleSel.value });
      $('#photoreal-fields').style.display = on ? 'contents' : 'none';
    };
    styleSel.addEventListener('change', syncPhotoreal);
    syncPhotoreal();
  }

  let pendingPortrait = null;

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
        cb(cv.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => toast('לא הצלחתי לקרוא את התמונה', true);
      img.src = r.result;
    };
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
      portrait: pendingPortrait
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
  function onClick(e) {
    const routeEl = e.target.closest('[data-route]');
    if (routeEl) {
      state.route = routeEl.dataset.route;
      state.activeLesson = null;
      render();
      $('#main').scrollTop = 0;
      return;
    }
    const act = e.target.closest('[data-action]');
    const a = act && act.dataset.action;

    if (a === 'close-modal') return closeModal();
    if (a === 'add-track') return addTrackModal();
    if (a === 'save-track') return saveTrack();
    if (a === 'analyze') { closeModal(); return analyzeModal(act.dataset.id); }
    if (a === 'save-analysis') return saveAnalysis(act.dataset.id);
    if (a === 'new-character') return characterModal(null);
    if (a === 'edit-char') return characterModal(act.dataset.id);
    if (a === 'save-char') return saveCharacter(act.dataset.id);
    if (a === 'del-char') {
      if (confirm('למחוק את הדמות?')) { Store.removeCharacter(act.dataset.id); closeModal(); render(); }
      return;
    }
    if (a === 'pick-portrait') {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        loadPortrait(f, dataUrl => {
          pendingPortrait = dataUrl;
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
    if (a === 'poster-export') return exportPoster();
    if (a === 'poster-clear') {
      Object.keys(posterImages).forEach(k => delete posterImages[k]);
      return render();
    }
    if (a === 'poster-bulk') {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
      inp.onchange = () => {
        const files = [...inp.files].sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
        const slots = MM.CHORD_GROUPS.filter(g => state.posterGroups.includes(g.id)).flatMap(g => g.chords);
        let done = 0;
        files.slice(0, slots.length).forEach((f, i) => {
          loadPortrait(f, url => {
            posterImages[slots[i]] = url;
            if (++done === Math.min(files.length, slots.length)) { toast(done + ' תמונות שובצו'); render(); }
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
      inp.onchange = () => { const f = inp.files[0]; if (f) loadPortrait(f, url => { posterImages[ch] = url; render(); }); };
      inp.click(); return;
    }
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
    if (a === 'toggle') return P.toggle();
    if (a === 'next') return neighbourTrack(1);
    if (a === 'prev') return neighbourTrack(-1);
    if (a === 'back10') return P.nudge(-10);
    if (a === 'fwd10') return P.nudge(10);
    if (a === 'export') {
      const blob = new Blob([Store.exportAll()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'maestro-backup.json'; link.click();
      URL.revokeObjectURL(url); return;
    }
    if (a === 'import') {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          try { Store.importAll(r.result); toast('הגיבוי יובא'); render(); }
          catch (err) { toast('קובץ לא תקין', true); }
        };
        r.readAsText(f);
      };
      inp.click(); return;
    }
    if (a === 'wipe') {
      if (confirm('למחוק את כל השירים והדמויות? אי אפשר לבטל.')) {
        localStorage.removeItem('maestro.studio.v1'); location.reload();
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

    const cinst = e.target.closest('[data-cinst]');
    if (cinst) { state.chordInst = cinst.dataset.cinst; return render(); }

    // stage display mode
    const mode = e.target.closest('[data-mode]');
    if (mode && !mode.disabled) {
      state.stageMode = mode.dataset.mode;
      lastReadoutChord = null;
      return render();
    }

    // instrument switch on stage
    const inst = e.target.closest('[data-inst]');
    if (inst && state.route === 'stage') {
      if (state.performer) state.performer.setInstrument(inst.dataset.inst);
      if (!state.stageChar) state.stageChar = { instrument: inst.dataset.inst };
      else state.stageChar = Object.assign({}, state.stageChar, { instrument: inst.dataset.inst });
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
      if (e.code === 'Escape') closeModal();
    });

    P.init('yt-mount');
    P.on('state', () => { updatePlayerBar(); });
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
