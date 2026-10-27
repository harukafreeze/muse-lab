/*!
 * practice.js — 自由练习
 *
 * 两件事，一个入口：
 *   键盘  —— 能弹的琴。路线图里写「能在琴上弹出 1 和 5」，但网站一直只有格子。
 *   磨耳朵 —— 级数 / 音程 / 和弦性质的随机出题，练相对音感。
 *
 * 和课程页不同的地方：这里没有「过关」，只有统计。
 * 题目每次现生成，答案也是现算的，所以可以一直练下去。
 */
(function (root) {
  'use strict';

  const MT = root.MT;
  const MA = root.MA;
  const MP = root.MP;
  const doc = root.document;

  const P = {};

  const $ = function (s, el) { return (el || doc).querySelector(s); };
  const $$ = function (s, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(s)); };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ============================================================
   * 共用：调性选择
   * ============================================================ */

  const KEYS = [[2, 'D'], [0, 'C'], [4, 'E'], [7, 'G'], [9, 'A']];

  const S = {
    tab: 'keys',            // keys | ear
    keyPc: 2,
    mode: 'major',
    label: 'name',          // name | degree
    ear: null,
    cleanup: null
  };

  P.leave = function () {
    if (S.cleanup) { S.cleanup(); S.cleanup = null; }
    humStop();
  };

  function keyRow(selected) {
    return '<div class="seg wrap" id="keyrow">' +
      KEYS.map(function (k) {
        return '<button data-key="' + k[0] + '" class="' + (selected === k[0] ? 'on' : '') + '">' +
          k[1] + ' ' + (S.mode === 'minor' ? '小调' : '大调') + '</button>';
      }).join('') +
      '</div>';
  }

  /* ============================================================
   * 键盘
   * ============================================================ */

  const START = 60;          // C4
  const OCTAVES = 2;
  const WHITE_OFF = [0, 2, 4, 5, 7, 9, 11];
  const BLACK_OFF = [1, 3, 6, 8, 10];

  const KEYMAP = {
    a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7,
    y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15
  };

  function buildKeyboard(id, extraClass) {
    const whites = [];
    const blacks = [];
    for (let o = 0; o < OCTAVES; o++) {
      WHITE_OFF.forEach(function (w) { whites.push(START + o * 12 + w); });
      BLACK_OFF.forEach(function (b) { blacks.push(START + o * 12 + b); });
    }
    whites.push(START + OCTAVES * 12);   // 收尾那个 C

    const isBlack = function (m) { return BLACK_OFF.indexOf(((m % 12) + 12) % 12) >= 0; };

    const whiteW = 100 / whites.length;
    const blackW = whiteW * 0.56;

    const whiteHtml = whites.map(function (m) {
      return '<button class="wkey" data-midi="' + m + '">' +
        '<span class="nm" data-name="' + MT.midiName(m) + '"></span>' +
        '<span class="dg"></span></button>';
    }).join('');

    const blackHtml = blacks.map(function (m) {
      let before = 0;
      for (let i = START; i < m; i++) if (!isBlack(i)) before++;
      const left = before * whiteW - blackW / 2;
      return '<button class="bkey" data-midi="' + m + '" style="left:' + left.toFixed(3) + '%;width:' +
        blackW.toFixed(3) + '%">' +
        '<span class="nm" data-name="' + MT.midiName(m) + '"></span>' +
        '<span class="dg"></span></button>';
    }).join('');

    return '<div class="kb ' + (extraClass || '') + '" id="' + id + '">' + whiteHtml + blackHtml + '</div>';
  }

  function paintLabels() {
    $$('#kb button').forEach(function (b) {
      const m = Number(b.dataset.midi);
      const nm = $('.nm', b);
      const dg = $('.dg', b);
      if (S.label === 'name') {
        nm.textContent = MT.midiName(m);
        dg.textContent = '';
      } else {
        nm.textContent = '';
        const d = MT.degreeOf(MT.midiName(m).replace(/-?\d+$/, ''), S.keyPc, S.mode);
        dg.textContent = d ? String(d) : '·';
      }
    });
  }

  function flash(b) {
    b.classList.add('on');
    root.setTimeout(function () { b.classList.remove('on'); }, 140);
  }

  function playKey(m) {
    MA.blip(m, 0, 1.4, 0.24);
  }

  P.renderKeys = function (app) {
    const chords = [];
    for (let d = 1; d <= 7; d++) chords.push(MT.diatonicChord(S.keyPc, d, S.mode).name);

    app.innerHTML =
      '<section class="practice">' +
        '<div class="lesson-top">' +
          '<div class="crumbs"><a href="#/">目录</a><span class="sep">/</span><span>自由练习</span></div>' +
        '</div>' +
        '<div class="lesson-title">' +
          '<h1>键盘</h1>' +
          '<span class="sub">按下去就响，没有对错</span>' +
        '</div>' +
        tabs('keys') +
        '<p class="field-label">调性</p>' +
        keyRow(S.keyPc) +
        '<p class="field-label">键上显示</p>' +
        '<div class="seg" id="plabel">' +
          '<button data-label="name" class="' + (S.label === 'name' ? 'on' : '') + '">音名</button>' +
          '<button data-label="degree" class="' + (S.label === 'degree' ? 'on' : '') + '">级数</button>' +
        '</div>' +
        '<div class="roll-wrap kb-wrap">' + buildKeyboard('kb') + '</div>' +
        '<p class="hint">电脑键盘：<b>A W S E D F T G Y H U J K</b>。' +
          '按住的键越多，响的音越多——可以自己按出和弦。</p>' +
        '<p class="field-label">这个调的七个和弦</p>' +
        '<div class="pad" id="pchords">' +
          chords.map(function (c) {
            return '<button class="pad-chip" data-chord="' + esc(c) + '">' +
              '<b>' + esc(c) + '</b><span>' + esc(MT.romanOf(c, S.keyPc, S.mode)) + '</span></button>';
          }).join('') +
        '</div>' +
        '<p class="hint">先弹 1 和 5——第 4 课就是这两个和弦。听哪个是「推」，哪个是「落」。</p>' +
      '</section>';

    paintLabels();

    $('#keyrow').onclick = function (e) {
      const b = e.target.closest('button[data-key]');
      if (!b) return;
      S.keyPc = Number(b.dataset.key);
      P.renderKeys(app);
    };

    $('#plabel').onclick = function (e) {
      const b = e.target.closest('button[data-label]');
      if (!b) return;
      S.label = b.dataset.label;
      $$('#plabel button').forEach(function (x) { x.classList.toggle('on', x === b); });
      paintLabels();
    };

    $('#etab').onclick = function () { P.renderEar(app); };
    $('#htab').onclick = function () { P.renderHum(app); };

    $('#kb').onpointerdown = function (e) {
      const b = e.target.closest('button[data-midi]');
      if (!b) return;
      e.preventDefault();
      flash(b);
      playKey(Number(b.dataset.midi));
    };

    $('#pchords').onclick = function (e) {
      const b = e.target.closest('button[data-chord]');
      if (!b) return;
      const v = MT.voicing(b.dataset.chord);
      MA.chordBlip(v.notes.concat([v.bass]), 0, 1.6, 0.5);
      flash(b);
    };

    // 电脑键盘
    const onKey = function (ev) {
      if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const off = KEYMAP[ev.key.toLowerCase()];
      if (off === undefined) return;
      ev.preventDefault();
      const m = START + off;
      const b = $('#kb button[data-midi="' + m + '"]');
      if (b) flash(b);
      playKey(m);
    };
    doc.addEventListener('keydown', onKey);
    S.cleanup = function () { doc.removeEventListener('keydown', onKey); };
  };

  /* ============================================================
   * 磨耳朵
   * ============================================================ */

  const INTERVAL_NAMES = {
    1: '小二度', 2: '大二度', 3: '小三度', 4: '大三度',
    5: '纯四度', 6: '增四度', 7: '纯五度', 8: '小六度',
    9: '大六度', 10: '小七度', 11: '大七度', 12: '八度'
  };

  const EAR_MODES = [
    { id: 'degree', name: '级数', desc: '先给你主和弦，再听一个音，说它是第几级' },
    { id: 'interval', name: '音程', desc: '两个音差多远' },
    { id: 'chord', name: '和弦', desc: '大三、小三，还是减三' },
    { id: 'play', name: '按和弦', desc: '给你一个和弦名，在键盘上把它按出来' }
  ];

  const POOL = {
    1: [3, 4, 5, 7, 12],
    2: [2, 3, 4, 5, 7, 9, 12],
    3: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  };

  const CHORD_POOL = {
    1: ['maj', 'min'],
    2: ['maj', 'min', 'dim'],
    3: ['maj', 'min', 'dim', 'aug']
  };

  const CHORD_NAMES = { maj: '大三和弦', min: '小三和弦', dim: '减三和弦', aug: '增三和弦' };

  function rand(n) { return Math.floor(Math.random() * n); }
  function pick(arr) { return arr[rand(arr.length)]; }

  function loadStats() {
    return MP.data.ear || {};
  }

  function saveStats(d) {
    MP.data.ear = d;
    MP.save();
  }

  function freshEar() {
    return {
      mode: 'degree',
      level: 1,
      streak: 0,
      correct: 0,
      total: 0,
      q: null,
      picked: null,
      held: {},
      token: 0
    };
  }

  /** 记一次答题：统计、连对、最高连对、升级 */
  function record(ok) {
    const E = S.ear;
    E.total += 1;
    if (!ok) { E.streak = 0; return; }
    E.correct += 1;
    E.streak += 1;
    const best = loadStats();
    if (E.streak > (best[E.mode] || 0)) { best[E.mode] = E.streak; saveStats(best); }
    if (E.streak % 5 === 0 && E.level < 3) E.level += 1;
  }

  function makeQuestion(mode, level) {
    if (mode === 'degree') {
      const scale = MT.scalePcs(S.keyPc, S.mode);
      const step = rand(7);
      const tonicMidi = 60 + ((S.keyPc - 0) % 12 + 12) % 12;   // D → 62
      return {
        kind: 'degree',
        answer: String(step + 1),
        options: ['1', '2', '3', '4', '5', '6', '7'],
        target: tonicMidi + scale[step],
        // 主和弦压低一个八度，免得盖住要听的那个音
        tonic: MT.chordNotes(MT.diatonicChord(S.keyPc, 1, S.mode), tonicMidi - 12)
      };
    }

    if (mode === 'interval') {
      const semis = pick(POOL[level] || POOL[1]);
      const root = 57 + rand(8);             // A3..E4
      return {
        kind: 'interval',
        answer: INTERVAL_NAMES[semis],
        options: (POOL[level] || POOL[1]).map(function (s) { return INTERVAL_NAMES[s]; }),
        root: root,
        semis: semis
      };
    }

    if (mode === 'play') {
      const pool = level === 1 ? [1, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7];
      const deg = pick(pool);
      const chord = MT.diatonicChord(S.keyPc, deg, S.mode);
      return {
        kind: 'play',
        answer: chord.name,
        pcs: chord.intervals.map(function (i) { return (chord.pc + i) % 12; }),
        target: chord.name
      };
    }

    const quality = pick(CHORD_POOL[level] || CHORD_POOL[1]);
    const root = 55 + rand(10);
    const suffix = { maj: '', min: 'm', dim: 'dim', aug: 'aug' }[quality];
    return {
      kind: 'chord',
      answer: CHORD_NAMES[quality],
      options: (CHORD_POOL[level] || CHORD_POOL[1]).map(function (q) { return CHORD_NAMES[q]; }),
      notes: MT.parseChord('C' + suffix).intervals.map(function (i) { return root + i; })
    };
  }

  /** 音高类 → 一组可以由低到高弹出来的音 */
  function pcsToNotes(pcs) {
    return pcs.map(function (p) { return 60 + ((p % 12) + 12) % 12; }).sort(function (a, b) { return a - b; });
  }

  function playQuestion(q) {
    if (!q) return;
    if (q.kind === 'degree') {
      MA.chordBlip(q.tonic, 0, 0.9, 0.5);
      MA.blip(q.target, 0.95, 1.2, 0.26);
    } else if (q.kind === 'interval') {
      MA.blip(q.root, 0, 0.8, 0.24);
      MA.blip(q.root + q.semis, 0.75, 0.9, 0.24);
    } else if (q.kind === 'play') {
      // 先听一遍，再去键盘上找——「听到的」和「按出来的」对上，才算真的会
      MA.chordBlip(pcsToNotes(q.pcs), 0, 1.4, 0.55);
    } else {
      MA.chordBlip(q.notes, 0, 1.4, 0.55);
    }
  }

  function playAnswer(q) {
    if (q.kind === 'play') {
      MA.chordBlip(pcsToNotes(q.pcs), 0.15, 1.4, 0.55);
    } else if (q.kind === 'interval') {
      MA.blip(q.root, 0, 0.8, 0.24);
      MA.blip(q.root + q.semis, 0.75, 0.9, 0.24);
    } else if (q.kind === 'degree') {
      MA.chordBlip(q.tonic, 0, 0.9, 0.5);
      MA.blip(q.target, 0.95, 1.2, 0.26);
    } else {
      MA.chordBlip(q.notes, 0, 1.4, 0.55);
    }
  }

  P.renderEar = function (app) {
    if (!S.ear) S.ear = freshEar();
    const E = S.ear;
    const best = loadStats();

    const modeBtns = EAR_MODES.map(function (m) {
      return '<button data-mode="' + m.id + '" class="' + (E.mode === m.id ? 'on' : '') + '">' +
        m.name + '</button>';
    }).join('');

    const desc = EAR_MODES.filter(function (m) { return m.id === E.mode; })[0].desc;
    const acc = E.total ? Math.round((E.correct / E.total) * 100) : 0;

    let body;
    if (!E.q) {
      body =
        '<div class="ear-start">' +
          '<p>' + esc(desc) + '</p>' +
          '<button class="btn primary" id="start">开始</button>' +
        '</div>';
    } else if (E.mode === 'play') {
      const have = Object.keys(E.held).filter(function (k) { return E.held[k]; }).map(Number);
      const need = E.q.pcs;
      const missing = need.filter(function (p) { return have.indexOf(p) < 0; });
      const extra = have.filter(function (p) { return need.indexOf(p) < 0; });

      let fb = '<div class="feedback" id="fb" hidden></div>';
      if (E.picked !== null) {
        const ok = E.picked === E.q.answer;
        fb = '<div class="feedback ' + (ok ? 'ok' : 'no') + '" id="fb">' +
          (ok
            ? '对，' + esc(E.q.answer) + ' 就是这三个音。'
            : '还差：' + (missing.length ? missing.map(MT.pcName).join('、') : '没有') +
              '；多了：' + (extra.length ? extra.map(MT.pcName).join('、') : '没有') + '。') +
          '</div>';
      }

      body =
        '<p class="question">在键盘上按出 <b class="chord-target">' + esc(E.q.target) + '</b> ' +
          '<span class="caption">点一下选中，再点一下取消</span></p>' +
        '<div class="roll-wrap kb-wrap">' + buildKeyboard('ekb', 'kb-small') + '</div>' +
        '<div class="demo">' +
          '<button class="btn primary" id="checkkeys"' + (E.picked === null ? '' : ' disabled') + '>检查</button>' +
          '<button class="btn ghost" id="clearkeys"' + (E.picked === null ? '' : ' disabled') + '>清空</button>' +
        '</div>' +
        fb +
        (E.picked !== null
          ? '<div class="demo"><button class="btn primary" id="next">下一题</button></div>'
          : '');
    } else {
      const opts = E.q.options.map(function (o) {
        const cls = E.picked === null ? '' :
          (o === E.q.answer ? ' ok' : (o === E.picked ? ' no' : ''));
        return '<button class="opt' + cls + '" data-opt="' + esc(o) + '">' + esc(o) + '</button>';
      }).join('');

      const fb = E.picked === null
        ? '<div class="feedback" id="fb" hidden></div>'
        : '<div class="feedback ' + (E.picked === E.q.answer ? 'ok' : 'no') + '" id="fb">' +
            (E.picked === E.q.answer
              ? '对，就是' + esc(E.q.answer) + '。'
              : '不对。应该是 <b>' + esc(E.q.answer) + '</b>——再听一遍。') +
          '</div>';

      const prompt = E.mode === 'degree'
        ? '先听主和弦，再听那个音。它是第几级？（' +
          MT.pcName(S.keyPc) + (S.mode === 'minor' ? ' 小调' : ' 大调') + '）'
        : E.mode === 'interval' ? '这两个音差多少？' : '这是一个什么和弦？';

      const grid = E.q.options.length === 7 ? 'deg7' : (E.q.options.length > 4 ? 'grid4' : '');

      body =
        '<div class="ear-play">' +
          '<button class="btn play" id="replay">▶ 再放一次</button>' +
          '<span class="caption">答完可以再听</span>' +
        '</div>' +
        '<p class="question">' + esc(prompt) + '</p>' +
        '<div class="options ' + grid + '" id="eopts">' + opts + '</div>' +
        fb +
        (E.picked !== null
          ? '<div class="demo"><button class="btn primary" id="next">下一题</button></div>'
          : '');
    }

    app.innerHTML =
      '<section class="practice">' +
        '<div class="lesson-top">' +
          '<div class="crumbs"><a href="#/">目录</a><span class="sep">/</span><span>自由练习</span></div>' +
        '</div>' +
        '<div class="lesson-title">' +
          '<h1>磨耳朵</h1>' +
          '<span class="sub">每次都不一样，一直练下去</span>' +
        '</div>' +
        tabs('ear') +
        '<div class="seg" id="emodes">' + modeBtns + '</div>' +
        '<div class="ear-stats">' +
          '<span>对 <b>' + E.correct + '</b> / ' + E.total + '</span>' +
          '<span>正确率 <b>' + acc + '%</b></span>' +
          '<span>连对 <b>' + E.streak + '</b></span>' +
          '<span>最高连对 <b>' + (best[E.mode] || 0) + '</b></span>' +
          '<span class="lv">等级 ' + E.level + '</span>' +
        '</div>' +
        body +
        '<p class="hint">连对 5 次升一级，选项会变多。' +
          '答错不掉级——这里是练习，不是考试。</p>' +
      '</section>';

    $('#pkeys').onclick = function () {
      S.tab = 'keys';
      P.renderKeys(app);
    };

    $('#etab').onclick = function () {
      S.tab = 'ear';
      P.renderEar(app);
    };

    $('#htab').onclick = function () { P.renderHum(app); };

    $('#emodes').onclick = function (e) {
      const b = e.target.closest('button[data-mode]');
      if (!b) return;
      E.mode = b.dataset.mode;
      E.q = null; E.picked = null; E.streak = 0; E.level = 1;
      P.renderEar(app);
    };

    const startBtn = $('#start');
    if (startBtn) {
      startBtn.onclick = function () {
        E.q = makeQuestion(E.mode, E.level);
        E.picked = null;
        E.held = {};
        P.renderEar(app);
        playQuestion(E.q);
      };
    }

    if ($('#replay')) {
      $('#replay').onclick = function () { playQuestion(E.q); };
    }

    if ($('#eopts')) {
      $('#eopts').onclick = function (e) {
        const b = e.target.closest('button[data-opt]');
        if (!b || E.picked !== null) return;
        E.picked = b.dataset.opt;
        const ok = E.picked === E.q.answer;
        record(ok);
        if (!ok) playAnswer(E.q);
        P.renderEar(app);
      };
    }

    if (E.mode === 'play' && E.q && $('#ekb')) {
      const mark = function () {
        $$('#ekb button').forEach(function (b) {
          b.classList.toggle('sel', !!E.held[Number(b.dataset.midi) % 12]);
        });
      };
      mark();

      $('#ekb').onpointerdown = function (e) {
        const b = e.target.closest('button[data-midi]');
        if (!b || E.picked !== null) return;
        e.preventDefault();
        const m = Number(b.dataset.midi);
        const pc = ((m % 12) + 12) % 12;
        if (E.held[pc]) delete E.held[pc];
        else E.held[pc] = 1;
        mark();
        MA.blip(m, 0, 1.2, 0.24);
      };

      const chk = $('#checkkeys');
      if (chk) {
        chk.onclick = function () {
          const have = Object.keys(E.held).filter(function (k) { return E.held[k]; }).map(Number);
          const need = E.q.pcs;
          const ok = need.length === have.length && need.every(function (p) { return have.indexOf(p) >= 0; });
          E.picked = ok ? E.q.answer : 'wrong';
          record(ok);
          if (!ok) playAnswer(E.q);
          P.renderEar(app);
        };
      }

      const clr = $('#clearkeys');
      if (clr) {
        clr.onclick = function () {
          E.held = {};
          mark();
        };
      }
    }

    if ($('#next')) {
      $('#next').onclick = function () {
        E.q = makeQuestion(E.mode, E.level);
        E.picked = null;
        E.held = {};
        P.renderEar(app);
        playQuestion(E.q);
      };
    }
  };

  /* ============================================================
   * 哼唱 → 音符
   * ============================================================ */

  const HUM_DEC = 4;          // 降采样倍数：48k → 12k，够用且快
  const HUM_MIN_DUR = 0.09;   // 短于这个的音当成抖动扔掉

  /** YIN：累积均值归一化差分，取第一个低于阈值的谷 */
  function detectPitch(buf, sr) {
    const n = buf.length;
    const minLag = Math.max(2, Math.floor(sr / 1000));
    const maxLag = Math.min(n - 2, Math.floor(sr / 60));
    if (maxLag <= minLag + 2) return 0;

    const d = new Float32Array(maxLag + 2);
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i + lag < n; i++) {
        const x = buf[i] - buf[i + lag];
        sum += x * x;
      }
      d[lag] = sum;
    }

    let running = 0;
    const dp = new Float32Array(maxLag + 2);
    for (let lag = minLag; lag <= maxLag; lag++) {
      running += d[lag];
      dp[lag] = running ? d[lag] * (lag - minLag + 1) / running : 1;
    }

    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (dp[lag] < 0.16 && dp[lag] <= dp[lag - 1] && dp[lag] <= dp[lag + 1]) {
        const y0 = dp[lag - 1], y1 = dp[lag], y2 = dp[lag + 1];
        const den = y0 - 2 * y1 + y2;
        const shift = den ? 0.5 * (y0 - y2) / den : 0;
        const lagF = lag + shift;
        return lagF > 0 ? sr / lagF : 0;
      }
    }
    return 0;
  }

  function humStop() {
    const H = S.hum;
    if (!H) return;
    if (H.recording && H.stopHook) H.stopHook();
    H.recording = false;
    if (H.proc) { try { H.proc.disconnect(); } catch (e) { /* noop */ } H.proc = null; }
    if (H.stream) {
      H.stream.getTracks().forEach(function (t) { t.stop(); });
      H.stream = null;
    }
    if (H.actx) { try { H.actx.close(); } catch (e) { /* noop */ } H.actx = null; }
    if (H.raf) { root.cancelAnimationFrame(H.raf); H.raf = null; }
  }

  function drawHum(canvas, H) {
    const ctx = canvas.getContext('2d');
    const dpr = root.devicePixelRatio || 1;
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 160;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0e1216';
    ctx.fillRect(0, 0, w, h);

    const lo = 45, hi = 79;
    const rowH = h / (hi - lo + 1);
    const yOf = function (m) { return (hi - m) * rowH; };

    // 八度线
    for (let m = lo; m <= hi; m++) {
      if (m % 12 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(0, yOf(m), w, rowH);
      }
    }

    const span = 8;                       // 显示最近 8 秒
    const now = H.now || 0;
    const t0 = Math.max(0, now - span);

    // 已确定的音
    H.notes.forEach(function (n) {
      if (n.start + n.dur < t0) return;
      const x0 = ((n.start - t0) / span) * w;
      const x1 = ((n.start + n.dur - t0) / span) * w;
      ctx.fillStyle = 'rgba(95,211,154,0.85)';
      ctx.fillRect(x0, yOf(n.midi) + 1, Math.max(2, x1 - x0 - 1), Math.max(3, rowH - 2));
    });

    // 正在唱的那条线
    ctx.strokeStyle = '#78c8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    H.trace.forEach(function (p) {
      if (p.t < t0) return;
      const x = ((p.t - t0) / span) * w;
      const y = yOf(p.midi) + rowH / 2;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function humExport(H) {
    const notes = H.notes.filter(function (n) { return n.dur >= HUM_MIN_DUR; });
    if (!notes.length) return null;
    const TICKS_PER_SEC = 480 * 96 / 60;
    const last = notes[notes.length - 1];
    const bars = Math.max(1, Math.ceil((last.start + last.dur) * 96 / 60 / 4));
    const MM = root.MM;
    return MM.encode({
      name: 'hum',
      bpm: 96,
      bars: bars,
      keySharps: 0,
      keyMinor: false,
      tracks: [{
        name: 'Vocal',
        channel: 2,
        program: 0,
        notes: notes.map(function (n) {
          return {
            tick: Math.round(n.start * TICKS_PER_SEC),
            dur: Math.max(30, Math.round(n.dur * TICKS_PER_SEC)),
            midi: n.midi,
            vel: 96
          };
        })
      }]
    });
  }

  P.renderHum = function (app) {
    if (!S.hum) {
      S.hum = { notes: [], trace: [], recording: false, stream: null, actx: null, proc: null, t0: 0, now: 0, raf: null };
    }
    const H = S.hum;

    app.innerHTML =
      '<section class="practice">' +
        '<div class="lesson-top">' +
          '<div class="crumbs"><a href="#/">目录</a><span class="sep">/</span><span>自由练习</span></div>' +
        '</div>' +
        '<div class="lesson-title">' +
          '<h1>哼唱</h1>' +
          '<span class="sub">把脑子里的调子落成音符</span>' +
        '</div>' +
        tabs('hum') +
        '<p class="instr">对着麦克风哼一句。它会把音高一个个抓下来，画在下面。</p>' +
        '<div class="roll-wrap kb-wrap"><canvas id="humcv" class="hum-cv"></canvas></div>' +
        '<div class="demo">' +
          '<button class="btn primary" id="humgo">开始</button>' +
          '<button class="btn ghost" id="humclear">清空</button>' +
          '<span class="caption" id="humtip">需要麦克风权限，音频不上传</span>' +
        '</div>' +
        '<div id="humout"></div>' +
        '<p class="hint">' +
          '哼的时候尽量用「嗯」或「啊」，一个音拖住半秒以上更容易抓准。' +
          '导出的 .mid 只有一条 Vocal 轨，拖进 Studio One 就是一条能改的旋律。' +
        '</p>' +
      '</section>';

    const canvas = $('#humcv');
    drawHum(canvas, H);
    renderHumOut();

    $('#humgo').onclick = function () {
      if (H.recording) { humStop(); renderHumOut(); return; }
      startHum();
    };

    $('#humclear').onclick = function () {
      humStop();
      H.notes = []; H.trace = []; H.now = 0;
      $('#humgo').textContent = '开始';
      drawHum(canvas, H);
      renderHumOut();
    };

    $('#pkeys').onclick = function () { humStop(); P.renderKeys(app); };
    $('#etab').onclick = function () { humStop(); P.renderEar(app); };
    $('#htab').onclick = function () { /* 已经在这一页 */ };

    function renderHumOut() {
      const out = $('#humout');
      const notes = H.notes.filter(function (n) { return n.dur >= HUM_MIN_DUR; });
      const go = $('#humgo');
      if (go) go.textContent = H.recording ? '停止' : '开始';

      if (!notes.length) {
        out.innerHTML = '<p class="hint">还没有录到音。按「开始」，哼一句，再按「停止」。</p>';
        return;
      }

      const list = notes.map(function (n, i) {
        return '<span class="hum-note"><b>' + MT.midiName(n.midi) + '</b>' +
          '<i>' + n.dur.toFixed(2) + 's</i></span>';
      }).join('');

      out.innerHTML =
        '<div class="hum-result">' +
          '<div class="hum-count">抓到 ' + notes.length + ' 个音</div>' +
          '<div class="hum-notes">' + list + '</div>' +
          '<div class="demo"><button class="btn primary" id="humexport">导出 .mid</button>' +
          '<span class="caption">96 BPM，一条 Vocal 轨</span></div>' +
        '</div>';

      const btn = $('#humexport');
      if (btn) {
        btn.onclick = function () {
          const bytes = humExport(H);
          if (!bytes) return;
          root.MM.download(bytes, 'hum.mid');
        };
      }
    }

    function startHum() {
      const MD = root.navigator && root.navigator.mediaDevices;
      if (!MD || !MD.getUserMedia) {
        $('#humtip').textContent = '这个浏览器拿不到麦克风';
        return;
      }

      MD.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .then(function (stream) {
          const AC = root.AudioContext || root.webkitAudioContext;
          const actx = new AC();
          H.actx = actx;
          H.stream = stream;
          H.recording = true;
          H.notes = []; H.trace = []; H.t0 = actx.currentTime; H.now = 0;

          const src = actx.createMediaStreamSource(stream);
          const proc = actx.createScriptProcessor(2048, 1, 1);
          H.proc = proc;

          const mute = actx.createGain();
          mute.gain.value = 0;                 // 不把麦克风放出来，免得啸叫
          src.connect(proc);
          proc.connect(mute);
          mute.connect(actx.destination);

          let cur = null;

          proc.onaudioprocess = function (e) {
            if (!H.recording) return;
            const input = e.inputBuffer.getChannelData(0);
            const sr = actx.sampleRate;

            // 降采样 + 算能量
            const n = Math.floor(input.length / HUM_DEC);
            const dec = new Float32Array(n);
            let rms = 0;
            for (let i = 0; i < n; i++) {
              let s = 0;
              for (let k = 0; k < HUM_DEC; k++) s += input[i * HUM_DEC + k];
              dec[i] = s / HUM_DEC;
              rms += dec[i] * dec[i];
            }
            rms = Math.sqrt(rms / n);

            const t = actx.currentTime - H.t0;
            H.now = t;

            const f = rms > 0.012 ? detectPitch(dec, sr / HUM_DEC) : 0;
            const midi = f > 0 ? 69 + 12 * Math.log2(f / 440) : 0;

            if (midi > 40 && midi < 84) {
              H.trace.push({ t: t, midi: midi });
              if (H.trace.length > 900) H.trace.shift();

              const m = Math.round(midi);
              if (cur && Math.abs(cur.midi - m) === 0) {
                cur.dur = t - cur.start;
              } else {
                if (cur && cur.dur >= HUM_MIN_DUR) H.notes.push(cur);
                cur = { midi: m, start: t, dur: 0.02 };
              }
            } else if (cur) {
              if (cur.dur >= HUM_MIN_DUR) H.notes.push(cur);
              cur = null;
            }

            if ($('#humtag')) $('#humtag').textContent = midi > 0 ? MT.midiName(Math.round(midi)) : '—';
          };

          const loop = function () {
            if (!H.recording) return;
            drawHum(canvas, H);
            H.raf = root.requestAnimationFrame(loop);
          };
          loop();

          H.stopHook = function () {
            if (cur && cur.dur >= HUM_MIN_DUR) H.notes.push(cur);
            cur = null;
          };

          renderHumOut();
          $('#humout').innerHTML = '<p class="hint">正在录……对着麦克风哼一句，再按「停止」。</p>';
        })
        .catch(function () {
          $('#humtip').textContent = '没拿到麦克风权限。可以在地址栏的网站设置里打开。';
        });
    }
  };

  /* ============================================================
   * 入口
   * ============================================================ */

  function tabs(active) {
    return '<div class="seg tabs" id="ptabs">' +
      '<button id="pkeys" data-tab="keys" class="' + (active === 'keys' ? 'on' : '') + '">键盘</button>' +
      '<button id="etab" data-tab="ear" class="' + (active === 'ear' ? 'on' : '') + '">磨耳朵</button>' +
      '<button id="htab" data-tab="hum" class="' + (active === 'hum' ? 'on' : '') + '">哼唱</button>' +
      '</div>';
  }

  P.render = function (app) { S.tab = 'keys'; P.renderKeys(app); };

  // 给自检用：出题逻辑和音高检测可以脱离 DOM 单独验
  P._make = makeQuestion;
  P._pitch = detectPitch;
  P._state = S;

  root.PRACTICE = P;
})(typeof window !== 'undefined' ? window : globalThis);
