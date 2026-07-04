// ============================================================
//  CHROMA RIFT — audio.js
//  Tiny WebAudio synth. No sound files; everything is generated.
// ============================================================
"use strict";

const Sound = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  let started = false;
  let vol = 0.5;            // 0..1 master volume

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : vol;
    master.connect(ctx.destination);
  }

  function applyGain() { if (master) master.gain.value = muted ? 0 : vol; }

  // call on first user gesture
  function unlock() {
    ensure();
    if (ctx && ctx.state === "suspended") ctx.resume();
    started = true;
  }

  // a single oscillator "blip" with a pitch slide + gain envelope
  function tone(opts) {
    if (!ctx || muted || !started) return;
    const t0 = ctx.currentTime;
    const {
      type = "sine", freq = 440, freqTo = freq, dur = 0.15,
      vol = 0.3, attack = 0.005, decay = dur, detune = 0,
    } = opts;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + dur);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);

    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // short burst of filtered noise (explosions / hits)
  function noise(opts) {
    if (!ctx || muted || !started) return;
    const { dur = 0.25, vol = 0.3, freq = 900, q = 1, type = "lowpass" } = opts;
    const t0 = ctx.currentTime;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur);
  }

  const baseByColor = [330, 392, 466]; // R, G, B firing pitches

  return {
    unlock,
    isMuted: () => muted,
    toggle() { muted = !muted; applyGain(); if (!muted) unlock(); return muted; },
    setVolume(v) { vol = Math.max(0, Math.min(1, v)); applyGain(); },
    getVolume() { return vol; },

    shoot(colorIdx) {
      tone({ type: "square", freq: baseByColor[colorIdx] * 2, freqTo: baseByColor[colorIdx] * 2.6, dur: 0.08, vol: 0.12, decay: 0.07 });
    },
    switchColor(colorIdx) {
      tone({ type: "triangle", freq: baseByColor[colorIdx], freqTo: baseByColor[colorIdx] * 1.5, dur: 0.1, vol: 0.18 });
    },
    blocked() {
      tone({ type: "sawtooth", freq: 160, freqTo: 90, dur: 0.09, vol: 0.1 });
    },
    hit() {
      noise({ dur: 0.12, vol: 0.16, freq: 1600, q: 0.7, type: "bandpass" });
    },
    explode() {
      noise({ dur: 0.35, vol: 0.32, freq: 700, type: "lowpass" });
      tone({ type: "sine", freq: 200, freqTo: 50, dur: 0.3, vol: 0.18 });
    },
    bigExplode() {
      noise({ dur: 0.7, vol: 0.4, freq: 500, type: "lowpass" });
      tone({ type: "sine", freq: 140, freqTo: 35, dur: 0.6, vol: 0.28 });
    },
    hurt() {
      tone({ type: "sawtooth", freq: 220, freqTo: 70, dur: 0.25, vol: 0.28 });
      noise({ dur: 0.2, vol: 0.18, freq: 400, type: "lowpass" });
    },
    wave() {
      tone({ type: "triangle", freq: 330, freqTo: 660, dur: 0.18, vol: 0.22 });
      setTimeout(() => tone({ type: "triangle", freq: 494, freqTo: 988, dur: 0.22, vol: 0.22 }), 110);
    },
    levelUp() {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => tone({ type: "triangle", freq: f, dur: 0.16, vol: 0.2 }), i * 70));
    },
    bossWarn() {
      tone({ type: "sawtooth", freq: 110, freqTo: 70, dur: 0.6, vol: 0.3 });
      setTimeout(() => tone({ type: "sawtooth", freq: 110, freqTo: 70, dur: 0.6, vol: 0.3 }), 350);
    },
    enemyShot() {
      tone({ type: "square", freq: 180, freqTo: 120, dur: 0.12, vol: 0.08 });
    },
    pickup(big) {
      tone({ type: "triangle", freq: big ? 660 : 523, freqTo: big ? 1320 : 1047, dur: 0.14, vol: 0.16 });
    },
    gameOver() {
      [392, 330, 262, 196].forEach((f, i) =>
        setTimeout(() => tone({ type: "sawtooth", freq: f, dur: 0.3, vol: 0.22 }), i * 160));
    },
  };
})();
