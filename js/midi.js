/*!
 * midi.js — 标准 MIDI 文件（SMF Type 1）编码器
 *
 * 手写，无依赖，约 150 行。为什么不引第三方：这个站没有构建步骤，
 * 而导出的文件是学习者要拖进 Studio One 的东西，多一个依赖就多一个坏掉的理由。
 *
 * 导出的约定（重要）：
 *   - Type 1 多轨，第 1 轨是走带信息（速度 / 拍号 / 调号）
 *   - Chords / Bass 两轨写实际音符
 *   - Vocal 轨一定存在、名字叫 Vocal、长度为整首——拖进去就能在上面建 VOCALOID6 轨道
 */
(function (root) {
  'use strict';

  const M = {};
  const DIV = 480;              // 每四分音符的 tick 数
  const BAR = DIV * 4;          // 4/4 一小节

  M.DIV = DIV;
  M.BAR = BAR;

  /* ---------------- 字节工具 ---------------- */

  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') {
      return Array.prototype.slice.call(new TextEncoder().encode(s));
    }
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  /** 可变长度数量：MIDI 的 delta-time 编码 */
  function vlq(n) {
    let v = Math.max(0, Math.round(n));
    const out = [v & 0x7F];
    v = Math.floor(v / 128);
    while (v > 0) {
      out.unshift(0x80 | (v & 0x7F));
      v = Math.floor(v / 128);
    }
    return out;
  }

  function u32(n) {
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  }

  function metaText(type, s) {
    const b = utf8(s);
    return [0xFF, type, b.length].concat(b);
  }

  function chunk(id, body) {
    return id.concat(u32(body.length), body);
  }

  /* ---------------- 轨道 ---------------- */

  // 同一 tick 上，note-off 必须排在 note-on 前面，否则后一个音会被前一个的关掉
  const ORDER = { off: 0, on: 1, meta: 2 };

  function buildTrack(events, endTick) {
    const evs = events.slice().sort(function (a, b) {
      if (a.tick !== b.tick) return a.tick - b.tick;
      return (ORDER[a.kind] === undefined ? 2 : ORDER[a.kind]) - (ORDER[b.kind] === undefined ? 2 : ORDER[b.kind]);
    });
    const body = [];
    let last = 0;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      body.push.apply(body, vlq(e.tick - last));
      body.push.apply(body, e.data);
      last = e.tick;
    }
    body.push.apply(body, vlq(Math.max(0, (endTick || last) - last)));
    body.push(0xFF, 0x2F, 0x00);
    return chunk([0x4D, 0x54, 0x72, 0x6B], body);   // 'MTrk'
  }

  /* ---------------- 对外 ---------------- */

  /**
   * song = {
   *   bpm, timeSig: [4,4], keySharps, keyMinor,
   *   bars,                       // 总长度（小节），Vocal 轨按它留空
   *   tracks: [{ name, channel, program, notes: [{tick, dur, midi, vel}] }]
   * }
   */
  M.encode = function (song) {
    const bpm = song.bpm || 96;
    const bars = song.bars || 4;
    const endTick = bars * BAR;
    const ts = song.timeSig || [4, 4];
    const keySharps = song.keySharps || 0;

    /* 第 1 轨：走带 */
    const cond = [
      { tick: 0, kind: 'meta', data: metaText(0x03, song.name || 'muse') },
      { tick: 0, kind: 'meta', data: [0xFF, 0x51, 0x03].concat(tempoBytes(bpm)) },
      { tick: 0, kind: 'meta', data: [0xFF, 0x58, 0x04, ts[0], Math.round(Math.log2(ts[1])), 24, 8] },
      { tick: 0, kind: 'meta', data: [0xFF, 0x59, 0x02, (keySharps + 256) & 255, song.keyMinor ? 1 : 0] }
    ];

    const tracks = [buildTrack(cond, 0)];

    (song.tracks || []).forEach(function (t) {
      const ch = t.channel || 0;
      const evs = [{ tick: 0, kind: 'meta', data: metaText(0x03, t.name || 'Track') }];
      if (t.program !== undefined) evs.push({ tick: 0, kind: 'meta', data: [0xC0 | ch, t.program & 127] });
      (t.notes || []).forEach(function (n) {
        const t0 = Math.max(0, Math.round(n.tick));
        const d = Math.max(1, Math.round(n.dur || DIV));
        evs.push({ tick: t0, kind: 'on', data: [0x90 | ch, n.midi & 127, n.vel === undefined ? 96 : n.vel & 127] });
        evs.push({ tick: t0 + d, kind: 'off', data: [0x80 | ch, n.midi & 127, 0] });
      });
      tracks.push(buildTrack(evs, Math.max(endTick, 0)));
    });

    const header = chunk([0x4D, 0x54, 0x68, 0x64], [0, 1, 0, tracks.length, (DIV >> 8) & 255, DIV & 255]);
    let out = header;
    tracks.forEach(function (t) { out = out.concat(t); });
    return new Uint8Array(out);
  };

  function tempoBytes(bpm) {
    const us = Math.round(60000000 / bpm);
    return [(us >> 16) & 255, (us >> 8) & 255, us & 255];
  }

  /** 下载。文件名里的中文会被浏览器保留，Studio One 也认得。 */
  M.download = function (bytes, filename) {
    const blob = new Blob([bytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  };

  /**
   * 把一段和弦进行展开成三轨：Chords / Bass / Vocal（空）。
   * 这是第 4 课导出走的那条路。
   */
  M.fromProgression = function (opts) {
    const chords = opts.chords;
    const keyPc = opts.keyPc;
    const bpm = opts.bpm || 96;
    const bars = chords.length;

    const chordNotes = [];
    const bassNotes = [];
    const melNotes = [];
    const drumNotes = [];

    chords.forEach(function (label, bar) {
      if (!label) return;
      const v = MT.voicing(label);
      v.notes.forEach(function (n) {
        chordNotes.push({ tick: bar * BAR, dur: BAR - 8, midi: n, vel: 84 });
      });
      bassNotes.push({ tick: bar * BAR, dur: BAR - 20, midi: v.bass, vel: 92 });
    });

    // 鼓：一小节八分格的图案，按 map 决定每小节用哪套。音高用通用 MIDI 打击乐。
    if (opts.drums) {
      const pats = opts.drums.patterns || [opts.drums];
      const map = (opts.drums.map && opts.drums.map.length) ? opts.drums.map : [0];
      const eighth = DIV / 2;
      for (let bar = 0; bar < bars; bar++) {
        const p = pats[map[bar % map.length] % pats.length];
        const kick = p.kick || [];
        const snare = p.snare || [];
        const hats = p.hats || [];
        for (let i = 0; i < 8; i++) {
          const tick = bar * BAR + i * eighth;
          if (kick[i]) drumNotes.push({ tick: tick, dur: eighth / 3, midi: 36, vel: 106 });
          if (snare[i]) drumNotes.push({ tick: tick, dur: eighth / 3, midi: 38, vel: 100 });
          if (hats[i]) drumNotes.push({ tick: tick, dur: eighth / 3, midi: 42, vel: 78 });
        }
      }
    }

    // 旋律进 Vocal 轨：拖进 DAW 就是一条已经有音高和节奏的声乐轨，
    // 只差歌词。没有旋律时这条轨留空但保留长度。
    (opts.melody || []).forEach(function (n) {
      melNotes.push({
        tick: (n.bar * 4 + n.beat) * DIV,
        dur: Math.max(1, Math.round((n.dur || 1) * DIV)),
        midi: n.midi,
        vel: 98
      });
    });

    const tracks = [
      { name: 'Chords', channel: 0, program: 0, notes: chordNotes },
      { name: 'Bass', channel: 1, program: 33, notes: bassNotes }
    ];

    if (drumNotes.length) {
      // 第 10 通道（channel 9）是通用 MIDI 的打击乐通道
      tracks.push({ name: 'Drums', channel: 9, program: 0, notes: drumNotes });
    }

    tracks.push({ name: 'Vocal', channel: 2, program: 0, notes: melNotes });

    return M.encode({
      name: opts.name || 'muse lab',
      bpm: bpm,
      bars: bars,
      keySharps: MT.keySign(keyPc, opts.mode),
      keyMinor: opts.mode === 'minor',
      tracks: tracks
    });
  };

  root.MM = M;
})(typeof window !== 'undefined' ? window : globalThis);
