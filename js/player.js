/* ============================================================
   player.js — YouTube playback + a smooth clock
   The IFrame API only reports currentTime a few times a second.
   Driving an animation straight off it makes the performer stutter,
   so we run a local clock that advances with rAF and re-anchors to
   the API whenever it drifts. That's what makes the sync feel tight.
   ============================================================ */
(function (global) {
  'use strict';

  let yt = null;             // YT.Player instance
  let ready = false;
  let apiLoading = false;
  /* The channels anyone can listen on. `emit` indexes this directly, so a
     channel that is emitted but not declared here throws — which is exactly
     what adding `rate` without adding it here did. Declared, not created on
     demand, so a typo in a channel name fails loudly instead of going
     nowhere quietly. */
  const listeners = { state: [], ready: [], time: [], ad: [], rate: [] };

  // smooth clock
  let anchorMedia = 0;       // media time at the last anchor
  let anchorWall = 0;        // performance.now() at the last anchor
  let playing = false;
  let currentId = null;
  let rafId = null;
  /* Silent mode: a track with no video at all. The clock here was always
     local — YouTube only re-anchored it — so a practice track can run on the
     same clock with the polling skipped and nothing to re-anchor against. */
  let silent = false;

  /* Ads.
     YouTube plays its own video before (and sometimes inside) the song, and
     while it does, every number the API hands back describes the ad:
     getDuration() is the ad's length and getCurrentTime() is the ad's
     position. Believed literally that wrecks three things at once — the
     performer plays chords against the ad's clock, `duration` latches the
     ad's length and never recovers, and a recording that stops "at the end
     of the song" stops at the end of the ad instead.

     So we keep the song's own length separately from whatever is on screen
     now, and freeze the song clock while an ad runs. */
  let songDur = 0;           // the requested video's length, ad-free
  let songDurSure = false;   // ...and whether we know that for certain
  let adPlaying = false;

  const emit = (k, ...a) => listeners[k].forEach(f => { try { f(...a); } catch (e) { console.error(e); } });
  const on = (k, f) => { if (listeners[k]) listeners[k].push(f); };

  function loadApi() {
    if (apiLoading || global.YT) return;
    apiLoading = true;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    document.head.appendChild(s);
  }

  function init(mountId) {
    loadApi();
    const boot = () => {
      yt = new global.YT.Player(mountId, {
        height: '100%', width: '100%', videoId: '',
        playerVars: {
          controls: 0, disablekb: 1, modestbranding: 1, rel: 0,
          playsinline: 1, iv_load_policy: 3, fs: 0
        },
        events: {
          onReady: () => { ready = true; emit('ready'); startLoop(); },
          onStateChange: e => {
            const S = global.YT.PlayerState;
            /* A cued video is the one reading no ad can contaminate: nothing
               is streaming over it yet, so getDuration() is the song's own
               length. Loading with autoplay off and reading it here is what
               lets us recognise an ad later by its different length. */
            if (e.data === S.CUED) latchSongDuration(true);
            else if (e.data === S.PAUSED || e.data === S.ENDED) latchSongDuration(false);
            checkAd();
            if (e.data === S.PLAYING) {
              playing = true;
              if (!adPlaying) anchor(safeTime());
            } else {
              playing = false;
              if (!adPlaying) anchor(safeTime());
            }
            emit('state', e.data, { playing, duration: Player.duration });
          },
          onError: () => emit('state', -1, { playing: false, duration: 0 })
        }
      });
    };
    if (global.YT && global.YT.Player) boot();
    else global.onYouTubeIframeAPIReady = boot;
  }

  const safeTime = () => {
    try { return yt && yt.getCurrentTime ? yt.getCurrentTime() || 0 : 0; }
    catch (e) { return 0; }
  };
  /** Whatever is on screen right now — the song, or an ad running over it. */
  const mediaDur = () => {
    try { return (yt && yt.getDuration ? yt.getDuration() : 0) || 0; }
    catch (e) { return 0; }
  };
  function anchor(t) { anchorMedia = t; anchorWall = performance.now(); }

  /**
   * Is the thing playing right now our video?
   * true / false / null when the player will not say.
   */
  function playingOurs() {
    if (!yt || !currentId) return null;
    try {
      const d = yt.getVideoData && yt.getVideoData();
      if (d && typeof d.video_id === 'string' && d.video_id) return d.video_id === currentId;
    } catch (e) { /* fall through to the length test */ }
    return null;
  }

  function latchSongDuration(certain) {
    const d = mediaDur();
    if (d > 0 && (certain || !adPlaying)) { songDur = d; songDurSure = songDurSure || certain; }
  }

  /**
   * Two independent tests, because neither is available everywhere.
   * The identity test is exact when the player answers it. The length test
   * is the fallback: an ad is a different video, so it reports a different
   * length than the one we latched while the song was cued.
   */
  function checkAd() {
    if (silent || !ready || !currentId) return setAd(false);
    const md = mediaDur();

    /* The length read while the video was cued is the one number no ad can
       fake: nothing was streaming over it yet. Once we hold it, it settles the
       question on its own — and it deliberately outranks the identity test
       below, which is undocumented and which we should not let overwrite a
       reading we are certain of. */
    if (songDurSure) { if (md) setAd(Math.abs(md - songDur) > 1.5); return; }

    const ours = playingOurs();
    if (ours === false) return setAd(true);
    if (ours === true) { if (md) songDur = md; return setAd(false); }

    if (!md) return;
    if (!songDur) { songDur = md; return setAd(false); }
    /* Without a cued reading the first length we saw may itself have been the
       ad's. Ads are shorter than the songs they interrupt, so a longer length
       appearing later is the song, not a second ad. */
    if (md > songDur + 1.5) { songDur = md; return setAd(false); }
    setAd(Math.abs(md - songDur) > 1.5);
  }

  function setAd(v) {
    if (v === adPlaying) return;
    adPlaying = v;
    emit('ad', v);
  }

  /* How fast the song is playing, as a multiple of real time.
     Slowing a song down for practice is not a display setting: it changes
     what one second of wall clock is worth in song time, and this clock is
     built on exactly that conversion. Left at 1 while the audio ran at a
     half, the app would believe the song was twice as far along as it was —
     re-anchoring would drag it back six times a second and the performer
     would stutter between the two answers. For the silent practice track
     there is nothing to re-anchor against at all, so it would simply be
     wrong. */
  let rate = 1;

  /** Interpolated media time — smooth at 60fps, re-anchored on drift. */
  function now() {
    if (!ready && !silent) return 0;
    if (!playing) return anchorMedia;
    return anchorMedia + ((performance.now() - anchorWall) / 1000) * rate;
  }

  function startLoop() {
    if (rafId) return;
    let lastPoll = 0;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const wall = performance.now();
      // Re-anchor ~6x/sec; snap hard on a real jump (seek), ease on small drift.
      if (silent) {
        // Nothing to poll. Stop at the end rather than running past it.
        if (playing && songDur && now() >= songDur) { playing = false; anchor(songDur); emit('state', 0, { playing, duration: songDur }); }
        emit('time', now(), songDur, playing);
        return;
      }
      if (playing && wall - lastPoll > 160) {
        lastPoll = wall;
        checkAd();
        if (!adPlaying) {
          const real = safeTime();
          const predicted = now();
          const drift = real - predicted;
          if (Math.abs(drift) > 0.4) anchor(real);          // seek / stall
          else anchor(predicted + drift * 0.25);            // gentle correction
          latchSongDuration(false);
        }
      }
      /* An ad is not the song moving forward. Holding the anchor every frame
         keeps the song's position exactly where the ad interrupted it, so the
         performer waits instead of playing to the wrong clock, and picks the
         song up on the same chord when it comes back. */
      if (adPlaying) anchor(anchorMedia);
      emit('time', now(), Player.duration, playing && !adPlaying);
    };
    rafId = requestAnimationFrame(tick);
  }

  const Player = {
    init, on,
    get ready() { return ready; },
    get playing() { return playing; },
    /* The song's length, never an ad's — the chart, the chord grid and the
       "record to the end" stop condition all measure against this. */
    get duration() { return songDur || (adPlaying ? 0 : mediaDur()); },
    /** What the player is actually streaming now, ad included. */
    get mediaDuration() { return mediaDur(); },
    get adPlaying() { return adPlaying; },
    get videoId() { return currentId; },
    time: now,
    /** A track with no video: the clock runs, nothing streams. */
    loadSilent(dur) {
      silent = true; currentId = null; playing = false;
      songDur = dur || 0; songDurSure = true; setAd(false); anchor(0);
      if (!rafId) startLoop();
      emit('state', -1, { playing, duration: songDur });
    },
    get silent() { return silent; },
    get rate() { return rate; },
    /**
     * Play slower (or faster) without moving the position.
     *
     * The anchor is taken at the OLD rate before the new one applies —
     * otherwise the elapsed wall time since the last anchor is re-valued at
     * the new rate and the song jumps by however long that was.
     */
    setRate(r) {
      const next = Math.max(0.25, Math.min(2, +r || 1));
      if (next === rate) return rate;
      anchor(now());
      rate = next;
      if (!silent && ready && yt.setPlaybackRate) {
        try { yt.setPlaybackRate(next); } catch (e) { /* older embeds */ }
      }
      emit('rate', rate);
      return rate;
    },
    load(videoId, autoplay) {
      if (!ready || !videoId) return;
      silent = false;
      currentId = videoId;
      songDur = 0; songDurSure = false; setAd(false); anchor(0);
      if (autoplay === false) yt.cueVideoById(videoId);
      else yt.loadVideoById(videoId);
      // Loading a video resets the embed's playback rate; the user's choice
      // is a property of how they are practising, not of the track.
      if (rate !== 1 && yt.setPlaybackRate) {
        try { yt.setPlaybackRate(rate); } catch (e) { /* older embeds */ }
      }
    },
    play() {
      if (silent) { anchor(anchorMedia); playing = true; emit('state', 1, { playing, duration: songDur }); return; }
      if (ready && yt.playVideo) yt.playVideo();
    },
    pause() {
      if (silent) { anchorMedia = now(); playing = false; emit('state', 2, { playing, duration: songDur }); return; }
      if (ready && yt.pauseVideo) yt.pauseVideo();
    },
    toggle() { playing ? Player.pause() : Player.play(); },
    seek(t) {
      t = Math.max(0, t);
      if (silent) { anchor(t); return; }
      if (!ready) return;
      yt.seekTo(t, true);
      anchor(t);
    },
    nudge(d) { Player.seek(now() + d); },
    setVolume(v) { if (ready && yt.setVolume) yt.setVolume(Math.max(0, Math.min(100, v))); },
    getVolume() { try { return ready && yt.getVolume ? yt.getVolume() : 80; } catch (e) { return 80; } },
    mute(m) { if (!ready) return; m ? yt.mute() : yt.unMute(); },
    isMuted() { try { return ready && yt.isMuted ? yt.isMuted() : false; } catch (e) { return false; } }
  };

  global.Player = Player;
})(window);
