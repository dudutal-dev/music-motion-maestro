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
    { id: 'photoreal-3d', he: 'תלת-מימד ריאליסטי (Hero)', photoreal: true,
      anchor: 'photorealistic 3D character render, hyper-detailed PBR materials, ray-traced global ' +
        'illumination, subsurface scattering skin with visible pores and fine peach fuzz, individually ' +
        'rendered hair strands, realistic fabric weave with micro-fiber detail, physically accurate ' +
        'specular highlights, shot on a full-frame sensor, indistinguishable from a studio photograph' },
    { id: 'photoreal-portrait', he: 'תלת-מימד ריאליסטי (פורטרט אולפן)', photoreal: true,
      anchor: 'photorealistic 3D portrait render, seamless studio backdrop, PBR skin shader with ' +
        'subsurface scattering, pore-level microdetail, catchlights in the eyes, soft falloff on the ' +
        'jawline, natural skin imperfections, editorial retouching level, tack-sharp focus on the eyes' },
    { id: 'photoreal-cinematic', he: 'תלת-מימד ריאליסטי (קולנועי)', photoreal: true,
      anchor: 'photorealistic cinematic 3D render, filmic color science, volumetric atmosphere, ' +
        'anamorphic lens character, subtle chromatic aberration and film grain, practical light sources ' +
        'in frame, PBR materials with measured roughness, ray-traced reflections and contact shadows' },
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

  /* ============================================================
     Photoreal system
     Photorealism is not one adjective — it's the stack: lens, light,
     backdrop, material detail, and (critically for a musician) a
     negative prompt that fights the one thing image models reliably
     botch: hands on an instrument.
     ============================================================ */
  const CAMERAS = [
    { id: 'portrait-85', he: '85mm פורטרט (חצי גוף)',
      v: 'shot on 85mm f/1.4, shallow depth of field, creamy background separation, compressed flattering perspective' },
    { id: 'natural-50', he: '50mm טבעי (חצי-גוף עד מלא)',
      v: 'shot on 50mm f/2, natural perspective with no distortion, subject fills the frame' },
    { id: 'full-35', he: '35mm גוף מלא / סביבתי',
      v: 'shot on 35mm f/2.8, full body in frame, environmental context, deep enough focus to hold the hands sharp' },
    { id: 'macro-hands', he: 'מאקרו על הידיים',
      v: 'macro shot on 100mm f/4 focused on the hands and the fretboard, extreme detail on the fingertips, ' +
        'shallow plane of focus falling off behind the strings' }
  ];

  const LIGHTING = [
    { id: 'studio-rim', he: 'סטודיו + rim light (כמו הייחוס)',
      v: 'studio lighting on a black seamless backdrop, large soft key from camera left, ' +
        'cold cyan rim light separating the shoulders and jaw from the background, controlled falloff, ' +
        'clean specular highlights on the instrument' },
    { id: 'rembrandt', he: 'רמברנדט דרמטי',
      v: 'Rembrandt lighting, single large soft source at 45 degrees, defined triangle of light on the ' +
        'shadow-side cheek, deep controlled shadows, rich contrast' },
    { id: 'high-key', he: 'היי-קי נקי',
      v: 'high-key lighting, broad even soft light, minimal shadows, bright airy feel, white surroundings' },
    { id: 'stage-practical', he: 'תאורת במה',
      v: 'concert stage lighting, hard backlight through haze, colored practicals, visible light shafts, ' +
        'hot rim on the hair and shoulders' },
    { id: 'neon-night', he: 'ניאון לילי',
      v: 'neon practicals in frame, magenta and cyan sources, wet reflective surfaces, volumetric haze, ' +
        'hard rim light, deep shadow blacks' },
    { id: 'golden-hour', he: 'שעת זהב',
      v: 'golden hour sunlight, warm low sun raking across the subject, long soft shadows, gentle lens flare' }
  ];

  const BACKDROPS = [
    { id: 'black-seamless', he: 'רקע שחור נקי (כמו הייחוס)',
      v: 'pure black seamless studio backdrop, subject fully separated from the background' },
    { id: 'grey-seamless', he: 'רקע אפור סטודיו', v: 'neutral grey seamless studio backdrop with a soft gradient' },
    { id: 'wood-studio', he: 'חדר הקלטות מעץ',
      v: 'warm wooden recording studio, acoustic panels and cables softly out of focus behind the subject' },
    { id: 'stage', he: 'במת הופעה', v: 'dark concert stage, out-of-focus crowd and lighting rig deep in the background' },
    { id: 'street-night', he: 'רחוב לילי', v: 'rain-slick city street at night, bokeh signage far behind the subject' },
    { id: 'loft', he: 'לופט עם חלון', v: 'sunlit loft with a large window, soft bounced daylight, minimal furniture' }
  ];

  const SKIN = [
    { id: 'neutral', he: 'עור טבעי', v: 'natural skin with realistic tone variation and subtle imperfections' },
    { id: 'freckled', he: 'נמשים', v: 'freckled skin across the nose and cheeks, warm undertone' },
    { id: 'weathered', he: 'מעט מבוגר / מחוספס', v: 'weathered skin with fine lines, lived-in texture, character in the face' },
    { id: 'youthful', he: 'צעיר וחלק', v: 'smooth youthful skin with a healthy sheen, minimal texture' }
  ];

  /* Archetypes cover the identity layer, including non-human characters —
     a photoreal render of an elf or a deity needs its features stated as
     deliberate design, or the model quietly makes them human. */
  /* `v` is a short noun phrase; `features` are defaults used ONLY when the user
     leaves the features field empty. Keeping them separate stops the prompt
     from saying "pointed ears" twice, which dilutes rather than reinforces. */
  const ARCHETYPES = [
    { id: 'none', he: '— ללא —', v: '', features: '' },
    { id: 'human', he: 'מוזיקאי אנושי', v: 'a contemporary human musician', features: '' },
    { id: 'elf', he: 'אלף / בן-לילית', v: 'an elven being',
      features: 'long tapered pointed ears, ethereal fine features, luminous pale eyes, flowing waist-length hair' },
    { id: 'deity', he: 'ישות מיתולוגית', v: 'a mythic deity-like figure',
      features: 'an otherworldly presence, subtle divine glow on the skin, regal bearing, ceremonial ornaments' },
    { id: 'cyber', he: 'סייברפאנק', v: 'a cyberpunk performer',
      features: 'subtle chrome implants at the temple and jaw, fiber-optic strands woven through the hair, faint under-skin circuitry light' },
    { id: 'celestial', he: 'שמימי / קוסמי', v: 'a celestial being',
      features: 'faintly star-flecked skin, iridescent sheen, hair that drifts as if underwater' },
    { id: 'vintage', he: 'רטרו שנות ה-70', v: 'a 1970s rock musician',
      features: 'period-accurate hair and styling, analogue film aesthetic' }
  ];

  /* An ornate instrument is half the composition in this kind of image, so it
     deserves the same treatment as the character: a named design language. */
  const INSTRUMENT_THEMES = [
    { id: 'none', he: '— ללא —', v: '' },
    { id: 'egyptian', he: 'מצרי עתיק',
      v: 'ancient-Egyptian revival design, carved hieroglyph panels, a Horus falcon head at the upper bout, ' +
        'stepped pyramid motif, lapis-blue and polished gold inlay, turquoise and carnelian gemstones, ' +
        'an ankh inlaid in the headstock, scarab fret markers' },
    { id: 'oceanic', he: 'ביולומינסנטי / ימי',
      v: 'deep-sea bioluminescent design, teal metallic body with glowing cyan filigree veins, ' +
        'abalone shell inlay, coral and jellyfish motifs, pearlescent lacquer' },
    { id: 'norse', he: 'נורדי / ויקינגי',
      v: 'Norse design, carved knotwork, runic inscriptions burned into the fretboard, ' +
        'blackened iron hardware, aged oak body, silver wolf-head detailing' },
    { id: 'deco', he: 'ארט דקו',
      v: 'Art Deco design, symmetrical stepped geometry, brushed brass and black lacquer, ' +
        'mother-of-pearl chevron inlays, fan motifs' },
    { id: 'biomech', he: 'ביומכני',
      v: 'biomechanical design, exposed sinew-like cabling, machined titanium ribs, ' +
        'organic curves fused with precision hardware' },
    { id: 'celestialInst', he: 'שמימי / אסטרונומי',
      v: 'celestial design, deep indigo body with a constellation map inlaid in silver, ' +
        'moon-phase fret markers, orrery-style hardware, faint starlight glow' },
    { id: 'vintageInst', he: 'וינטג׳ קלאסי',
      v: 'classic vintage build, sunburst nitrocellulose finish, aged nickel hardware, ' +
        'honest play wear and light checking in the lacquer' }
  ];

  /* Backdrops above are for the hero portrait — a clean, controlled shot whose
     job is to lock identity. Scenes are where the character actually performs,
     and they carry the things a stage really has: crowd, haze, beams, gear. */
  const SCENES = [
    { id: 'same', he: '— כמו הרקע של ה-hero —', v: '' },
    { id: 'arena', he: 'אולם הופעות גדול',
      v: 'on a packed arena stage, volumetric light beams cutting through atmospheric haze, ' +
        'a sea of out-of-focus faces and raised hands in the crowd, a drum kit and stacked ' +
        'amplifiers behind, warm bokeh from phone lights, spill light raking across the performer' },
    { id: 'club', he: 'מועדון קטן ומיוזע',
      v: 'on a small sweaty club stage, low ceiling, the crowd pressed close to the monitors, ' +
        'red and amber practicals, thick air, hard shadows' },
    { id: 'rehearsal', he: 'חדר חזרות',
      v: 'in a cluttered rehearsal room, amps and cable runs, daylight through a dusty window, ' +
        'unglamorous and intimate' },
    { id: 'studio-live', he: 'חדר הקלטות',
      v: 'in a live recording room, acoustic panels and a large-diaphragm microphone on a boom, ' +
        'warm practical lamps, headphones around the neck' },
    { id: 'rooftop', he: 'גג עירוני',
      v: 'on a city rooftop at blue hour, skyline bokeh behind, wind moving the hair and clothing' },
    { id: 'void', he: 'חלל שחור (רק הדמות)',
      v: 'in a pure black void, only the performer and the instrument lit, no environment' }
  ];

  /* Performance intensity is derived from the song's measured section energy —
     this is the app's whole premise applied to the character. A quiet intro and
     a peak chorus should not show the same body. */
  const INTENSITY = {
    low: 'composed and still, weight settled, shoulders relaxed, eyes half-closed or ' +
      'softly down on the fretboard, calm breathing, minimal movement',
    mid: 'engaged and grooving, head nodding on the beat, weight shifting between the feet, ' +
      'focused relaxed expression, hair just beginning to move',
    high: 'full performance intensity, sweat-damp hair falling across the forehead, ' +
      'forearm muscles engaged and tendons visible, clothing and hair caught mid-motion, ' +
      'head driven into the beat, eyes squeezed shut or locked down on the fretboard'
  };

  /* Hands are the failure mode. Naming it explicitly, every time, is the
     single highest-leverage line in a musician prompt. */
  const NEGATIVE_BASE = [
    'extra fingers', 'missing fingers', 'fused fingers', 'malformed hands',
    'six fingers', 'distorted anatomy', 'floating hands',
    'hand not touching the instrument', 'incorrect chord shape',
    'extra strings', 'warped instrument neck', 'melting geometry',
    'plastic skin', 'waxy skin', 'over-smoothed face', 'uncanny dead eyes',
    'blurry', 'low resolution', 'watermark', 'text', 'cartoon', 'illustration'
  ];

  const RENDER_TOKENS = 'ultra detailed, 8K, high dynamic range, physically accurate materials, ' +
    'no CGI tells, photographic realism';

  const pick = (arr, id, fallback) => arr.find(x => x.id === id) || (fallback === undefined ? arr[0] : fallback);
  const isPhotoreal = c => {
    const s = STYLES.find(x => x.id === (c && c.style));
    return !!(s && s.photoreal);
  };

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
    L.push(`- **Character:** ${identityBlock(character)}`);
    L.push(`- **Instrument:** ${instrumentBlock(character)}`);
    L.push(`- **Style:** ${style.anchor}`);
    L.push(`- **Palette:** ${character.palette || PALETTES[0].v}`);
    if (isPhotoreal(character)) {
      L.push(`- **Camera:** ${pick(CAMERAS, character.camera).v}`);
      L.push(`- **Lighting:** ${pick(LIGHTING, character.lighting).v}`);
      L.push(`- **Backdrop:** ${character.world || pick(BACKDROPS, character.backdrop).v}`);
      L.push(`- **Render:** ${RENDER_TOKENS}`);
    } else {
      L.push(`- **Lighting:** ${character.lighting || 'soft key with a cold rim light, gentle volumetric haze'}`);
      if (character.world) L.push(`- **World / setting:** ${character.world}`);
    }
    const sc = pick(SCENES, character.scene, null);
    if (sc && sc.v) L.push(`- **Performance scene (all panels):** ${sc.v}`);
    L.push(`- **Reference image:** ${character.portrait ? 'use the attached hero image for identity — do not redesign the character' : 'generate the hero keyframe first, then reuse it'}`);
    L.push('');
    L.push('### Performance intensity by section energy');
    L.push('The body must escalate with the music — a quiet intro and a peak chorus are not the same shot.');
    for (const k of ['low', 'mid', 'high']) L.push(`- **${k}** — ${INTENSITY[k]}`);
    if ((character.wardrobeAlt || '').trim()) {
      L.push('');
      L.push(`**Wardrobe change:** peak (high-energy) panels wear *${character.wardrobeAlt.trim()}*; ` +
        'everything else about the character stays identical.');
    }
    L.push('');
    L.push(`> ${negativeLine(character)}`);
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
      L.push('| # | Time | Sec | Energy | Panel | Chord | Hand placement | Movement |');
      L.push('|---|------|-----|--------|-------|-------|----------------|----------|');
      for (const p of panels) {
        L.push(`| ${p.index} | ${mmss(p.start)}–${mmss(p.end)} | ${p.section} | ${p.label} | ` +
          `${p.type.id}${p.isDrop ? ' 💥DROP' : ''} | ${p.chord || '—'} | ${p.hand || '—'} | ${p.movement} |`);
      }
      L.push('');
      L.push.apply(L, fingeringSection(a, inst));

      // Ready-to-paste short prompts. Midjourney weights early tokens and
      // dilutes long prose, so it gets its own priority-ordered variant.
      L.push('## MIDJOURNEY — one line per panel (paste as-is)');
      L.push('');
      const mjParams = toolParams(character, 'midjourney').split('\n')[0];
      for (const p of panels) {
        L.push(`**${p.index}. ${mmss(p.start)}–${mmss(p.end)} · ${p.chord || '—'}**  `);
        L.push('`' + compactPrompt(character, p) + ' ' + mjParams + '`');
        L.push('');
      }
      L.push('For panels after the first, append `--cref <URL of your hero image> --cw 100` ' +
        'so the face and wardrobe stay locked.');
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
  function panelPrompt(character, panel) {
    // Name the chord, then give the exact finger placement. The precise
    // version beats the generic one — it leaves nothing for the model to guess.
    const exact = panel.chord ? MM.fingeringSentence(panel.chord, character.instrument) : null;
    const action = `playing the ${instrumentBlock(character)}` +
      (panel.chord ? `, forming the ${panel.chord} chord — ${exact || panel.hand || ''}` : '') +
      `, ${panel.movement}`;
    return stack(character, {
      framing: panel.type.frame, action,
      energy: panel.label,
      intensity: INTENSITY[panel.label] || INTENSITY.mid
    }) + '\n\n' + negativeLine(character);
  }

  /** The identity block — repeated verbatim everywhere, which is what
   *  actually holds a character together across generations. */
  /** Wardrobe may change between a calm section and a peak one — the identity
   *  must not. Everything except the clothes stays byte-identical. */
  const wardrobeFor = (c, label) =>
    (label === 'high' && (c.wardrobeAlt || '').trim()) ? c.wardrobeAlt.trim() : (c.wardrobe || '');

  function identityBlock(c, label) {
    const bits = [];
    if (c.age) bits.push(c.age);
    const arch = pick(ARCHETYPES, c.archetype, null);
    if (arch && arch.v) bits.push(arch.v);
    bits.push(c.description || '[describe face, hair, build, distinguishing detail]');
    // the user's own features win; the archetype only fills the gap
    const feat = (c.features || '').trim() || (arch && arch.features) || '';
    if (feat) bits.push(feat);
    const w = wardrobeFor(c, label);
    if (w) bits.push(`wearing ${w}`);
    if (isPhotoreal(c)) bits.push(pick(SKIN, c.skin).v);
    return bits.filter(Boolean).join(', ');
  }

  /** Reads as one natural noun phrase. If the user's detail already names the
   *  instrument ("custom electric guitar, teal finish") we don't say it twice. */
  function instrumentBlock(c) {
    const base = c.instrument === 'piano' ? 'piano' : 'guitar';
    const theme = pick(INSTRUMENT_THEMES, c.instrumentTheme, null);
    const parts = [];
    const d = (c.instrumentDetail || '').trim();
    if (d) parts.push(new RegExp(base, 'i').test(d) ? d : `${d} ${base}`);
    else parts.push(c.instrument === 'piano' ? 'grand piano' : 'acoustic guitar');
    if (theme && theme.v) parts.push(theme.v);
    return parts.join(', ');
  }

  /** Per-chord finger placement, spelled out. This is the instruction that
   *  actually stops a generated musician from resting a shapeless hand on the
   *  neck — the single most common failure in AI images of players. */
  function fingeringSection(analysis, instrument) {
    // progressionOf only collapses consecutive repeats; a looping progression
    // would list the same chord over and over, so take the distinct set.
    const chords = [...new Set(A.progressionOf(analysis || {}))];
    if (!chords.length) return [];
    const L = ['## EXACT FINGERING (copy verbatim into the panel that uses the chord)', ''];
    for (const ch of chords) {
      const s = MM.fingeringSentence(ch, instrument);
      L.push(`- **${ch}** — ${s || 'no stored shape; do not invent one — keep the hands out of frame'}`);
    }
    L.push('');
    L.push('These are real playable shapes. If a panel shows the hands, the fingers must match ' +
      'the line for that panel\'s chord exactly — same fingers, same strings, same frets.');
    L.push('');
    return L;
  }

  /** Assemble the layered prompt shared by hero / sheet / panel prompts. */
  function stack(c, opts) {
    opts = opts || {};
    const style = pick(STYLES, c.style, STYLES[3]);
    const photo = isPhotoreal(c);
    const L = [identityBlock(c, opts.energy)];
    L.push(opts.action || `holding the ${instrumentBlock(c)}`);
    if (opts.intensity) L.push(opts.intensity);
    L.push(style.anchor);
    if (opts.framing) L.push(opts.framing);
    L.push(photo ? pick(CAMERAS, c.camera).v : (opts.camera || 'medium shot, eye level'));
    L.push(photo ? pick(LIGHTING, c.lighting).v : (c.lighting || 'soft key with a cold rim light'));
    // panels perform in a scene; the hero sits on a controlled backdrop
    const scene = opts.scene !== false && pick(SCENES, c.scene, null);
    L.push((scene && scene.v) || c.world ||
      (photo ? pick(BACKDROPS, c.backdrop).v : 'clean studio backdrop'));
    L.push(c.palette || PALETTES[0].v);
    if (photo) L.push(RENDER_TOKENS);
    return L.filter(Boolean).join(' — ') + '.';
  }

  const negativeLine = c => 'Negative prompt: ' + NEGATIVE_BASE.join(', ') +
    (c.instrument === 'piano' ? ', wrong number of keys, hands passing through keys'
      : ', wrong number of strings, fingers behind the fretboard, hand floating above the strings') + '.';

  /** Hero keyframe — generate this FIRST and reuse it as the reference image. */
  function keyframePrompt(c) {
    const p = stack(c, {
      framing: 'three-quarter front view, waist-up, confident relaxed pose, both hands clearly ' +
        'visible and correctly placed on the instrument, sharp focus on the hands and eyes',
      action: `holding the ${instrumentBlock(c)}`,
      scene: false        // the hero is a controlled portrait, not a performance
    });
    return p + '\n\n' + negativeLine(c);
  }

  /** Turnaround sheet — the single most useful artifact for keeping a
   *  realistic 3D character identical across an entire clip. */
  function characterSheetPrompt(c) {
    const style = pick(STYLES, c.style, STYLES[3]);
    const L = [];
    L.push('CHARACTER REFERENCE SHEET — same person in every view, identical face, hair, wardrobe and instrument.');
    L.push('');
    L.push(`Subject: ${identityBlock(c)}, with the ${instrumentBlock(c)}.`);
    L.push(`Style: ${style.anchor}`);
    if (isPhotoreal(c)) {
      L.push(`Lighting: ${pick(LIGHTING, c.lighting).v}`);
      L.push(`Backdrop: ${c.world || pick(BACKDROPS, c.backdrop).v}`);
      L.push(`Camera: ${pick(CAMERAS, c.camera).v}`);
    }
    L.push('');
    L.push('Views, evenly spaced on one sheet, consistent scale and lighting across all of them:');
    L.push('1. Front, full body, neutral A-pose holding the instrument');
    L.push('2. Three-quarter front, playing position');
    L.push('3. Profile (side), playing position');
    L.push('4. Back view, showing hair and wardrobe from behind');
    L.push('5. Head close-up, neutral expression');
    L.push('6. Hands close-up on the instrument — correct anatomy, fingers pressing the strings/keys');
    L.push('');
    L.push(negativeLine(c));
    return L.join('\n');
  }

  /* ============================================================
     Compact variant
     One prompt does not fit every tool. The layered prose above is right
     for GPT/Gemini, which read it as instructions. Midjourney weights
     early tokens and dilutes past roughly sixty words, so a 1500-character
     paragraph turns to mush and the hand instruction — buried at the end —
     is the first thing lost. This builds a short, priority-ordered variant
     where identity, instrument and chord come first.
     ============================================================ */
  const firstClause = s => String(s || '').split(',')[0].trim();

  /** A few words instead of a full finger-by-finger sentence. */
  function shortHand(chord, instrument) {
    if (!chord) return '';
    if (instrument === 'piano') {
      const v = MM.pianoVoicing(chord, 4);
      return v ? `right hand on ${v.keys.map(k => k.note).join('-')}, left hand on the ${v.bass.note} bass` : '';
    }
    const f = MM.guitarFingering(chord);
    if (!f) return '';
    if (f.barre) return `index finger barring all strings at fret ${f.baseFret}`;
    const frets = [...new Set(f.shape.filter(x => typeof x === 'number' && x > 0))].sort((a, b) => a - b);
    if (!frets.length) return 'all strings open';
    const list = frets.length < 2 ? String(frets[0])
      : frets.slice(0, -1).join(', ') + ' and ' + frets[frets.length - 1];
    return `fingers pressing fret${frets.length > 1 ? 's' : ''} ${list} near the nut`;
  }

  function compactPrompt(c, panel) {
    const style = pick(STYLES, c.style, STYLES[3]);
    const scene = pick(SCENES, c.scene, null);
    const label = panel ? panel.label : 'mid';
    const arch = pick(ARCHETYPES, c.archetype, null);
    const bits = [];
    if (c.age) bits.push(c.age);
    if (arch && arch.v) bits.push(arch.v);
    if (c.description) bits.push(firstClause(c.description));
    const feat = (c.features || '').trim() || (arch && arch.features) || '';
    if (feat) bits.push(firstClause(feat));
    const w = wardrobeFor(c, label);
    if (w) bits.push(`wearing ${firstClause(w)}`);
    bits.push(`playing ${firstClause(instrumentBlock(c))}`);
    if (panel && panel.chord) {
      bits.push(`${panel.chord} chord`);
      const sh = shortHand(panel.chord, c.instrument);
      if (sh) bits.push(sh);
    }
    if (label === 'high') bits.push('sweat-damp hair, caught mid-motion');
    if (panel) bits.push(firstClause(panel.type.frame));
    if (scene && scene.v) bits.push(firstClause(scene.v));
    bits.push(firstClause(pick(LIGHTING, c.lighting).v));
    bits.push(firstClause(style.anchor));
    if (c.palette) bits.push(c.palette);
    return bits.filter(Boolean).join(', ');
  }

  /** Catch the things that quietly ruin a generation before the user pastes it. */
  function promptHealth(text, c, panel) {
    const words = String(text).trim().split(/\s+/).length;
    const warn = [];
    if (/\[describe|\[character\]/.test(text))
      warn.push('הזהות עדיין מציין מקום — מלא את תיאור הדמות, אחרת המודל ימציא אותה');
    if (panel && panel.chord && !text.includes(panel.chord))
      warn.push('האקורד לא מופיע בפרומפט');
    // negatives arrive either as a prose line (GPT/Gemini) or as --no (Midjourney)
    if (isPhotoreal(c) && !/Negative prompt/.test(text) && !/--no\s/.test(text))
      warn.push('חסר negative prompt — הידיים הן נקודת הכישלון');
    if (words > 130)
      warn.push(`${words} מילים — ארוך מדי ל-Midjourney, השתמש בגרסה הקומפקטית`);
    return { words, chars: String(text).length, warnings: warn };
  }

  /** Tool-specific suffixes. Getting these right is often the difference
   *  between a good prompt and a good image. */
  function toolParams(c, tool) {
    const photo = isPhotoreal(c);
    switch (tool) {
      case 'midjourney':
        // Midjourney takes negatives as --no, not as a "Negative prompt:" line.
        return `--ar 2:3 ${photo ? '--style raw --stylize 150' : '--stylize 400'} --quality 2 ` +
          '--no extra fingers, deformed hands, blurry, watermark, text' +
          '\n(for later panels add --cref <URL of your hero image> --cw 100 to lock the character)';
      case 'gemini':
        return 'Ask for a single image, state the hand placement as an explicit instruction sentence, ' +
          'and attach the hero image as a reference for every follow-up panel.';
      case 'gpt':
        return 'Attach the hero image and say "same person, same wardrobe, same instrument" in every ' +
          'follow-up request; describe only what changes (framing, chord, movement).';
      default: return '';
    }
  }

  /** Everything needed to actually produce this character, in one place. */
  function characterBrief(c) {
    const L = [];
    L.push(`# 🎭 ${c.name || 'Character'} — Character Brief`);
    L.push('');
    L.push(`**Instrument:** ${instrumentBlock(c)}  `);
    L.push(`**Style:** ${pick(STYLES, c.style, STYLES[3]).he}`);
    L.push('');
    L.push('## 1. Hero keyframe (generate this first)');
    L.push('```');
    L.push(keyframePrompt(c));
    L.push('```');
    L.push('');
    L.push('## 2. Character sheet (lock consistency)');
    L.push('```');
    L.push(characterSheetPrompt(c));
    L.push('```');
    L.push('');
    L.push('## 3. Tool notes');
    for (const t of TOOLS.still) L.push(`**${t.he}** — ${t.note}\n\n\`${toolParams(c, t.id)}\`\n`);
    L.push('');
    L.push('## 4. Then');
    L.push('Feed the hero image into the master prompt panels (per song) and animate each ' +
      'keyframe with Sora / Veo / Kling / Runway using image-to-video.');
    return L.join('\n');
  }

  global.Characters = {
    STYLES, PALETTES, TOOLS, PANEL_TYPES,
    CAMERAS, LIGHTING, BACKDROPS, SKIN, NEGATIVE_BASE,
    ARCHETYPES, INSTRUMENT_THEMES, SCENES, INTENSITY, fingeringSection, wardrobeFor,
    compactPrompt, shortHand, promptHealth,
    isPhotoreal, identityBlock, instrumentBlock,
    buildPanels, masterPrompt, panelPrompt, keyframePrompt,
    characterSheetPrompt, characterBrief, toolParams, mmss
  };
})(window);
