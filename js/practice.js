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

  function buildKeyboard() {
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

    return '<div class="kb" id="kb">' + whiteHtml + blackHtml + '</div>';
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
        '<div class="roll-wrap kb-wrap">' + buildKeyboard() + '</div>' +
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
    { id: 'chord', name: '和弦', desc: '大三、小三，还是减三' }
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
      token: 0
    };
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

  function playQuestion(q) {
    if (!q) return;
    if (q.kind === 'degree') {
      MA.chordBlip(q.tonic, 0, 0.9, 0.5);
      MA.blip(q.target, 0.95, 1.2, 0.26);
    } else if (q.kind === 'interval') {
      MA.blip(q.root, 0, 0.8, 0.24);
      MA.blip(q.root + q.semis, 0.75, 0.9, 0.24);
    } else {
      MA.chordBlip(q.notes, 0, 1.4, 0.55);
    }
  }

  function playAnswer(q) {
    if (q.kind === 'interval') {
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
        E.total += 1;
        if (E.picked === E.q.answer) {
          E.correct += 1;
          E.streak += 1;
          const best2 = loadStats();
          if (E.streak > (best2[E.mode] || 0)) { best2[E.mode] = E.streak; saveStats(best2); }
          if (E.streak % 5 === 0 && E.level < 3) E.level += 1;
        } else {
          E.streak = 0;
          playAnswer(E.q);
        }
        P.renderEar(app);
      };
    }

    if ($('#next')) {
      $('#next').onclick = function () {
        E.q = makeQuestion(E.mode, E.level);
        E.picked = null;
        P.renderEar(app);
        playQuestion(E.q);
      };
    }
  };

  /* ============================================================
   * 入口
   * ============================================================ */

  function tabs(active) {
    return '<div class="seg tabs" id="ptabs">' +
      '<button id="pkeys" data-tab="keys" class="' + (active === 'keys' ? 'on' : '') + '">键盘</button>' +
      '<button id="etab" data-tab="ear" class="' + (active === 'ear' ? 'on' : '') + '">磨耳朵</button>' +
      '</div>';
  }

  P.render = function (app) { S.tab = 'keys'; P.renderKeys(app); };

  // 给自检用：出题逻辑可以脱离 DOM 单独验
  P._make = makeQuestion;
  P._state = S;

  root.PRACTICE = P;
})(typeof window !== 'undefined' ? window : globalThis);
