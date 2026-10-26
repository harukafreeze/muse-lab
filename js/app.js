/*!
 * app.js — 路由、界面、交互
 *
 * 一个屏幕一件事。每一步只有一种交互：
 *   text   → 听
 *   ab     → 听 A / 听 B，然后选一个
 *   build  → 摆 4 小节，检查
 *   quiz   → 听，选答案
 *   export → 导出 .mid
 *
 * 判分一律走 MT 现算，这里不存任何「正确答案」字面量。
 */
(function (root) {
  'use strict';

  const MT = root.MT, MA = root.MA, MM = root.MM, PR = root.PR, ML = root.ML, MP = root.MP;
  const doc = root.document;
  const $ = function (s, el) { return (el || doc).querySelector(s); };
  const $$ = function (s, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(s)); };

  const S = {
    lesson: null,
    index: 0,
    handle: null,
    grid: null,
    chords: null,
    built: {},
    melody: null,
    melPaint: 62,
    drums: null,
    rhyTab: 0,
    paint: 'D',
    gated: false,
    abVersion: 'a',
    analyze: null
  };

  /* ============================================================
   * 小工具
   * ============================================================ */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmt(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function paras(list) {
    return list.map(function (p) { return '<p>' + fmt(p) + '</p>'; }).join('');
  }

  function currentChords() {
    return (S.chords || []).map(function (c) { return c || 'D'; });
  }

  /**
   * 这一课用哪 4 小节。
   * 第 5 课接第 4 课摆的那一段，所以固定读 'l4' 的存档，不读当前的。
   * 内存里也留一份：file:// 下 localStorage 可能不可用。
   */
  function harmonyFor(lesson) {
    if (lesson && lesson.usesHarmony) {
      const own = S.built.l4 || MP.getBuild('l4');
      if (own && own.length === 4 && own.every(Boolean)) return own;
      return (lesson.defaultHarmony || ['D', 'A', 'D', 'D']).slice();
    }
    return currentChords();
  }

  /** 鼓的初始状态：单套 or 主歌/副歌两套 */
  function emptyDrums(step) {
    const n = step && step.dual ? 2 : 1;
    const patterns = [];
    for (let i = 0; i < n; i++) patterns.push(PR.emptyPattern());
    return { patterns: patterns, map: n === 2 ? [0, 0, 1, 1] : [0] };
  }

  function drumHits(p) {
    return p.hats.reduce(function (a, b) { return a + b; }, 0) +
      p.snare.reduce(function (a, b) { return a + b; }, 0) +
      p.kick.reduce(function (a, b) { return a + b; }, 0);
  }

  function drumsSummary(drums) {
    if (drums.patterns.length > 1) {
      return '主歌型 ' + drumHits(drums.patterns[0]) + ' 下 / 副歌型 ' + drumHits(drums.patterns[1]) + ' 下（每小节）';
    }
    return drumHits(drums.patterns[0]) + ' 下（每小节）';
  }

  function checkRhythm(step, state) {
    if (step.dual) return ML.checkDrums2(step, state);
    const p = (state && state.patterns && state.patterns[0]) || PR.emptyPattern();
    return ML.checkDrums(step, p);
  }

  /** 格子 → 音符。连着同一个音并成一个长音，听起来才像「唱」而不是「敲」 */
  function slotsToNotes(slots, beatsPerBar) {
    return ML.slotsToMelody(slots, beatsPerBar);
  }

  /** A/B 题的答案：题目问的是什么，用哪条规则算 */
  function abTruth(step, keyPc) {
    if (step.abRule === 'endsOnDegree') {
      const a = MT.degreeOf(MT.lastChord(step.chordsA), keyPc);
      const b = MT.degreeOf(MT.lastChord(step.chordsB), keyPc);
      if (a === step.degree) return 'a';
      if (b === step.degree) return 'b';
      return null;
    }
    return MT.endsOnTonic(step.chordsA, keyPc) ? 'b' : 'a';
  }

  function teardown() {
    if (S.handle) {
      try { S.handle.stop(); } catch (e) { /* noop */ }
      S.handle = null;
    }
    if (S.grid) {
      try { S.grid.destroy(); } catch (e) { /* noop */ }
      S.grid = null;
    }
  }

  function feedback(el, text, kind) {
    el.hidden = false;
    el.className = 'feedback ' + (kind || '');
    el.textContent = text;
  }

  function refreshGate() {
    const btn = $('#nav-next');
    if (btn) btn.disabled = !S.gated;
  }

  /* ============================================================
   * 目录
   * ============================================================ */

  function renderHome() {
    teardown();
    S.lesson = null;
    const app = $('#app');
    const tag = $('.topbar .tag');
    if (tag) tag.textContent = '和声 · 旋律 · 句子 · 节奏';
    const ids = ML.LESSONS.map(function (l) { return l.id; });
    const done = MP.doneCount(ids);

    const cards = ML.LESSONS.map(function (l) {
      const isDone = MP.isDone(l.id);
      return (
        '<a class="card' + (isDone ? ' done' : '') + '" href="#/' + l.id + '/1">' +
          '<div class="card-no">' + String(l.no).padStart(2, '0') + '</div>' +
          '<div class="card-main">' +
            '<h3>' + esc(l.title) + '</h3>' +
            '<p>' + esc(l.sub) + '</p>' +
            '<p class="card-goal">' + esc(l.goal) + '</p>' +
          '</div>' +
          '<div class="card-state">' + (isDone ? '已通过' : '可以开始') + '</div>' +
        '</a>'
      );
    }).join('');

    const planned = ML.PLANNED.map(function (p) {
      return (
        '<div class="card planned">' +
          '<div class="card-no">' + String(p.no).padStart(2, '0') + '</div>' +
          '<div class="card-main"><h3>' + esc(p.title) + '</h3><p>' + esc(p.sub) + '</p></div>' +
          '<div class="card-state">待做</div>' +
        '</div>'
      );
    }).join('');

    app.innerHTML =
      '<section class="home">' +
        '<p class="kicker">muse lab</p>' +
        '<h1>从听出「落」开始，<br>写到自己的 8 小节。</h1>' +
        '<p class="lead">' +
          '每一课只干一件事：先听，再动手，然后换一道新题。' +
          '所有声音都是浏览器现算的合成音——戴耳机，手机外放听不出低音。' +
        '</p>' +
        '<div class="arc" aria-hidden="true">' +
          '<span>听</span><i></i><span>和声</span><i></i><span>旋律</span>' +
          '<i></i><span>句子</span><i></i><span>节奏</span><i></i><span>8 小节</span>' +
        '</div>' +
        '<div class="progress-line">已通过 <b>' + done + '</b> / ' + ML.LESSONS.length + ' 课</div>' +
        '<div class="cards">' + cards + planned + '</div>' +
        '<a class="card tool" href="#/analyze">' +
          '<div class="card-no">↗</div>' +
          '<div class="card-main">' +
            '<h3>拆一首歌</h3>' +
            '<p>把你喜欢那首歌里的 4 个和弦打进来</p>' +
            '<p class="card-goal">我告诉你这是 1-5-6m-4，还是别的什么</p>' +
          '</div>' +
          '<div class="card-state">工具</div>' +
        '</a>' +
        '<p class="foot">没有账号 · 没有云端 · 进度只在这台机器上</p>' +
      '</section>';
  }

  /* ============================================================
   * 拆一首歌（反向：把和弦读成级数）
   * ============================================================ */

  const KEYS = [[2, 'D'], [0, 'C'], [4, 'E'], [7, 'G'], [9, 'A']];

  // 三个最常被拿来对照的进行，按当前调展开
  const PRESETS = {
    major: [
      { label: '1-5-6m-4', degs: [1, 5, 6, 4] },
      { label: '1-4-5-6m', degs: [1, 4, 5, 6] },
      { label: '1-6m-4-5', degs: [1, 6, 4, 5] }
    ],
    minor: [
      { label: 'i-VI-III-VII', degs: [1, 6, 3, 7] },
      { label: 'i-iv-VII-III', degs: [1, 4, 7, 3] },
      { label: 'i-VII-VI-V', degs: [1, 7, 6, 5] }
    ]
  };

  function diatonicChords(keyPc, mode) {
    const out = [];
    for (let d = 1; d <= 7; d++) out.push(MT.diatonicChord(keyPc, d, mode).name);
    return out;
  }

  function renderAnalyze() {
    teardown();
    S.lesson = null;
    if (!S.analyze) S.analyze = { keyPc: 2, mode: 'major', chords: [] };
    const st = S.analyze;

    const tag = $('.topbar .tag');
    if (tag) tag.textContent = '拆一首歌';

    const minor = st.mode === 'minor';
    const chords = diatonicChords(st.keyPc, st.mode);
    const a = ML.analyzeProgression(st.chords, st.keyPc, st.mode);

    const pad = chords.map(function (c) {
      return '<button class="pad-chip" data-chord="' + esc(c) + '">' +
        '<b>' + esc(c) + '</b><span>' + esc(MT.romanOf(c, st.keyPc, st.mode)) + '</span></button>';
    }).join('');

    const seq = st.chords.length
      ? st.chords.map(function (c, i) {
          return '<button class="seq-chip" data-i="' + i + '" title="点一下移除">' +
            esc(c) + '<span>×</span></button>';
        }).join('')
      : '<span class="seq-empty">还没放和弦</span>';

    let result;
    if (!a) {
      result = '<div class="result empty">点上面的和弦，把它一个个排进来。排完我就告诉你这是什么进行。</div>';
    } else {
      result =
        '<div class="result">' +
          '<div class="res-row"><span>级数</span><b>' + esc(a.degrees) + '</b></div>' +
          '<div class="res-row"><span>罗马</span><b>' + esc(a.roman) + '</b></div>' +
          '<div class="res-row"><span>低音</span><b>' + esc(a.bass) + '</b></div>' +
          '<div class="res-row"><span>结句</span><b>' +
            (a.endsHome ? '回到主和弦，落地了' : '停在 ' + esc(a.lastRoman) + '，没回主和弦') +
          '</b></div>' +
          '<p class="res-note">' +
            (a.name || '不是最常见的那几种，但它是成立的。') +
            (a.outOfKey ? '（有 ' + a.outOfKey + ' 个和弦不在这个调里）' : '') +
          '</p>' +
        '</div>';
    }

    $('#app').innerHTML =
      '<section class="analyze">' +
        '<div class="lesson-top">' +
          '<div class="crumbs"><a href="#/">目录</a><span class="sep">/</span><span>拆一首歌</span></div>' +
        '</div>' +
        '<div class="lesson-title">' +
          '<h1>拆一首歌</h1>' +
          '<span class="sub">把和弦排进来，看清楚它是什么</span>' +
        '</div>' +
        '<p class="field-label">调性</p>' +
        '<div class="seg" id="modes">' +
          '<button data-mode="major" class="' + (minor ? '' : 'on') + '">大调</button>' +
          '<button data-mode="minor" class="' + (minor ? 'on' : '') + '">小调</button>' +
        '</div>' +
        '<div class="seg wrap keys" id="keys">' +
          KEYS.map(function (k) {
            return '<button data-key="' + k[0] + '" class="' + (st.keyPc === k[0] ? 'on' : '') + '">' +
              k[1] + (minor ? ' 小调' : ' 大调') + '</button>';
          }).join('') +
        '</div>' +
        '<p class="field-label">把和弦按顺序点进来</p>' +
        '<div class="pad" id="pad">' + pad + '</div>' +
        '<div class="presets" id="presets">' +
          '<span>试试</span>' +
          PRESETS[st.mode].map(function (p, i) {
            return '<button data-preset="' + i + '">' + p.label + '</button>';
          }).join('') +
        '</div>' +
        '<div class="seq" id="seq">' + seq + '</div>' +
        result +
        '<div class="demo">' +
          '<button class="btn play" id="play"' + (st.chords.length ? '' : ' disabled') + '>▶ 听一遍</button>' +
          '<button class="btn ghost" id="undo"' + (st.chords.length ? '' : ' disabled') + '>退一格</button>' +
          '<button class="btn ghost" id="clear"' + (st.chords.length ? '' : ' disabled') + '>清空</button>' +
        '</div>' +
        '<p class="hint">' +
          '一个和弦一个和弦地换，听哪一下是「推」、哪一下是「落」。' +
          '认不出来的进行也照样能听——名字只是方便你跟别人说。' +
        '</p>' +
      '</section>';

    $('#modes').onclick = function (e) {
      const b = e.target.closest('button[data-mode]');
      if (!b || b.dataset.mode === st.mode) return;
      st.mode = b.dataset.mode;
      st.chords = [];
      renderAnalyze();
    };

    $('#keys').onclick = function (e) {
      const b = e.target.closest('button[data-key]');
      if (!b) return;
      st.keyPc = Number(b.dataset.key);
      st.chords = [];
      renderAnalyze();
    };

    $('#pad').onclick = function (e) {
      const b = e.target.closest('button[data-chord]');
      if (!b) return;
      if (st.chords.length >= 8) {
        st.chords.shift();
      }
      st.chords.push(b.dataset.chord);
      renderAnalyze();
    };

    $('#seq').onclick = function (e) {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      st.chords.splice(Number(b.dataset.i), 1);
      renderAnalyze();
    };

    $('#presets').onclick = function (e) {
      const b = e.target.closest('button[data-preset]');
      if (!b) return;
      const p = PRESETS[st.mode][Number(b.dataset.preset)];
      st.chords = p.degs.map(function (d) { return MT.diatonicChord(st.keyPc, d, st.mode).name; });
      renderAnalyze();
    };

    $('#undo').onclick = function () {
      st.chords.pop();
      renderAnalyze();
    };

    $('#clear').onclick = function () {
      st.chords = [];
      renderAnalyze();
    };

    $('#play').onclick = function () {
      const btn = $('#play');
      if (S.handle) {
        S.handle.stop();
        S.handle = null;
        btn.textContent = '▶ 听一遍';
        btn.classList.remove('on');
        return;
      }
      S.handle = MA.play({ chordsA: st.chords, bars: st.chords.length, bpm: 96, bass: true });
      btn.textContent = '■ 停止';
      btn.classList.add('on');
    };
  }

  /* ============================================================
   * 课
   * ============================================================ */

  function openLesson(lesson, idx) {
    teardown();
    S.lesson = lesson;
    S.index = Math.max(0, Math.min(lesson.steps.length - 1, idx));

    const build = lesson.steps.filter(function (s) { return s.kind === 'build'; })[0];
    if (build) {
      S.chords = S.built[lesson.id] || MP.getBuild(lesson.id) || build.initial.slice();
    }

    const melSource = lesson.steps.some(function (s) { return s.kind === 'melody'; })
      ? lesson.id
      : (lesson.usesMelody || null);
    if (melSource) {
      S.melody = MP.getMelody(melSource) || new Array(16).fill(null);
      const melStep = lesson.steps.filter(function (s) { return s.kind === 'melody'; })[0];
      if (S.melPaint == null && melStep) S.melPaint = melStep.palette[0];
    } else {
      S.melody = null;
    }

    const rhyStep = lesson.steps.filter(function (s) { return s.kind === 'rhythm'; })[0];
    if (rhyStep) {
      const saved = MP.getDrums(lesson.id);
      if (saved && saved.patterns) S.drums = saved;
      else if (saved) S.drums = { patterns: [saved], map: [0] };
      else S.drums = emptyDrums(rhyStep);
      S.rhyTab = 0;
    } else {
      S.drums = null;
    }

    renderLesson();
  }

  function renderLesson() {
    teardown();
    const lesson = S.lesson;
    const step = lesson.steps[S.index];
    const n = lesson.steps.length;

    // 每一步进门时的闸门状态
    if (step.kind === 'text' || step.kind === 'export') S.gated = true;
    else if (step.kind === 'build') S.gated = ML.checkBuild(step, currentChords()).ok && (S.chords || []).every(Boolean);
    else if (step.kind === 'melody') S.gated = ML.checkMelody(step, S.melody || [], harmonyFor(lesson)).ok;
    else if (step.kind === 'rhythm') S.gated = !!S.drums && checkRhythm(step, S.drums).ok;
    else if (step.kind === 'checklist') {
      const saved = MP.getChecks(lesson.id) || [];
      S.gated = step.items.every(function (_, i) { return !!saved[i]; });
    }
    else S.gated = false;

    // 顶栏那行跟着课走
    const tag = $('.topbar .tag');
    if (tag) tag.textContent = '第 ' + lesson.no + ' 课 · ' + lesson.title;

    const dots = lesson.steps.map(function (s, i) {
      return '<span class="dot' + (i < S.index ? ' past' : i === S.index ? ' now' : '') + '"></span>';
    }).join('');

    const isLast = S.index === n - 1;

    $('#app').innerHTML =
      '<section class="lesson">' +
        '<div class="lesson-top">' +
          '<div class="crumbs"><a href="#/">目录</a><span class="sep">/</span><span>第 ' + lesson.no + ' 课</span></div>' +
          '<div class="dots">' + dots + '</div>' +
        '</div>' +
        '<div class="lesson-title">' +
          '<h1>' + esc(lesson.title) + '</h1>' +
          '<span class="sub">' + esc(lesson.sub) + ' · ' + esc(lesson.keyLabel) + '</span>' +
        '</div>' +
        '<p class="kicker">第 ' + (S.index + 1) + ' 步，共 ' + n + ' 步</p>' +
        '<h2 class="step-title">' + esc(step.title) + '</h2>' +
        '<div id="stage"></div>' +
        '<nav class="nav">' +
          '<button class="btn ghost" id="nav-prev"' + (S.index === 0 ? ' disabled' : '') + '>上一步</button>' +
          '<button class="btn primary" id="nav-next"' + (S.gated ? '' : ' disabled') + '>' +
            (isLast ? '完成这一课' : '下一步') +
          '</button>' +
        '</nav>' +
      '</section>';

    const stage = $('#stage');
    const render = ({
      text: renderText,
      ab: renderAB,
      build: renderBuild,
      melody: renderMelody,
      rhythm: renderRhythm,
      checklist: renderChecklist,
      quiz: renderQuiz,
      export: renderExport
    })[step.kind];

    if (render) render(stage, step);

    $('#nav-prev').onclick = function () {
      if (S.index > 0) root.location.hash = '#/' + lesson.id + '/' + S.index;
    };
    $('#nav-next').onclick = function () {
      if (!S.gated) return;
      if (isLast) {
        MP.markDone(lesson.id);
        root.location.hash = '#/';
      } else {
        root.location.hash = '#/' + lesson.id + '/' + (S.index + 2);
      }
    };
  }

  /* ---------------- text ---------------- */

  function renderText(stage, step) {
    let html = '<div class="prose">' + paras(step.body) + '</div>';

    if (step.demos) {
      html += '<div class="demo">' +
        step.demos.map(function (d, i) {
          return '<button class="btn play" data-demo="' + i + '">▶ ' + esc(d.label) + '</button>';
        }).join('') +
        '</div>' +
        '<p class="hint">两个各放一遍。听的是第 1 小节第 1 拍那个音，落稳了没有。</p>';
    } else if (step.demo) {
      html += '<div class="demo">' +
        '<button class="btn play" id="play">▶ ' + esc(step.playLabel || '听一遍') + '</button>' +
        (step.caption ? '<span class="caption">' + esc(step.caption) + '</span>' : '') +
        '</div>';
    }

    stage.innerHTML = html;

    /* 一组对比试听：各放一遍，播完自停 */
    if (step.demos) {
      $$('[data-demo]').forEach(function (btn) {
        btn.onclick = function () {
          const d = step.demos[Number(btn.dataset.demo)];
          if (S.handle) { S.handle.stop(); S.handle = null; }
          $$('[data-demo]').forEach(function (b) { b.classList.remove('on'); });
          btn.classList.add('on');
          try {
            S.handle = MA.once(d.chords, {
              bpm: d.bpm || step.bpm || 96,
              bars: d.chords.length,
              melody: d.melody || [],
              drums: d.drums || null
            });
          } catch (e) {
            btn.textContent = '这台设备放不出声音';
            return;
          }
          const total = ((60 / (d.bpm || step.bpm || 96)) * 4) * d.chords.length * 1000 + 900;
          setTimeout(function () {
            S.handle = null;
            btn.classList.remove('on');
          }, total);
        };
      });
      return;
    }

    const btn = $('#play');
    if (!btn) return;
    const demo = step.demo;
    btn.onclick = function () {
      if (S.handle) {
        S.handle.stop();
        S.handle = null;
        btn.textContent = '▶ ' + (step.playLabel || '听一遍');
        btn.classList.remove('on');
        return;
      }
      try {
        S.handle = MA.play({
          chordsA: demo.chords,
          bars: demo.chords.length,
          bpm: demo.bpm || 92,
          melody: demo.melody || [],
          drums: demo.drums || null,
          bass: demo.bass !== false
        });
      } catch (e) {
        btn.textContent = '这台设备放不出声音';
        return;
      }
      btn.textContent = '■ 停止';
      btn.classList.add('on');
    };
  }

  /* ---------------- ab ---------------- */

  function renderAB(stage, step) {
    const truth = abTruth(step, S.lesson.keyPc);

    stage.innerHTML =
      '<div class="demo">' +
        '<button class="btn play" id="play">▶ 播放</button>' +
        '<div class="seg" id="seg">' +
          '<button data-ver="a" class="' + (S.abVersion === 'a' ? 'on' : '') + '">A</button>' +
          '<button data-ver="b" class="' + (S.abVersion === 'b' ? 'on' : '') + '">B</button>' +
        '</div>' +
        '<span class="caption">切换在小节线上生效</span>' +
      '</div>' +
      '<div class="question">' + fmt(step.question) + '</div>' +
      '<div class="options" id="opts">' +
        step.options.map(function (o) {
          return '<button class="opt" data-key="' + o.key + '">' + esc(o.label) + '</button>';
        }).join('') +
      '</div>' +
      '<div class="feedback" id="fb" hidden></div>';

    const btn = $('#play');
    const seg = $('#seg');

    function paintSeg() {
      $$('button', seg).forEach(function (b) {
        b.classList.toggle('on', b.dataset.ver === S.abVersion);
      });
    }

    btn.onclick = function () {
      if (S.handle) {
        S.handle.stop();
        S.handle = null;
        btn.textContent = '▶ 播放';
        btn.classList.remove('on');
        return;
      }
      try {
        S.handle = MA.play({
          bpm: step.bpm || 96,
          bars: step.bars || step.chordsA.length,
          chordsA: step.chordsA,
          chordsB: step.chordsB,
          melody: step.melody || [],
          bass: true
        });
      } catch (e) {
        btn.textContent = '这台设备放不出声音';
        return;
      }
      if (S.abVersion === 'b') S.handle.setVersion('b');
      btn.textContent = '■ 停止';
      btn.classList.add('on');
    };

    seg.onclick = function (e) {
      const b = e.target.closest('button[data-ver]');
      if (!b) return;
      S.abVersion = b.dataset.ver;
      paintSeg();
      if (S.handle) S.handle.setVersion(S.abVersion);
    };

    $('#opts').onclick = function (e) {
      const b = e.target.closest('button.opt');
      if (!b) return;
      const fb = $('#fb');
      const key = b.dataset.key;
      $$('button.opt').forEach(function (x) { x.classList.remove('ok', 'no'); });
      if (key === truth) {
        b.classList.add('ok');
        feedback(fb, '对。' + step.why, 'ok');
        S.gated = true;
      } else {
        b.classList.add('no');
        feedback(fb, '再听一遍：最后一个小节换了和弦之后，你有没有想往下走的那一下。', 'no');
        S.gated = false;
      }
      refreshGate();
    };
  }

  /* ---------------- build ---------------- */

  function renderBuild(stage, step) {
    const allowed = step.allowed || ['D', 'A'];
    if (allowed.indexOf(S.paint) < 0) S.paint = allowed[0];

    stage.innerHTML =
      '<p class="instr">' + fmt(step.instruction) + '</p>' +
      '<div class="build-tools">' +
        allowed.map(function (c) {
          return '<button class="chip' + (S.paint === c ? ' on' : '') + '" data-paint="' + esc(c) + '">' +
            esc(c) + '</button>';
        }).join('') +
        '<button class="chip" data-erase="1">擦</button>' +
        '<span class="spacer"></span>' +
        '<button class="btn play" id="play">▶ 播放</button>' +
        '<button class="btn" id="check">检查</button>' +
      '</div>' +
      '<div class="roll-wrap"><canvas id="roll" class="roll"></canvas></div>' +
      '<div class="feedback" id="fb" hidden></div>' +
      (step.hint ? '<p class="hint">' + fmt(step.hint) + '</p>' : '');

    const canvas = $('#roll');
    const fb = $('#fb');
    const btn = $('#play');

    S.grid = new PR.Grid(canvas, {
      bars: step.bars,
      chords: (S.chords || []).slice(),
      paint: S.paint,
      onChange: function (ch) {
        S.chords = ch;
        S.built[S.lesson.id] = ch.slice();
        MP.saveBuild(S.lesson.id, ch);
        if (S.handle) S.handle.setChords(currentChords());
      }
    });

    $$('.build-tools .chip').forEach(function (chip) {
      chip.onclick = function () {
        if (chip.dataset.erase) {
          S.paint = null;
          $$('.build-tools .chip').forEach(function (c) { c.classList.remove('on'); });
          chip.classList.add('on');
          S.grid.setPaint(null);
          return;
        }
        S.paint = chip.dataset.paint;
        S.grid.setPaint(S.paint);
        $$('.build-tools .chip').forEach(function (c) { c.classList.toggle('on', c === chip); });
      };
    });

    btn.onclick = function () {
      if (S.handle) {
        S.handle.stop();
        S.handle = null;
        btn.textContent = '▶ 播放';
        btn.classList.remove('on');
        S.grid.follow(null);
        return;
      }
      try {
        S.handle = MA.play({
          bpm: step.bpm || 96,
          bars: step.bars,
          chordsA: currentChords(),
          bass: true
        });
      } catch (e) {
        btn.textContent = '这台设备放不出声音';
        return;
      }
      btn.textContent = '■ 停止';
      btn.classList.add('on');
      S.grid.follow(function () { return S.handle ? S.handle.position() : null; });
    };

    $('#check').onclick = function () {
      const r = ML.checkBuild(step, currentChords());
      const msg = r.msg;
      if (r.ok && step.nameIt) {
        const cs = currentChords();
        const p = ML.progressionName(cs, S.lesson.keyPc, S.lesson.mode);
        feedback(fb, '成立。你排的是 ' + cs.join('–') + '（' + p.degrees + '）' +
          (p.name ? '——' + p.name + '。' : '——不是最常见的那几种，但它是成立的。'), 'ok');
        S.gated = true;
        refreshGate();
        return;
      }
      feedback(fb, msg, r.ok ? 'ok' : 'no');
      S.gated = r.ok;
      refreshGate();
    };
  }

  /* ---------------- melody ---------------- */

  function renderMelody(stage, step) {
    const chords = harmonyFor(S.lesson);
    const palette = step.palette || [62, 64, 66, 69, 71, 74];
    const bars = step.bars || 4;
    const beats = step.beatsPerBar || 4;
    if (S.melPaint == null) S.melPaint = palette[0];

    stage.innerHTML =
      '<p class="instr">' + fmt(step.instruction) + '</p>' +
      '<div class="build-tools">' +
        palette.map(function (m) {
          return '<button class="chip' + (S.melPaint === m ? ' on' : '') + '" data-midi="' + m + '">' +
            MT.midiName(m) + '</button>';
        }).join('') +
        '<button class="chip" data-clear="1">清空</button>' +
        '<span class="spacer"></span>' +
        '<button class="btn play" id="play">▶ 播放</button>' +
        '<button class="btn" id="check">检查</button>' +
      '</div>' +
      '<div class="roll-wrap"><canvas id="mel" class="roll"></canvas></div>' +
      '<div class="feedback" id="fb" hidden></div>' +
      (step.hint ? '<p class="hint">' + fmt(step.hint) + '</p>' : '');

    const fb = $('#fb');
    const btn = $('#play');

    S.grid = new PR.MelodyGrid($('#mel'), {
      bars: bars,
      beatsPerBar: beats,
      chords: chords,
      slots: S.melody || [],
      paint: S.melPaint,
      palette: palette,
      onChange: function (slots) {
        S.melody = slots;
        MP.saveMelody(S.lesson.id, slots);
      }
    });

    $$('.build-tools .chip[data-midi]').forEach(function (chip) {
      chip.onclick = function () {
        S.melPaint = Number(chip.dataset.midi);
        S.grid.setPaint(S.melPaint);
        $$('.build-tools .chip[data-midi]').forEach(function (c) {
          c.classList.toggle('on', c === chip);
        });
      };
    });

    $('.build-tools .chip[data-clear]').onclick = function () {
      S.melody = new Array(bars * beats).fill(null);
      S.grid.setSlots(S.melody);
      MP.saveMelody(S.lesson.id, S.melody);
      S.gated = false;
      refreshGate();
    };

    btn.onclick = function () {
      if (S.handle) {
        S.handle.stop();
        S.handle = null;
        btn.textContent = '▶ 播放';
        btn.classList.remove('on');
        S.grid.follow(null);
        return;
      }
      try {
        S.handle = MA.play({
          bpm: step.bpm || 96,
          bars: bars,
          chordsA: chords,
          melody: slotsToNotes(S.melody || [], beats),
          bass: true
        });
      } catch (e) {
        btn.textContent = '这台设备放不出声音';
        return;
      }
      btn.textContent = '■ 停止';
      btn.classList.add('on');
      S.grid.follow(function () { return S.handle ? S.handle.position() : null; });
    };

    $('#check').onclick = function () {
      const r = ML.checkMelody(step, S.melody || [], chords);
      feedback(fb, r.msg, r.ok ? 'ok' : 'no');
      S.gated = r.ok;
      refreshGate();
    };
  }

  /* ---------------- rhythm ---------------- */

  function renderRhythm(stage, step) {
    const dual = !!step.dual;
    const tab = S.rhyTab || 0;

    stage.innerHTML =
      '<p class="instr">' + fmt(step.instruction) + '</p>' +
      (dual
        ? '<div class="seg tabs" id="tabs">' +
            '<button data-tab="0" class="' + (tab === 0 ? 'on' : '') + '">主歌型</button>' +
            '<button data-tab="1" class="' + (tab === 1 ? 'on' : '') + '">副歌型</button>' +
          '</div>'
        : '') +
      '<div class="build-tools">' +
        '<button class="btn play" id="play">▶ 播放</button>' +
        '<button class="btn" id="check">检查</button>' +
        '<span class="spacer"></span>' +
        '<button class="chip" id="clear">清空' + (dual ? '这一套' : '') + '</button>' +
      '</div>' +
      '<div class="roll-wrap"><canvas id="rhy" class="roll rhy"></canvas></div>' +
      '<div class="feedback" id="fb" hidden></div>' +
      (step.hint ? '<p class="hint">' + fmt(step.hint) + '</p>' : '');

    const fb = $('#fb');
    const btn = $('#play');
    const chords = harmonyFor(S.lesson);

    S.grid = new PR.RhythmGrid($('#rhy'), {
      pattern: S.drums.patterns[tab],
      onChange: function (p) {
        S.drums.patterns[S.rhyTab || 0] = p;
        MP.saveDrums(S.lesson.id, S.drums);
        if (S.handle) S.handle.setDrums(S.drums);
      }
    });

    if (dual) {
      $$('#tabs button').forEach(function (b) {
        b.onclick = function () {
          S.rhyTab = Number(b.dataset.tab);
          $$('#tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
          S.grid.setPattern(S.drums.patterns[S.rhyTab]);
        };
      });
    }

    btn.onclick = function () {
      if (S.handle) {
        S.handle.stop();
        S.handle = null;
        btn.textContent = '▶ 播放';
        btn.classList.remove('on');
        S.grid.follow(null);
        return;
      }
      try {
        S.handle = MA.play({
          bpm: step.bpm || 100,
          bars: 4,
          chordsA: chords,
          melody: slotsToNotes(S.melody || [], 4),
          drums: S.drums,
          bass: true
        });
      } catch (e) {
        btn.textContent = '这台设备放不出声音';
        return;
      }
      btn.textContent = '■ 停止';
      btn.classList.add('on');
      S.grid.follow(function () { return S.handle ? S.handle.position() : null; });
    };

    $('#check').onclick = function () {
      const r = checkRhythm(step, S.drums);
      feedback(fb, r.msg, r.ok ? 'ok' : 'no');
      S.gated = r.ok;
      refreshGate();
    };

    $('#clear').onclick = function () {
      S.drums.patterns[S.rhyTab || 0] = PR.emptyPattern();
      S.grid.setPattern(S.drums.patterns[S.rhyTab || 0]);
      MP.saveDrums(S.lesson.id, S.drums);
      if (S.handle) S.handle.setDrums(S.drums);
      S.gated = false;
      refreshGate();
    };
  }

  /* ---------------- checklist ---------------- */

  function renderChecklist(stage, step) {
    const saved = MP.getChecks(S.lesson.id) || [];
    const checks = step.items.map(function (_, i) { return !!saved[i]; });

    stage.innerHTML =
      (step.intro ? '<p class="instr">' + fmt(step.intro) + '</p>' : '') +
      '<ul class="checks" id="checks">' +
        step.items.map(function (it, i) {
          return '<li><label class="check' + (checks[i] ? ' on' : '') + '">' +
            '<input type="checkbox" data-i="' + i + '"' + (checks[i] ? ' checked' : '') + '>' +
            '<span class="box" aria-hidden="true"></span>' +
            '<span class="txt">' + esc(it) + '</span>' +
          '</label></li>';
        }).join('') +
      '</ul>' +
      '<div class="feedback" id="fb" hidden></div>';

    const fb = $('#fb');

    function update() {
      const arr = $$('#checks input').map(function (x) { return x.checked; });
      MP.saveChecks(S.lesson.id, arr);
      $$('.check').forEach(function (l, i) { l.classList.toggle('on', arr[i]); });
      const done = arr.filter(Boolean).length;
      S.gated = done === arr.length;
      feedback(fb, done === arr.length
        ? '全做完了。这一课没有别的要求——去听你自己的歌。'
        : '还有 ' + (arr.length - done) + ' 条没勾。做完一条勾一条，不用一次做完。',
        done === arr.length ? 'ok' : '');
      refreshGate();
    }

    $('#checks').onchange = update;

    if (checks.every(Boolean)) {
      feedback(fb, '全做完了。', 'ok');
    }
  }

  /* ---------------- quiz ---------------- */

  function renderQuiz(stage, step) {
    const isOffBeat = step.quizType === 'offStrongBeat';
    const isLastChord = step.quizType === 'lastChord';
    const isBreath = step.quizType === 'breathBar';
    const isAlways = step.quizType === 'alwaysRow';
    let truth;
    if (isOffBeat) {
      const bad = ML.offStrongBeats(step.chords, step.melody || [], 4, [0, 2]);
      truth = bad.length === 1 ? bad[0][0] + 1 : -1;
    } else if (isLastChord) {
      truth = MT.lastChord(step.chords);
    } else if (isBreath) {
      const bs = ML.breathBars(step.melody || [], step.chords.length);
      truth = bs.length === 1 ? bs[0] : -1;
    } else if (isAlways) {
      truth = ML.rowAlwaysOn(step.drums)[0] || '';
    } else {
      truth = MT.barsWithDegree(step.chords, S.lesson.keyPc, 5).length;
    }

    stage.innerHTML =
      '<div class="demo"><button class="btn play" id="play">▶ 听这一段</button>' +
      '<span class="caption">' + step.chords.length + ' 小节，会一直循环</span></div>' +
      '<div class="question">' + fmt(step.question) + '</div>' +
      '<div class="options grid4" id="opts">' +
        step.options.map(function (n) {
          return '<button class="opt" data-n="' + esc(n) + '">' + esc(n) + esc(step.optionSuffix || '') + '</button>';
        }).join('') +
      '</div>' +
      '<div class="feedback" id="fb" hidden></div>';

    const btn = $('#play');
    btn.onclick = function () {
      if (S.handle) {
        S.handle.stop();
        S.handle = null;
        btn.textContent = '▶ 听这一段';
        btn.classList.remove('on');
        return;
      }
      try {
        S.handle = MA.play({
          chordsA: step.chords,
          bars: step.chords.length,
          bpm: step.bpm || 100,
          melody: step.melody || [],
          drums: step.drums || null,
          bass: true
        });
      } catch (e) {
        btn.textContent = '这台设备放不出声音';
        return;
      }
      btn.textContent = '■ 停止';
      btn.classList.add('on');
    };

    $('#opts').onclick = function (e) {
      const b = e.target.closest('button.opt');
      if (!b) return;
      const fb = $('#fb');
      $$('button.opt').forEach(function (x) { x.classList.remove('ok', 'no'); });
      if (Number(b.dataset.n) === truth) {
        b.classList.add('ok');
        feedback(fb, step.why || ('对，' + truth + ' 次。'), 'ok');
        S.gated = true;
      } else {
        b.classList.add('no');
        feedback(fb, isOffBeat
          ? '再听一遍。每个小节第 1 拍那个音，和同时响的和弦贴不贴。'
          : '再数一遍。只记 A 进来的那一下，不用管别的。', 'no');
        S.gated = false;
      }
      refreshGate();
    };
  }

  /* ---------------- export ---------------- */

  function renderExport(stage, step) {
    const lesson = S.lesson;
    const base = lesson.usesHarmony ? harmonyFor(lesson) : (S.chords || []).slice();
    const melody = slotsToNotes(S.melody || [], 4);
    const rhyStep = lesson.steps.filter(function (s) { return s.kind === 'rhythm'; })[0];
    const needMelody = lesson.steps.some(function (s) { return s.kind === 'melody'; });

    // 第 8、10、12 课放两遍，凑成 8 小节
    const chords = lesson.doubleBars ? base.concat(base) : base;
    const melOut = (lesson.doubleBars && melody.length)
      ? melody.concat(melody.map(function (n) {
          return { bar: n.bar + base.length, beat: n.beat, dur: n.dur, midi: n.midi };
        }))
      : melody;

    // 不许悄悄把空小节补成 D：那也是「你写的」，但你没写
    const missing = base.map(function (c, i) { return c ? 0 : i + 1; }).filter(Boolean);
    const drums = rhyStep ? S.drums : null;
    const drumsOk = rhyStep ? checkRhythm(rhyStep, drums).ok : true;
    const complete = missing.length === 0 && (!needMelody || melody.length > 0) && drumsOk;
    const shown = base.map(function (c) { return c || '空'; });

    let warn = '';
    if (missing.length) {
      warn = '<div class="feedback no">第 ' + missing.join('、') + ' 小节还是空的。' +
        '<a href="#/' + lesson.id + '/4">回去摆完</a>再导出——导出的东西得是你写的。</div>';
    } else if (needMelody && !melody.length) {
      warn = '<div class="feedback no">旋律还是空的。' +
        '<a href="#/' + lesson.id + '/3">回去摆几个音</a>，导出才有意义。</div>';
    } else if (!drumsOk) {
      warn = '<div class="feedback no">鼓还没摆好。' +
        '<a href="#/' + lesson.id + '/3">回去把踩镲、底鼓、军鼓放齐</a>，导出才会像一首歌。</div>';
    }

    stage.innerHTML =
      '<div class="prose">' + paras(step.body) + '</div>' +
      '<div class="summary">' +
        '和弦：<b>' + esc(shown.join(' · ')) + '</b>' +
        (lesson.doubleBars ? '<br>长度：<b>8 小节</b>（你这 4 小节放两遍）' : '') +
        (melOut.length ? '<br>旋律：<b>' + melOut.length + ' 个音</b>' : '') +
        (drums ? '<br>鼓：<b>' + drumsSummary(drums) + '</b>' : '') +
      '</div>' +
      warn +
      '<div class="demo">' +
        '<button class="btn primary" id="export"' + (complete ? '' : ' disabled') + '>导出 .mid</button>' +
        '<button class="btn play" id="play"' + (complete ? '' : ' disabled') + '>▶ 再听一遍</button>' +
      '</div>' +
      '<div class="feedback" id="fb" hidden></div>' +
      (step.tip ? '<p class="hint">' + fmt(step.tip) + '</p>' : '');

    $('#export').onclick = function () {
      try {
        const bytes = MM.fromProgression({
          chords: chords,
          keyPc: lesson.keyPc,
          mode: lesson.mode,
          bpm: 96,
          melody: melOut,
          drums: drums,
          name: 'muse lab · lesson ' + lesson.no
        });
        MM.download(bytes, 'muse-lesson' + lesson.no + '-' + MT.keySign(lesson.keyPc) + 'sharp.mid');
        const parts = ['Chords', 'Bass'];
        if (drums) parts.push('Drums');
        parts.push(melOut.length ? 'Vocal（' + melOut.length + ' 个音）' : 'Vocal（空）');
        feedback($('#fb'), '导出完成。轨道：' + parts.join(' / ') + '。', 'ok');
      } catch (e) {
        feedback($('#fb'), '导出失败：' + e.message, 'no');
      }
    };

    const btn = $('#play');
    btn.onclick = function () {
      if (S.handle) {
        S.handle.stop();
        S.handle = null;
        btn.textContent = '▶ 再听一遍';
        btn.classList.remove('on');
        return;
      }
      S.handle = MA.play({
        chordsA: chords,
        bars: chords.length,
        bpm: 96,
        melody: melOut,
        drums: drums,
        bass: true
      });
      btn.textContent = '■ 停止';
      btn.classList.add('on');
    };
  }

  /* ============================================================
   * 启动
   * ============================================================ */

  /** 只在换页时播一次入场动画；页面内部重绘不播，否则点一下抖一下 */
  function pulse() {
    const app = $('#app');
    if (!app) return;
    app.classList.remove('enter');
    void app.offsetWidth;
    app.classList.add('enter');
  }

  function route() {
    const h = String(root.location.hash || '').replace(/^#\/?/, '');
    if (h === 'analyze') {
      renderAnalyze();
      pulse();
      return;
    }
    const m = /^([a-z0-9]+)\/(\d+)$/i.exec(h);
    if (m) {
      const lesson = ML.byId(m[1]);
      if (lesson) {
        openLesson(lesson, parseInt(m[2], 10) - 1);
        pulse();
        return;
      }
    }
    renderHome();
    pulse();
  }

  MP.load();
  root.addEventListener('hashchange', route);

  // 切走标签页就把声音停掉
  doc.addEventListener('visibilitychange', function () {
    if (doc.hidden) {
      teardown();
      const btn = $('.btn.play.on');
      if (btn) { btn.classList.remove('on'); btn.textContent = '▶ 播放'; }
    }
  });

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', route);
  } else {
    route();
  }

  root.App = { route: route };
})(typeof window !== 'undefined' ? window : globalThis);
