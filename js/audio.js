// Synthesized sound effects and procedural space music (Web Audio API, no audio files).
window.OD = window.OD || {};
(function (OD) {
  "use strict";

  const A = (OD.audio = { ctx: null, music: true, sfx: true, intensity: 0 });
  let master, sfxBus, musicBus, delaySend, noiseBuf;
  const lastPlayed = {};

  try {
    const s = JSON.parse(localStorage.getItem("od_audio") || "{}");
    if (s.music === false) A.music = false;
    if (s.sfx === false) A.sfx = false;
  } catch { /* storage unavailable */ }

  function save() {
    try { localStorage.setItem("od_audio", JSON.stringify({ music: A.music, sfx: A.sfx })); } catch { /* ignore */ }
  }

  // Must be called from a user gesture (tap/click) so mobile browsers allow audio.
  A.init = function () {
    if (A.ctx) { if (A.ctx.state === "suspended") A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (A.ctx = new AC());
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = A.sfx ? 0.55 : 0; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = A.music ? 0.32 : 0; musicBus.connect(master);
    // echo for the music arpeggio
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.51;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const dl = ctx.createBiquadFilter(); dl.type = "lowpass"; dl.frequency.value = 2400;
    delaySend = ctx.createGain(); delaySend.gain.value = 0.5;
    delaySend.connect(delay); delay.connect(dl); dl.connect(fb); fb.connect(delay); dl.connect(musicBus);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startMusic();
  };

  A.toggleMusic = function () {
    A.music = !A.music; save();
    if (musicBus) musicBus.gain.setTargetAtTime(A.music ? 0.32 : 0, A.ctx.currentTime, 0.1);
    return A.music;
  };
  A.toggleSfx = function () {
    A.sfx = !A.sfx; save();
    if (sfxBus) sfxBus.gain.setTargetAtTime(A.sfx ? 0.55 : 0, A.ctx.currentTime, 0.05);
    return A.sfx;
  };
  A.setIntensity = v => { A.intensity = v; };
  // Silence everything (used while an ad is playing).
  A.setMuted = m => { if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, A.ctx.currentTime, 0.05); };

  // ---------- building blocks ----------
  function tone({ f, f2, dur, type = "sine", vol = 0.3, attack = 0.005, when = 0, dest }) {
    const ctx = A.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise({ dur, freq = 1000, f2, q = 1, vol = 0.3, type = "lowpass", when = 0, dest }) {
    const ctx = A.ctx, t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  const notes = (list, type, vol, gap, dur) => list.forEach((f, i) => tone({ f, dur, type, vol, when: i * gap }));

  const SFX = {
    laser:   () => tone({ f: 1500, f2: 700, dur: 0.06, type: "square", vol: 0.035 }),
    prism:   () => tone({ f: 2200, f2: 1100, dur: 0.08, type: "triangle", vol: 0.05 }),
    lance:   () => tone({ f: 180, f2: 240, dur: 0.18, type: "sawtooth", vol: 0.03 }),
    missile: () => noise({ dur: 0.25, freq: 1800, f2: 500, type: "bandpass", q: 2, vol: 0.14 }),
    boom:    () => { noise({ dur: 0.35, freq: 900, f2: 90, vol: 0.3 }); tone({ f: 130, f2: 45, dur: 0.25, vol: 0.2 }); },
    nova:    () => { noise({ dur: 0.9, freq: 1400, f2: 50, vol: 0.45 }); tone({ f: 90, f2: 30, dur: 0.8, vol: 0.35 }); },
    rail:    () => { tone({ f: 2600, f2: 180, dur: 0.22, type: "sawtooth", vol: 0.08 }); noise({ dur: 0.08, freq: 5000, type: "highpass", vol: 0.08 }); },
    coil:    () => tone({ f: 1800, f2: 400, dur: 0.07, type: "sawtooth", vol: 0.04 }),
    emp:     () => { tone({ f: 95, f2: 38, dur: 0.45, vol: 0.32 }); tone({ f: 300, f2: 1400, dur: 0.3, type: "triangle", vol: 0.05 }); },
    zap:     () => noise({ dur: 0.09, freq: 3200, type: "bandpass", q: 5, vol: 0.14 }),
    push:    () => tone({ f: 55, f2: 190, dur: 0.55, vol: 0.32 }),
    freeze:  () => { tone({ f: 2100, f2: 3200, dur: 0.25, type: "triangle", vol: 0.05 }); noise({ dur: 0.35, freq: 7000, type: "highpass", vol: 0.06 }); },
    pew:     () => tone({ f: 950, f2: 520, dur: 0.05, type: "triangle", vol: 0.03 }),
    bomb:    () => { noise({ dur: 0.25, freq: 700, f2: 100, vol: 0.2 }); },
    pop:     () => noise({ dur: 0.1, freq: 1600, f2: 300, type: "bandpass", q: 1.5, vol: 0.1 }),
    crunch:  () => { noise({ dur: 0.3, freq: 600, f2: 120, vol: 0.25 }); },
    shield:  () => tone({ f: 600, f2: 1200, dur: 0.1, type: "sine", vol: 0.04 }),
    coin:    () => { tone({ f: 1320, dur: 0.07, type: "square", vol: 0.035 }); tone({ f: 1760, dur: 0.12, type: "square", vol: 0.035, when: 0.06 }); },
    place:   () => { tone({ f: 330, f2: 660, dur: 0.12, type: "triangle", vol: 0.14 }); tone({ f: 990, dur: 0.08, type: "sine", vol: 0.06, when: 0.08 }); },
    upgrade: () => notes([523, 659, 784, 1047], "square", 0.045, 0.055, 0.12),
    path:    () => notes([392, 523, 659, 784, 1047, 1319], "square", 0.045, 0.05, 0.14),
    sell:    () => tone({ f: 700, f2: 250, dur: 0.18, type: "triangle", vol: 0.12 }),
    deny:    () => tone({ f: 160, dur: 0.12, type: "square", vol: 0.06 }),
    click:   () => tone({ f: 800, dur: 0.03, type: "sine", vol: 0.05 }),
    leak:    () => { tone({ f: 220, f2: 90, dur: 0.4, type: "sawtooth", vol: 0.12 }); noise({ dur: 0.3, freq: 400, vol: 0.2 }); },
    wave:    () => { tone({ f: 220, f2: 440, dur: 0.35, type: "triangle", vol: 0.12 }); tone({ f: 330, f2: 660, dur: 0.35, type: "triangle", vol: 0.08, when: 0.05 }); },
    alarm:   () => { for (let i = 0; i < 3; i++) tone({ f: 440, f2: 880, dur: 0.38, type: "sawtooth", vol: 0.07, when: i * 0.45 }); },
    clear:   () => notes([523, 659, 784, 1047], "triangle", 0.1, 0.09, 0.25),
    overdrive: () => { tone({ f: 120, f2: 900, dur: 0.6, type: "sawtooth", vol: 0.08 }); noise({ dur: 0.6, freq: 300, f2: 3000, type: "bandpass", vol: 0.1 }); },
    lose:    () => notes([440, 392, 330, 262, 196], "sawtooth", 0.07, 0.22, 0.4),
    win:     () => notes([523, 659, 784, 1047, 784, 1047, 1319], "square", 0.06, 0.13, 0.3),
  };

  // Minimum seconds between repeats of the same sound, so fast towers at 3× speed don't clip.
  const GAP = { laser: 0.07, prism: 0.07, lance: 0.16, pew: 0.06, pop: 0.045, zap: 0.05, boom: 0.07, bomb: 0.08,
    missile: 0.09, coin: 0.12, rail: 0.06, coil: 0.06, shield: 0.08, crunch: 0.1, emp: 0.12, freeze: 0.15, push: 0.2 };

  A.play = function (name) {
    if (!A.ctx || !A.sfx || !SFX[name] || A.ctx.state !== "running") return;
    const now = A.ctx.currentTime, gap = GAP[name] ?? 0.02;
    if (lastPlayed[name] && now - lastPlayed[name] < gap) return;
    lastPlayed[name] = now;
    SFX[name]();
  };

  // ---------- music ----------
  // A slow, spacey loop in A minor: pads + soft bass + echoing arpeggio. Gets busier when a boss is on screen.
  const BPM = 84, STEP = 60 / BPM / 2; // eighth notes
  const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 66]]; // Am7 Fmaj7 Cmaj7 G(add)
  const midi = m => 440 * Math.pow(2, (m - 69) / 12);
  let step = 0, nextTime = 0;

  function pad(chord, t, dur) {
    const ctx = A.ctx;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700; f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 1.2);
    g.gain.setValueAtTime(0.05, t + dur - 1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
    f.connect(g); g.connect(musicBus);
    for (const m of chord) for (const det of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = "sawtooth";
      o.frequency.value = midi(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.7);
    }
  }

  function pluck(freq, t, vol, type = "triangle", dur = 0.35, send = true) {
    const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicBus); if (send) g.connect(delaySend);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function hat(t, vol) {
    const ctx = A.ctx, s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 8000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(musicBus); s.start(t, Math.random() * 0.5); s.stop(t + 0.06);
  }

  function scheduleStep(t) {
    const bar = Math.floor(step / 16) % CHORDS.length, chord = CHORDS[bar], s = step % 16;
    if (s === 0) pad(chord, t, STEP * 16);
    if (s % 4 === 0) pluck(midi(chord[0] - 24), t, 0.16, "sine", STEP * 3.5, false);
    if (s % 4 === 2 && A.intensity) pluck(midi(chord[0] - 24), t, 0.12, "sine", STEP * 1.5, false);
    const arp = [0, 2, 1, 3, 2, 1, 3, 0];
    if (A.intensity ? true : s % 2 === 0) pluck(midi(chord[arp[s % 8]] + 12), t, A.intensity ? 0.05 : 0.04);
    if (A.intensity && s % 2 === 1) hat(t, 0.05);
    if (A.intensity && s % 8 === 4) { // low pulse "drum"
      const o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.3);
    }
    step++;
  }

  function startMusic() {
    nextTime = A.ctx.currentTime + 0.2;
    setInterval(() => {
      if (!A.ctx || A.ctx.state !== "running") return;
      if (nextTime < A.ctx.currentTime - 1) nextTime = A.ctx.currentTime + 0.05; // tab was asleep
      while (nextTime < A.ctx.currentTime + 0.2) { scheduleStep(nextTime); nextTime += STEP; }
    }, 50);
  }

  // Resume audio after the phone/tab comes back.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && A.ctx && A.ctx.state === "suspended") A.ctx.resume();
  });
})(window.OD);
