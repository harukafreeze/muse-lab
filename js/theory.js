/*!
 * theory.js — 乐理内核
 *
 * 只做纯函数：音名、和弦、级数、调号、移调。
 * 不碰 DOM、不碰 AudioContext，所以能在 node 里直接 require 做自检。
 *
 * 这一层是整站「可信」的来源：听辨题的正确答案一律由这里算出来，
 * 不许在课程数据里手写标注。改这里要跑 tools/self-test.js。
 */
(function (root) {
  'use strict';

  const T = {};

  /* ============================================================
   * 音名
   * ============================================================ */

  const PC_OF = {
    'C': 0, 'B#': 0,
    'C#': 1, 'Db': 1,
    'D': 2,
    'D#': 3, 'Eb': 3,
    'E': 4, 'Fb': 4,
    'F': 5, 'E#': 5,
    'F#': 6, 'Gb': 6,
    'G': 7,
    'G#': 8, 'Ab': 8,
    'A': 9,
    'A#': 10, 'Bb': 10,
    'B': 11, 'Cb': 11
  };

  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  // 大调调号：以音高类为索引的升号数（负数 = 降号）
  const MAJOR_SF = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];

  T.PC_OF = PC_OF;

  /** 'F#' / 'Bb' / 'D4' → 0..11 */
  T.pc = function (name) {
    const s = String(name).trim();
    if (!s) throw new Error('空音名');
    const m = /^([A-Ga-g][#b]?)/.exec(s);
    if (!m) throw new Error('看不懂的音名：' + name);
    const key = m[1][0].toUpperCase() + m[1].slice(1);
    if (!(key in PC_OF)) throw new Error('看不懂的音名：' + name);
    return PC_OF[key];
  };

  /** 55 → 'G3'（十二平均律，默认用升号写） */
  T.midiName = function (midi, preferFlat) {
    const n = Math.round(midi);
    return (preferFlat ? FLAT : SHARP)[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  };

  /** 69 → 440 */
  T.freq = function (midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  };

  /** 9 → 'A'（不带八度） */
  T.pcName = function (pc) {
    return SHARP[((Math.round(pc) % 12) + 12) % 12];
  };

  /* ============================================================
   * 和弦
   * ============================================================ */

  const INTERVALS = {
    maj: [0, 4, 7],
    min: [0, 3, 7],
    dim: [0, 3, 6],
    aug: [0, 4, 8],
    dom7: [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    min7: [0, 3, 7, 10],
    sus4: [0, 5, 7],
    sus2: [0, 2, 7],
    maj6: [0, 4, 7, 9],
    min6: [0, 3, 7, 9]
  };

  const SUFFIX = {
    '': 'maj', 'M': 'maj', 'maj': 'maj',
    'm': 'min', 'min': 'min', '-': 'min',
    'dim': 'dim', 'o': 'dim', '°': 'dim',
    'aug': 'aug', '+': 'aug',
    '7': 'dom7', 'dom7': 'dom7',
    'maj7': 'maj7', 'M7': 'maj7', 'Δ7': 'maj7',
    'm7': 'min7', 'min7': 'min7', '-7': 'min7',
    'sus4': 'sus4', 'sus': 'sus4',
    'sus2': 'sus2',
    '6': 'maj6', 'm6': 'min6'
  };

  const DISPLAY = {
    maj: '', min: 'm', dim: 'dim', aug: 'aug',
    dom7: '7', maj7: 'maj7', min7: 'm7',
    sus4: 'sus4', sus2: 'sus2', maj6: '6', min6: 'm6'
  };

  /**
   * 'F#m7' → { name, pc, degree?, quality, intervals }
   * 不认识的后缀会抛错，宁可炸也不要静默当成大三和弦。
   */
  T.parseChord = function (label) {
    const s = String(label).trim();
    const m = /^([A-Ga-g][#b]?)(.*)$/.exec(s);
    if (!m) throw new Error('看不懂的和弦：' + label);
    const rootName = m[1][0].toUpperCase() + m[1].slice(1);
    if (!(rootName in PC_OF)) throw new Error('看不懂的和弦根音：' + label);
    const suffix = m[2].trim();
    if (!(suffix in SUFFIX)) throw new Error('看不懂的和弦后缀：' + label + '（后缀 "' + suffix + '"）');
    const quality = SUFFIX[suffix];
    return {
      name: rootName + DISPLAY[quality],
      pc: PC_OF[rootName],
      quality: quality,
      intervals: INTERVALS[quality].slice()
    };
  };

  /** 和弦音，根音放在 C3..B3 这一带（48..59），保证进行里的音区稳定 */
  T.chordNotes = function (chord, rootMidi) {
    const c = typeof chord === 'string' ? T.parseChord(chord) : chord;
    const base = rootMidi === undefined ? 48 + c.pc : rootMidi;
    return c.intervals.map(function (i) { return base + i; });
  };

  /** 给播放用：三和弦 + 低音，低音低一个八度 */
  T.voicing = function (chord) {
    const c = typeof chord === 'string' ? T.parseChord(chord) : chord;
    const notes = T.chordNotes(c);
    return { root: notes[0], notes: notes, bass: notes[0] - 12 };
  };

  T.chordLabel = function (chord) {
    return typeof chord === 'string' ? chord : chord.name;
  };

  /* ============================================================
   * 调与级数
   * ============================================================ */

  const MODES = {
    major: {
      steps: [0, 2, 4, 5, 7, 9, 11],
      qualities: ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim']
    },
    // 自然小调：3、6、7 级降半音。所以 III、VI、VII 是大三和弦。
    minor: {
      steps: [0, 2, 3, 5, 7, 8, 10],
      qualities: ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj']
    }
  };

  function modeOf(mode) {
    return MODES[mode] || MODES.major;
  }

  T.MODES = MODES;

  /** D 大调 → [2,4,6,7,9,11,1]；A 小调 → [9,11,0,2,4,5,7] */
  T.scalePcs = function (keyPc, mode) {
    return modeOf(mode).steps.map(function (s) { return (keyPc + s) % 12; });
  };

  /** 第 5 级、D 大调 → 'A'；第 3 级、A 小调 → 'C' */
  T.diatonicChord = function (keyPc, degree, mode) {
    const m = modeOf(mode);
    const d = ((degree - 1) % 7 + 7) % 7;
    const pc = (keyPc + m.steps[d]) % 12;
    // 降号调里用降号写：C 小调的第 3 级是 Eb，不是 D#
    const names = T.keySign(keyPc, mode) < 0 ? FLAT : SHARP;
    const name = names[pc] + DISPLAY[m.qualities[d]];
    return T.parseChord(name);
  };

  /** 和弦名里的根音写法：'Ebmaj7' → 'Eb' */
  T.rootName = function (label) {
    const m = /^([A-Ga-g][#b]?)/.exec(String(label));
    return m ? m[1][0].toUpperCase() + m[1].slice(1) : '?';
  };

  /** 'A' 在 D 大调里是第几级；不属于调内返回 0 */
  T.degreeOf = function (chord, keyPc, mode) {
    const c = typeof chord === 'string' ? T.parseChord(chord) : chord;
    const rel = ((c.pc - keyPc) % 12 + 12) % 12;
    const idx = modeOf(mode).steps.indexOf(rel);
    return idx < 0 ? 0 : idx + 1;
  };

  /**
   * 罗马数字：大小写跟着和弦性质走，减三和弦带 °。
   * 这样 A 小调里出现 E 大三和弦（和声小调的 V）会显示成 V，
   * 而不是硬按调式写成 v——耳朵听到的才是真的。
   */
  T.romanOf = function (chord, keyPc, mode) {
    const c = typeof chord === 'string' ? T.parseChord(chord) : chord;
    const d = T.degreeOf(c, keyPc, mode);
    if (!d) return '?';
    const base = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][d - 1];
    const q = c.quality;
    const minorish = q === 'min' || q === 'min7' || q === 'min6' || q === 'dim';
    let out = minorish ? base.toLowerCase() : base;
    if (q === 'dim') out += '°';
    else if (q === 'dom7') out += '7';
    else if (q === 'maj7') out += 'maj7';
    else if (q === 'min7') out += '7';
    else if (q === 'sus4' || q === 'sus2') out += q;
    return out;
  };

  /** ['A','D'] + D 大调 → [5,1] */
  T.degreesOf = function (chords, keyPc, mode) {
    return chords.map(function (c) { return c ? T.degreeOf(c, keyPc, mode) : 0; });
  };

  /** 调号：D 大调 → 2（升号数，负数为降号） */
  T.keySign = function (keyPc, mode) {
    const pc = ((keyPc % 12) + 12) % 12;
    // 小调跟它的关系大调共用调号：A 小调 = C 大调 = 0
    return MAJOR_SF[mode === 'minor' ? (pc + 3) % 12 : pc];
  };

  /** 调名，按调号方向选升/降写法 */
  T.keyName = function (keyPc, mode) {
    const sf = T.keySign(keyPc, mode);
    const names = sf < 0 ? FLAT : SHARP;
    return names[((keyPc % 12) + 12) % 12] + (mode === 'minor' ? ' minor' : ' major');
  };

  /** 整段移调：from 调到 to 调 */
  T.transpose = function (chord, semitones) {
    const c = typeof chord === 'string' ? T.parseChord(chord) : chord;
    const pc = ((c.pc + semitones) % 12 + 12) % 12;
    return SHARP[pc] + DISPLAY[c.quality];
  };

  /* ============================================================
   * 和声分析 —— 听辨题的答案从这里来
   * ============================================================ */

  /** 最后响的那个和弦（跳过空小节） */
  T.lastChord = function (chords) {
    for (let i = chords.length - 1; i >= 0; i--) {
      if (chords[i]) return chords[i];
    }
    return null;
  };

  /**
   * 一段进行的「结束感」判定：最后一个小节是不是回到了第 1 级。
   * 这是第 4 课的判据，自检脚本会独立重算一次来对账。
   */
  T.endsOnTonic = function (chords, keyPc, mode) {
    for (let i = chords.length - 1; i >= 0; i--) {
      if (chords[i]) return T.degreeOf(chords[i], keyPc, mode) === 1;
    }
    return false;
  };

  /** 某级在整段里出现在哪些小节（0 基） */
  T.barsWithDegree = function (chords, keyPc, degree, mode) {
    const out = [];
    chords.forEach(function (c, i) {
      if (c && T.degreeOf(c, keyPc, mode) === degree) out.push(i);
    });
    return out;
  };

  /* ============================================================
   * 伴奏织体（给 midi 导出和钢琴卷帘共用）
   * ============================================================ */

  /**
   * 把和弦序列展开成音符表。
   * opts: { bars, beatsPerBar, octave, bass, hold }
   * 返回 [{ bar, beat, dur, midi }]
   */
  T.realize = function (chords, opts) {
    const o = opts || {};
    const beatsPerBar = o.beatsPerBar || 4;
    const out = [];
    chords.forEach(function (label, bar) {
      if (!label) return;
      const v = T.voicing(label);
      const root = v.root + (o.octave || 0) * 12;
      const notes = v.notes.map(function (n) { return n + (o.octave || 0) * 12; });
      if (o.arp) {
        // 分解：每拍一个和弦音，循环
        for (let b = 0; b < beatsPerBar; b++) {
          out.push({ bar: bar, beat: b, dur: 1, midi: notes[b % notes.length] });
        }
      } else {
        notes.forEach(function (n) {
          out.push({ bar: bar, beat: 0, dur: o.hold || beatsPerBar, midi: n });
        });
      }
      if (o.bass) {
        out.push({ bar: bar, beat: 0, dur: o.hold || beatsPerBar, midi: root - 12 });
      }
    });
    return out;
  };

  root.MT = T;
})(typeof window !== 'undefined' ? window : globalThis);
