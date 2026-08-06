/* ============================================================
   characters.js — character creator + master-prompt generator
   A character is locked once and reused for every song. The master
   prompt is a JS port of the skill's build_master_prompt.py: one
   self-contained prompt covering the whole clip, where each panel
   carries its ruling chord, the exact hand placement, and a
   beat-locked movement cue. Panels never span a chord change,
   because one hand can only hold one shape.
   ============================================================ */
(function (global) {
  'use strict';
  const MM = global.MM, A = global.Analysis;

  const STYLES = [
    { id: 'photoreal-3d', he: 'תלת-מימד ריאליסטי',
      anchor: 'photorealistic 3D render, physically based materials, cinematic lighting, subsurface skin detail, 50mm lens' },
    { id: 'animated-3d', he: 'תלת-מימד מונפש (Pixar-adjacent)',
      anchor: 'stylized 3D character, soft global illumination, appealing proportions, subsurface skin, expressive rig' },
    { id: 'cel-2d', he: '2D סל / אנימה',
      anchor: 'clean 2D cel animation, bold line art, flat shading with soft gradients' },
    { id: 'painterly', he: 'ציורי / אקוורל',
      anchor: 'painterly illustration, visible brushwork, watercolor washes, warm paper texture' },
    { id: 'claymation', he: 'פלסטלינה / סטופ-מושן',
      anchor: 'claymation stop-motion look, fingerprinted clay surfaces, shallow macro depth of field' },
    { id: 'motion-graphics', he: 'מוטיון גרפיקס',
      anchor: 'flat vector motion graphics, bold geometric shapes, crisp edges, limited palette' },
    { id: 'neon-noir', he: 'ניאון נואר',
      anchor: 'neon-noir cinematic render, rain-slick reflections, volumetric haze, hard rim light' }
  ];

  const PALETTES = [
    { he: 'ציאן ומג\'נטה', v: 'deep teal, magenta, near-black' },
    { he: 'שעת זהב', v: 'amber gold, warm cream, dusty brown' },
    { he: 'כחול לילה', v: 'midnight blue, ice white, soft cyan' },
    { he: 'אדום דרמטי', v: 'crimson red, charcoal, bone white' },
    { he: 'פסטל רך', v: 'blush pink, mint, pale sand' },
    { he: 'מונוכרום', v: 'black, white, single accent gray' }
  ];

  const TOOLS = {
    still: [
      { id: 'gpt', he: 'GPT-4o / DALL·E (ChatGPT)',
        note: 'משפטים תיאוריים ורציפים; מצוין בציות להוראות מפורשות כמו מיקום אצבעות. אפשר לבקש פאנל ספציפי ולשפר בהתייחסות לתמונה הקודמת.' },
      { id: 'gemini', he: 'Google Gemini (Imagen)',
        note: 'תיאורים תמציתיים ומובנים; חזק בפוטוריאליזם. עובד טוב עם נושא ברור + הוראת ידיים מפורשת + סגנון + מצלמה.' },
      { id: 'midjourney', he: 'Midjourney',
        note: 'תיאורים מופרדים בפסיקים + פרמטרים (--ar 16:9). השתמש ב---cref לשמירת עקביות הדמות בין פאנלים.' }
    ],
    video: [
      { id: 'sora', he: 'Sora', note: 'פסקה עשירה אחת, קוהרנטיות פיזיקלית מצוינת.' },
      { id: 'veo', he: 'Veo', note: 'ציות גבוה לפרומפט, מונחי מצלמה מפורשים.' },
      { id: 'kling', he: 'Kling', note: 'עקביות דמות מצוינת ב-image-to-video.' },
      { id: 'runway', he: 'Runway', note: 'שליטת מצלמה מדויקת דרך ה-UI.' }
    ]
  };

  const PANEL_TYPES = [
    { id: 'establishing', he: 'פתיחה (גוף מלא)', frame: 'wide establishing shot, full body with the instrument, three-quarter front angle' },
    { id: 'performance-medium', he: 'ביצוע (חצי גוף)', frame: 'medium shot, waist-up, both hands visible on the instrument' },
    { id: 'hands-close-up', he: 'תקריב ידיים', frame: 'extreme close-up on the playing hands, shallow depth of field' },
    { id: 'emotion', he: 'רגש (פנים)', frame: 'close-up on the face at a musical peak, eyes half-closed, expressive' }
  ];

  const barsPerShot = label => ({ high: 1, mid: 2, low: 4 }[label] || 2);
  const movementCue = label => ({
    high: 'big body lean and sway on the beat; strong strokes/attacks',
    mid: 'steady groove, head nod and weight shift on the beat',
    low: 'gentle, minimal sway; let gestures breathe across the phrase'
  }[label] || 'groove on the beat');
  const movementCueHe = label => ({
    high: 'נטייה ונדנוד גדולים על הביט; פריטות/נגיעות חזקות',
    mid: 'גרוב יציב, הנהון ראש והעברת משקל על הביט',
    low: 'נדנוד עדין ומינימלי; תנועה אחת נושמת לאורך הפראזה'
  }[label] || 'גרוב על הביט');

  const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  /**
   * Split the piece into panels. Cut candidates = the rhythmic grid PLUS every
   * chord change, so no panel ever spans two chords.
   */
  function buildPanels(analysis, instrument) {
    if (!analysis || !analysis.bpm) return [];
    const bpm = analysis.bpm;
    const sig = analysis.timeSignature || 4;
    const bar = (240 / bpm) * (sig / 4);
    const duration = analysis.duration || 0;
    const downbeats = (analysis.downbeats || []).slice().sort((a, b) => a - b);
    const drops = new Set((analysis.drops || []).map(x => +x.toFixed(2)));

    const snap = t => {
      if (!downbeats.length) return +t.toFixed(2);
      let best = downbeats[0];
      for (const d of downbeats) if (Math.abs(d - t) < Math.abs(best - t)) best = d;
      return +(Math.abs(best - t) <= bar * 0.6 ? best : t).toFixed(2);
    };

    let sections = (analysis.sections || []).slice();
    if (!sections.length) sections = [{ start: 0, end: duration, label: 'mid' }];
    const chordStarts = (analysis.chords || []).map(c => c.start);

    const panels = [];
    sections.forEach((sec, si) => {
      const step = barsPerShot(sec.label) * bar;
      const cuts = new Set([+sec.start.toFixed(2), +sec.end.toFixed(2)]);
      for (let g = sec.start + step; g < sec.end - 1e-3; g += step) cuts.add(snap(g));
      for (const cs of chordStarts) if (cs > sec.start + 1e-3 && cs < sec.end - 1e-3) cuts.add(+cs.toFixed(2));
      const ordered = [...cuts].filter(c => c >= sec.start - 1e-3 && c <= sec.end + 1e-3).sort((a, b) => a - b);

      let k = 0;
      for (let i = 0; i < ordered.length - 1; i++) {
        const start = ordered[i], end = ordered[i + 1];
        if (end - start < 0.01) continue;
        const mid = (start + end) / 2;
        const seg = A.chordAt(analysis, mid);
        const chord = seg ? seg.chord : null;
        const g = chord ? MM.guitarFingering(chord) : null;
        const p = chord ? MM.pianoVoicing(chord, 4) : null;
        const hand = instrument === 'piano'
          ? (p ? p.placement : null)
          : (g ? g.placement : null);
        const handHe = instrument === 'piano'
          ? (p ? p.placementHe : null)
          : (g ? g.placementHe : null);
        panels.push({
          index: panels.length + 1,
          section: si + 1,
          label: sec.label,
          start: +start.toFixed(2), end: +end.toFixed(2),
          type: PANEL_TYPES[k % PANEL_TYPES.length],
          chord, hand, handHe,
          movement: movementCue(sec.label),
          movementHe: movementCueHe(sec.label),
          isDrop: [...drops].some(d => Math.abs(d - start) < bar * 0.5)
        });
        k++;
      }
    });
    return panels;
  }

  /** The single master prompt covering the whole clip. */
  function masterPrompt(character, track) {
    const a = track && track.analysis;
    const inst = character.instrument || 'guitar';
    const style = STYLES.find(s => s.id === character.style) || STYLES[1];
    const instEn = inst === 'piano' ? 'piano' : 'acoustic guitar';
    const L = [];

    L.push(`# 🎬 MASTER PROMPT — Performer Storyboard: "${track ? track.title : '—'}"`);
    L.push('');
    if (a && a.bpm) {
      const bar = (240 / a.bpm) * ((a.timeSignature || 4) / 4);
      L.push(`> One prompt, whole clip. ${Math.round(a.bpm)} BPM · key ${a.key.tonic} ${a.key.mode} · ` +
        `${mmss(a.duration || 0)} · bar = ${bar.toFixed(2)}s · instrument: ${instEn}` +
        (a.mood ? ` · mood ${a.mood}` : ''));
    } else {
      L.push('> ⚠️ Track not analyzed yet — panels below are a template only.');
    }
    L.push('');
    L.push('## GLOBAL DIRECTIVE (read first)');
    L.push('Generate a complete, consistent storyboard for the ENTIRE clip as an ordered ' +
      'sequence of panels. The SAME character and style appear in every panel — only pose, ' +
      'framing, and hands change. Every hand position and body movement below is locked to ' +
      'the real music: the fretting/keying hand must match the named chord, and motion accents ' +
      'fall on the listed timestamps. Do not invent chords and do not let the character drift.');
    L.push('');
    L.push('## LOCKED CHARACTER + STYLE (repeat verbatim in every panel)');
    L.push(`- **Character:** ${character.description || '[describe age, build, hair, wardrobe, signature detail]'}`);
    L.push(`- **Instrument:** ${instEn}${character.instrumentDetail ? ' — ' + character.instrumentDetail : ''}`);
    L.push(`- **Style:** ${style.anchor}`);
    L.push(`- **Palette:** ${character.palette || PALETTES[0].v}`);
    if (character.world) L.push(`- **World / setting:** ${character.world}`);
    L.push(`- **Lighting:** ${character.lighting || 'soft key with a cold rim light, gentle volumetric haze'}`);
    L.push('');

    const panels = a ? buildPanels(a, inst) : [];

    if (a && a.bpm) {
      L.push('## MOVEMENT SPINE (locked to the beat)');
      const secStarts = (a.sections || []).map(s => mmss(s.start));
      L.push(`- **Section changes (change world / palette / energy):** ${secStarts.join(', ') || '—'}`);
      L.push(`- **Drops (hard cut / reveal):** ${(a.drops || []).map(mmss).join(', ') || '—'}`);
      L.push('- **On every beat:** micro-motion (head nod / sway / strum-attack or key-press); ' +
        'bigger lean on builds and drops.');
      const prog = A.progressionOf(a);
      if (prog.length) L.push(`- **Chord flow:** ${prog.join(' → ')}`);
      L.push('');
      L.push(`## PANEL SEQUENCE (${panels.length} panels, covering the whole piece)`);
      L.push('');
      L.push('| # | Time | Sec | Panel | Chord | Hand placement | Movement |');
      L.push('|---|------|-----|-------|-------|----------------|----------|');
      for (const p of panels) {
        L.push(`| ${p.index} | ${mmss(p.start)}–${mmss(p.end)} | ${p.section} | ` +
          `${p.type.id}${p.isDrop ? ' 💥DROP' : ''} | ${p.chord || '—'} | ${p.hand || '—'} | ${p.movement} |`);
      }
      L.push('');
    }

    L.push('## PER-PANEL PROMPT PATTERN');
    L.push('For each row, expand into a full prompt:');
    L.push('');
    L.push('`[LOCKED CHARACTER + STYLE verbatim] — [panel framing/camera] — playing the ' +
      `${instEn}, [HAND PLACEMENT from the row] forming the [CHORD] — [MOVEMENT cue] — ` +
      '[lighting] — [palette] — [mood].`');
    L.push('');
    L.push('Keep the character + style block identical every time; only framing, chord, hands ' +
      'and movement change. That repetition is what holds the character together across panels.');
    L.push('');
    L.push('## HAND ACCURACY (this is what sells it)');
    if (inst === 'piano') {
      L.push('- The right hand covers the actual triad keys of the named chord; the left hand ' +
        'holds the bass note two octaves below.');
      L.push('- Curved fingers, relaxed wrists, forearms parallel to the floor, upright back.');
      L.push('- The pedal foot moves on harmony changes.');
    } else {
      L.push('- The left hand sits at the fret named in the row — open chords near the nut ' +
        '(frets 0–3), barre chords with the index finger flat across all strings at that fret.');
      L.push('- The right hand strums down on strong beats, up on offbeats; softer fingerpicking ' +
        'in quiet sections.');
      L.push('- On a chord change the hand visibly slides/reshapes exactly on that beat.');
    }
    L.push('');
    L.push('## TOOLS');
    L.push('- **Stills (keyframes):** ' + TOOLS.still.map(t => t.he).join(' · '));
    L.push('- **Animate:** ' + TOOLS.video.map(t => t.he).join(' · ') +
      ' — feed each keyframe as image-to-video and describe the motion.');
    L.push('');
    L.push('_Generated by Maestro Studio — music-motion-maestro_');
    return { text: L.join('\n'), panels };
  }

  /** A compact, paste-ready prompt for a single panel. */
  function panelPrompt(character, panel, track) {
    const style = STYLES.find(s => s.id === character.style) || STYLES[1];
    const inst = character.instrument === 'piano' ? 'piano' : 'acoustic guitar';
    const bits = [
      character.description || '[character]',
      style.anchor,
      panel.type.frame,
      `playing the ${inst}${panel.chord ? `, ${panel.hand || ''} forming the ${panel.chord} chord` : ''}`,
      panel.movement,
      character.lighting || 'soft key with a cold rim light',
      character.palette || PALETTES[0].v,
      character.world || ''
    ].filter(Boolean);
    return bits.join(' — ') + '.';
  }

  /** Portrait seed prompt — used to lock the character's look once. */
  function keyframePrompt(character) {
    const style = STYLES.find(s => s.id === character.style) || STYLES[1];
    const inst = character.instrument === 'piano' ? 'piano' : 'acoustic guitar';
    return [
      character.description || '[character]',
      `holding / seated at the ${inst}${character.instrumentDetail ? ' (' + character.instrumentDetail + ')' : ''}`,
      style.anchor,
      'three-quarter front view, full body, neutral confident pose, hands clearly visible on the instrument',
      character.lighting || 'soft key with a cold rim light',
      character.palette || PALETTES[0].v,
      character.world || 'clean seamless studio backdrop',
      'character reference sheet quality, consistent identity'
    ].join(' — ') + '.';
  }

  global.Characters = {
    STYLES, PALETTES, TOOLS, PANEL_TYPES,
    buildPanels, masterPrompt, panelPrompt, keyframePrompt, mmss
  };
})(window);
