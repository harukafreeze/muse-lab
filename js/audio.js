/*!
 * audio.js — 合成与走带
 *
 * 全部声音现场合成，不用任何音频素材：
 *   - 没有版权问题
 *   - 速度和调可以随便改
 *   - 库体积是 0
 *
 * 音色这一版重做了三件事（上一版听起来像电子琴）：
 *   1. 加了一条混响总线：脉冲响应现场生成，不引任何音频文件
 *   2. 铺底改成左右各一把失谐锯齿 + 中间三角波，低通带包络（起音亮、随后收暗）
 *   3. 旋律加了延迟颤音——它得听起来像"有人在唱"，不然配不上第 5 课
 *
 * 走带的两个关键设计没变：
 *   1. 提前 150ms 预排，不用 setTimeout 对拍
 *   2. A/B 双版本永远同时排好，切换只改 gain，在小节线上生效
 */
(function (root) {
  'use strict';

  const MT = root.MT;
  const A = {};

  const LOOKAHEAD = 0.15;
  const TICK_MS = 25;

  let ctx = null;
  let master = null;
  let reverbIn = null;
  let current = null;

  /* ============================================================
   * 上下文与总线
   * ============================================================ */

  function buildGraph() {
    master = ctx.createGain();
    master._role = 'master';
    master.gain.value = 0.72;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 2.6;
    comp.attack.value = 0.006;
    comp.release.value = 0.22;
    comp.knee.value = 8;
    master.connect(comp);
    comp.connect(ctx.destination);

    // 混响：1.9 秒的噪声尾巴，现场生成。低切一下，不然低频会和和弦抢位置。
    reverbIn = ctx.createGain();
    reverbIn._role = 'reverbIn';
    reverbIn.gain.value = 1;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 320;

    const conv = ctx.createConvolver();
    conv.buffer = impulse(1.9);

    const wet = ctx.createGain();
    wet._role = 'wet';
    wet.gain.value = 0.55;

    reverbIn.connect(hp);
    hp.connect(conv);
    conv.connect(wet);
    wet.connect(comp);
  }

  function ac() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) throw new Error('这个浏览器没有 Web Audio API');
      ctx = new AC();
    }
    if (!master) buildGraph();
    // 离线上下文是 suspended 且不能 resume，调了会抛
    const offline = typeof root.OfflineAudioContext !== 'undefined' && ctx instanceof root.OfflineAudioContext;
    if (!offline && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /**
   * 换一个上下文。给离线渲染用：OfflineAudioContext 不发声，
   * 但能把结果算成一段 PCM 拿出来量——这是唯一能不看耳朵就验证声音的办法。
   */
  A.useContext = function (c) {
    A.stop();
    ctx = c;
    master = null;
    reverbIn = null;
    return ac();
  };

  A.ctx = ac;

  function impulse(sec) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * sec));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const pre = Math.min(240, len);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        if (i < pre) { d[i] = 0; continue; }
        const t = (i - pre) / (len - pre);
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.8);
      }
    }
    return buf;
  }

  /* ============================================================
   * 音色
   * ============================================================ */

  function envelope(t0, peak, atk, hold, rel) {
    const g = ctx.createGain();
    const p = Math.max(0.0002, peak);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p, t0 + atk);
    const sus = Math.max(t0 + atk + 0.02, t0 + hold);
    // 衰减到 66% 再停住：不是硬撑，也不是拉平
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, p * 0.66), sus);
    g.gain.exponentialRampToValueAtTime(0.0001, sus + rel);
    return g;
  }

  /** 铺底：左右各一把失谐锯齿 + 中间三角波，低通带包络 */
  function pad(t0, dur, midi, dest, level) {
    const f = MT.freq(midi);
    const cutoff = Math.min(4600, Math.max(820, f * 6.5));

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(cutoff * 1.8, t0);
    lp.frequency.exponentialRampToValueAtTime(cutoff, t0 + 0.55);
    lp.frequency.setTargetAtTime(cutoff * 0.6, t0 + 0.55, 1.1);

    const g = envelope(t0, level, 0.04, dur - 0.04, 0.5);

    const oL = ctx.createOscillator();
    oL.type = 'sawtooth';
    oL.frequency.value = f;
    oL.detune.value = -6;

    const oR = ctx.createOscillator();
    oR.type = 'sawtooth';
    oR.frequency.value = f;
    oR.detune.value = 6;

    const oC = ctx.createOscillator();
    oC.type = 'triangle';
    oC.frequency.value = f;

    const pL = ctx.createStereoPanner();
    pL.pan.value = -0.34;
    const pR = ctx.createStereoPanner();
    pR.pan.value = 0.34;

    const gL = ctx.createGain(); gL.gain.value = 0.45;
    const gR = ctx.createGain(); gR.gain.value = 0.45;
    const gC = ctx.createGain(); gC.gain.value = 0.42;

    oL.connect(gL); gL.connect(pL); pL.connect(g);
    oR.connect(gR); gR.connect(pR); pR.connect(g);
    oC.connect(gC); gC.connect(g);
    g.connect(lp); lp.connect(dest);

    const end = t0 + dur + 0.6;
    [oL, oR, oC].forEach(function (o) { o.start(t0); o.stop(end); });
  }

  function bass(t0, dur, midi, dest, level) {
    const f = MT.freq(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    const g = envelope(t0, level, 0.014, dur - 0.03, 0.1);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;

    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f;
    const mix = ctx.createGain();
    mix.gain.value = 0.22;

    o.connect(g); o2.connect(mix); mix.connect(g);
    g.connect(lp); lp.connect(dest);

    const end = t0 + dur + 0.3;
    o.start(t0); o2.start(t0);
    o.stop(end); o2.stop(end);
  }

  /** 单音：起音软一点，带一点延迟颤音——听起来才像有人在唱 */
  function voice(t0, dur, midi, dest, level) {
    const f = MT.freq(midi);
    const span = Math.max(dur, 0.28);

    const g = ctx.createGain();
    const p = Math.max(0.0002, level);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, p * 0.72), t0 + 0.2);
    g.gain.setValueAtTime(Math.max(0.0002, p * 0.7), t0 + span);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + span + 0.26);

    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;

    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    const mix = ctx.createGain();
    mix.gain.value = 0.1;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.1;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t0);
    depth.gain.linearRampToValueAtTime(20, t0 + 0.5);
    lfo.connect(depth);
    depth.connect(o.detune);

    o.connect(g);
    o2.connect(mix); mix.connect(g);
    g.connect(dest);

    const end = t0 + span + 0.32;
    o.start(t0); o2.start(t0); lfo.start(t0);
    o.stop(end); o2.stop(end); lfo.stop(end);
  }

  /* ============================================================
   * 鼓
   *
   * 三个音，全是合成的，不要采样：
   *   底鼓 = 正弦从 120Hz 滑到 42Hz 的短促一声
   *   军鼓 = 带通噪声 + 一点 185Hz 的"体"
   *   踩镲 = 高通噪声，40 毫秒就没了
   * ============================================================ */

  let noiseBuf = null;

  function noiseSrc() {
    if (!noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    return src;
  }

  function drumKick(t0, dest, level) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(118, t0);
    o.frequency.exponentialRampToValueAtTime(42, t0 + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(level, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + 0.34);
  }

  function drumSnare(t0, dest, level) {
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(level, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.17);
    n.connect(bp); bp.connect(g); g.connect(dest);
    n.start(t0); n.stop(t0 + 0.2);

    // 一点"体"，不然像有人在拍手
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 186;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(level * 0.45, t0 + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
    o.connect(og); og.connect(dest);
    o.start(t0); o.stop(t0 + 0.13);
  }

  function drumHat(t0, dest, level) {
    const n = noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(level, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    n.connect(hp); hp.connect(g); g.connect(dest);
    n.start(t0); n.stop(t0 + 0.07);
  }

  /** 一个图案：缺哪格补哪格，长度一律 8（一小节八分音符） */
  function normOne(d) {
    const fix = function (a) {
      const out = [];
      for (let i = 0; i < 8; i++) out.push(a && a[i] ? 1 : 0);
      return out;
    };
    return { hats: fix(d && d.hats), snare: fix(d && d.snare), kick: fix(d && d.kick) };
  }

  /**
   * 统一成 { patterns: [...], map: [...] }。
   * 单套鼓就是 patterns 只有一个、map 只有 [0]；
   * 主歌/副歌两套就是 patterns 两个、map 是每小节用哪套。
   */
  function normalizeDrums(d) {
    if (!d) return null;
    if (d.patterns && d.patterns.length) {
      return {
        patterns: d.patterns.map(normOne),
        map: (d.map && d.map.length ? d.map : [0]).slice()
      };
    }
    return { patterns: [normOne(d)], map: [0] };
  }

  /** 第 barIdx 小节该用哪套图案 */
  function drumPatternFor(drums, barIdx) {
    const map = drums.map;
    const idx = map[barIdx % map.length] % drums.patterns.length;
    return drums.patterns[idx];
  }

  /* ============================================================
   * 走带
   * ============================================================ */

  function makeSession(opts) {
    const chordsA = (opts.chordsA || opts.chords || []).slice();
    const chordsB = opts.chordsB ? opts.chordsB.slice() : null;
    const bars = opts.bars || Math.max(chordsA.length, chordsB ? chordsB.length : 0);
    if (!bars) throw new Error('没有小节可播');

    const melody = opts.melody || [];
    const melByBar = [];
    for (let i = 0; i < bars; i++) melByBar.push([]);
    melody.forEach(function (n) {
      if (n.bar >= 0 && n.bar < bars) melByBar[n.bar].push(n);
    });

    return {
      bpm: opts.bpm || 96,
      bars: bars,
      chordsA: chordsA,
      chordsB: chordsB,
      melByBar: melByBar,
      withBass: opts.bass !== false,
      level: opts.level || 0.1,
      melLevel: opts.melLevel || 0.14,
      drumLevel: opts.drumLevel || 0.5,
      drums: normalizeDrums(opts.drums),
      barDur: (60 / (opts.bpm || 96)) * 4,
      out: null, busA: null, busB: null, busMel: null, busDrum: null,
      nextBar: 0, nextTime: 0, startTime: 0,
      timer: null, playing: false, version: 'a'
    };
  }

  function scheduleBar(s, barIdx, t0) {
    const beat = s.barDur / 4;

    const a = s.chordsA[barIdx];
    if (a) {
      const v = MT.voicing(a);
      v.notes.forEach(function (n) { pad(t0, s.barDur * 0.98, n, s.busA, s.level); });
      if (s.withBass) bass(t0, s.barDur * 0.92, v.bass, s.busA, s.level * 1.5);
    }

    if (s.chordsB) {
      const b = s.chordsB[barIdx];
      if (b) {
        const v = MT.voicing(b);
        v.notes.forEach(function (n) { pad(t0, s.barDur * 0.98, n, s.busB, s.level); });
        if (s.withBass) bass(t0, s.barDur * 0.92, v.bass, s.busB, s.level * 1.5);
      }
    }

    s.melByBar[barIdx].forEach(function (n) {
      voice(t0 + n.beat * beat, n.dur * beat, n.midi, s.busMel, s.melLevel);
    });

    if (s.drums) {
      const p = drumPatternFor(s.drums, barIdx);
      const eighth = s.barDur / 8;
      for (let i = 0; i < 8; i++) {
        const t = t0 + i * eighth;
        if (p.hats[i]) drumHat(t, s.busDrum, s.drumLevel * 0.36);
        if (p.snare[i]) drumSnare(t, s.busDrum, s.drumLevel * 0.8);
        if (p.kick[i]) drumKick(t, s.busDrum, s.drumLevel);
      }
    }
  }

  function pump(s) {
    if (!s.playing) return;
    const until = ctx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (s.nextTime < until && guard++ < 64) {
      scheduleBar(s, s.nextBar % s.bars, s.nextTime);
      s.nextBar++;
      s.nextTime += s.barDur;
    }
  }

  function boundaryAfter(s, t) {
    const el = t - s.startTime;
    if (el <= 0) return s.startTime;
    return s.startTime + Math.ceil(el / s.barDur - 1e-9) * s.barDur;
  }

  /* ============================================================
   * 对外
   * ============================================================ */

  A.play = function (opts) {
    ac();
    A.stop();
    const s = makeSession(opts);

    // 每场一个出口：干声进主总线，另一份按比例送去混响
    s.out = ctx.createGain();
    s.out._role = 'out';
    s.out.gain.value = 1;
    s.out.connect(master);

    const send = ctx.createGain();
    send._role = 'send';
    send.gain.value = 0.2;
    s.out.connect(send);
    send.connect(reverbIn);

    s.busA = ctx.createGain();
    s.busA._role = 'busA';
    s.busA.gain.value = 1;
    s.busA.connect(s.out);

    s.busB = ctx.createGain();
    s.busB._role = 'busB';
    s.busB.gain.value = 0;
    s.busB.connect(s.out);

    s.busMel = ctx.createGain();
    s.busMel._role = 'busMel';
    s.busMel.gain.value = 1;
    s.busMel.connect(s.out);

    // 鼓不跟着 20% 的混响走：底鼓进混响会糊成一片
    s.busDrum = ctx.createGain();
    s.busDrum._role = 'busDrum';
    s.busDrum.gain.value = 1;
    s.busDrum.connect(master);
    const drumSend = ctx.createGain();
    drumSend.gain.value = 0.07;
    s.busDrum.connect(drumSend);
    drumSend.connect(reverbIn);

    s.playing = true;
    s.startTime = ctx.currentTime + 0.08;
    s.nextTime = s.startTime;
    s.nextBar = 0;
    current = s;

    if (opts.preSchedule) {
      // 离线渲染没有实时时钟推进，一次性把整段排完
      for (let b = 0; b < s.bars; b++) scheduleBar(s, b, s.startTime + b * s.barDur);
      s.nextBar = s.bars;
      s.nextTime = s.startTime + s.bars * s.barDur;
    } else {
      pump(s);
      s.timer = setInterval(function () { pump(s); }, TICK_MS);
    }

    return {
      stop: function () { if (current === s) A.stop(); },
      setVersion: A.setVersion,
      setChords: function (arr) { s.chordsA = arr.slice(); },
      setDrums: function (d) { s.drums = normalizeDrums(d); },
      position: A.position,
      version: function () { return s.version; }
    };
  };

  A.stop = function () {
    const s = current;
    if (!s) return;
    current = null;
    s.playing = false;
    clearInterval(s.timer);
    const t = ctx.currentTime;
    [s.out, s.busA, s.busB, s.busMel, s.busDrum].forEach(function (b) {
      if (!b) return;
      try {
        b.gain.cancelScheduledValues(t);
        b.gain.setTargetAtTime(0, t, 0.02);
      } catch (e) { /* 已被断开 */ }
    });
    setTimeout(function () {
      [s.out, s.busA, s.busB, s.busMel, s.busDrum].forEach(function (b) {
        try { b.disconnect(); } catch (e) { /* noop */ }
      });
    }, 700);
  };

  A.isPlaying = function () { return !!current; };

  /** 在当前小节之后的第一个小节线上切换 A/B */
  A.setVersion = function (v) {
    const s = current;
    if (!s || !s.chordsB) return false;
    const tb = boundaryAfter(s, ctx.currentTime);
    s.version = v;
    s.busA.gain.setTargetAtTime(v === 'a' ? 1 : 0, tb, 0.008);
    s.busB.gain.setTargetAtTime(v === 'b' ? 1 : 0, tb, 0.008);
    return true;
  };

  /** 播放头位置：{bar, beat, barFloat} */
  A.position = function () {
    const s = current;
    if (!s) return null;
    const el = Math.max(0, ctx.currentTime - s.startTime);
    const barFloat = el / s.barDur;
    return {
      bar: Math.floor(barFloat) % s.bars,
      beat: (barFloat % 1) * 4,
      barFloat: barFloat,
      bars: s.bars
    };
  };

  /** 单次试听（不循环，播完自己停） */
  A.once = function (chords, opts) {
    const o = opts || {};
    const bars = chords.length;
    const h = A.play(Object.assign({}, o, { chordsA: chords, bars: bars }));
    const total = ((60 / (o.bpm || 96)) * 4) * bars * 1000 + 900;
    setTimeout(function () { h.stop(); }, total);
    return h;
  };

  root.MA = A;
})(typeof window !== 'undefined' ? window : globalThis);
