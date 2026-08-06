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
  const listeners = { state: [], ready: [], time: [] };

  // smooth clock
  let anchorMedia = 0;       // media time at the last anchor
  let anchorWall = 0;        // performance.now() at the last anchor
  let playing = false;
  let duration = 0;
  let currentId = null;
  let rafId = null;

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
            if (e.data === S.PLAYING) {
              playing = true;
              anchor(safeTime());
              duration = yt.getDuration ? yt.getDuration() : 0;
            } else {
              playing = false;
              anchor(safeTime());
            }
            emit('state', e.data, { playing, duration });
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
  function anchor(t) { anchorMedia = t; anchorWall = performance.now(); }

  /** Interpolated media time — smooth at 60fps, re-anchored on drift. */
  function now() {
    if (!ready) return 0;
    if (!playing) return anchorMedia;
    return anchorMedia + (performance.now() - anchorWall) / 1000;
  }

  function startLoop() {
    if (rafId) return;
    let lastPoll = 0;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const wall = performance.now();
      // Re-anchor ~6x/sec; snap hard on a real jump (seek), ease on small drift.
      if (playing && wall - lastPoll > 160) {
        lastPoll = wall;
        const real = safeTime();
        const predicted = now();
        const drift = real - predicted;
        if (Math.abs(drift) > 0.4) anchor(real);            // seek / stall
        else anchor(predicted + drift * 0.25);              // gentle correction
        if (!duration && yt.getDuration) duration = yt.getDuration() || 0;
      }
      emit('time', now(), duration, playing);
    };
    rafId = requestAnimationFrame(tick);
  }

  const Player = {
    init, on,
    get ready() { return ready; },
    get playing() { return playing; },
    get duration() { return duration || (yt && yt.getDuration ? yt.getDuration() : 0); },
    get videoId() { return currentId; },
    time: now,
    load(videoId, autoplay) {
      if (!ready || !videoId) return;
      currentId = videoId;
      duration = 0; anchor(0);
      if (autoplay === false) yt.cueVideoById(videoId);
      else yt.loadVideoById(videoId);
    },
    play() { if (ready && yt.playVideo) yt.playVideo(); },
    pause() { if (ready && yt.pauseVideo) yt.pauseVideo(); },
    toggle() { playing ? Player.pause() : Player.play(); },
    seek(t) {
      if (!ready) return;
      t = Math.max(0, t);
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
