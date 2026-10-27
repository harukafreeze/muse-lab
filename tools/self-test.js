/*
 * self-test.js — 内核自检
 * 跑法：node tools/self-test.js
 *
 * 查四件事：
 *   1. 乐理内核：级数、和弦、调号
 *   2. 课程数据：每道题的答案都能被现算出来，而不是手写的
 *   3. MIDI 编码：编出来的字节能不能被解回原样
 *   4. 导出边界：音域、轨道名、长度
 *
 * 第 2 项是这个站能不能信的全部依据。题目数据写错、判据写反，
 * 界面上完全看不出来——只会安静地教错人。
 */
require('../js/theory.js');
require('../js/midi.js');
require('../js/lessons.js');

const T = globalThis.MT;
const M = globalThis.MM;
const L = globalThis.ML;

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

/* ============================================================
 * 1. 乐理
 * ============================================================ */

console.log('\n[1] 乐理内核');

ok(T.pc('F#') === 6 && T.pc('Bb') === 10, '音名解析');
ok(T.parseChord('D').quality === 'maj' && T.parseChord('F#m').quality === 'min', '和弦后缀解析');
ok(T.parseChord('A7').quality === 'dom7' && T.parseChord('Gmaj7').intervals.length === 4, '七和弦解析');
ok(JSON.stringify(T.chordNotes('D')) === '[50,54,57]', 'D 和弦 = D3 F#3 A3', T.chordNotes('D'));

const vD = T.voicing('D');
ok(vD.bass === 38 && vD.notes[0] === 50, 'D 的根音在 C3 一带，低音低一个八度', vD);

ok(T.degreeOf('D', 2) === 1, 'D 在 D 大调是第 1 级');
ok(T.degreeOf('A', 2) === 5, 'A 在 D 大调是第 5 级');
ok(T.degreeOf('F#m', 2) === 3, 'F#m 在 D 大调是第 3 级');
ok(T.degreeOf('C', 2) === 0, '调外和弦返回 0');

ok(T.keySign(2) === 2, 'D 大调两个升号');
ok(T.keyName(2) === 'D major', '调名 D major');

ok(T.endsOnTonic(['D', 'A', 'D', 'D'], 2) === true, 'D-A-D-D 落在主和弦');
ok(T.endsOnTonic(['D', 'A', 'D', 'A'], 2) === false, 'D-A-D-A 没落回主和弦');
ok(T.endsOnTonic(['D', null, 'A'], 2) === false, '末尾是空小节时向前找最后一个和弦');

ok(T.barsWithDegree(['D', 'A', 'D', 'A', 'D', 'D', 'A', 'D'], 2, 5).length === 3, 'A 出现在第 2/4/7 小节（3 次）');
ok(T.keySign(9, 'minor') === 0, 'A 小调与 C 大调共用调号（0 个升降号）', T.keySign(9, 'minor'));

/* 小调 */
ok(T.scalePcs(9, 'minor').join(',') === '9,11,0,2,4,5,7', 'A 小调音阶', T.scalePcs(9, 'minor'));
ok(T.diatonicChord(9, 1, 'minor').name === 'Am', 'A 小调 i = Am');
ok(T.diatonicChord(9, 3, 'minor').name === 'C', 'A 小调 III = C（大三和弦）');
ok(T.diatonicChord(9, 7, 'minor').name === 'G', 'A 小调 VII = G');
ok(T.diatonicChord(2, 3, 'major').name === 'F#m', 'D 大调 iii 还是 F#m（没被改坏）');
ok(T.degreeOf('C', 9, 'minor') === 3, 'C 在 A 小调是第 3 级');
ok(T.degreeOf('C', 2, 'major') === 0, 'C 在 D 大调仍然是调外');
ok(T.romanOf('Am', 9, 'minor') === 'i', 'A 小调 Am → i');
ok(T.romanOf('C', 9, 'minor') === 'III', 'A 小调 C → III');
ok(T.romanOf('Bdim', 9, 'minor') === 'ii°', 'A 小调 Bdim → ii°');
ok(T.romanOf('E', 9, 'minor') === 'V', 'A 小调里的 E 大三和弦显示成 V（和声小调的 V）');
ok(T.keyName(9, 'minor') === 'A minor', '调名 A minor', T.keyName(9, 'minor'));

/* ============================================================
 * 2. 课程
 * ============================================================ */

console.log('\n[2] 课程数据（答案必须由 MT 现算）');

ok(L.LESSONS.length > 0, '至少有一课');

L.LESSONS.forEach(function (lesson) {
  const keyPc = lesson.keyPc;
  const mode = lesson.mode || 'major';
  const tag = '第 ' + lesson.no + ' 课';

  // 所有和弦写法都能解析
  const chords = L.chordsInLesson(lesson);
  let bad = null;
  chords.forEach(function (c) {
    try { T.parseChord(c); } catch (e) { bad = c + ' → ' + e.message; }
  });
  ok(!bad, tag + ' 和弦写法全部可解析（' + chords.length + ' 个）', bad);

  // 调内
  const outOfKey = chords.filter(function (c) { return T.degreeOf(c, keyPc, mode) === 0; });
  ok(outOfKey.length === 0, tag + ' 和弦全部在调内', outOfKey);

  lesson.steps.forEach(function (step, i) {
    const where = tag + ' 第 ' + (i + 1) + ' 步「' + step.title + '」';
    ok(!!step.kind && !!step.title, where + ' 字段完整');

    if (step.kind === 'ab') {
      ok(step.chordsA.length === step.chordsB.length, where + ' A/B 两版长度一致');
      if (step.abRule === 'hasDrums') {
        ok(JSON.stringify(step.chordsA) === JSON.stringify(step.chordsB),
          where + ' 和弦相同，差别只在鼓');
      } else {
        ok(JSON.stringify(step.chordsA) !== JSON.stringify(step.chordsB), where + ' A/B 两版确实不同');
      }

      let answer;
      if (step.abRule === 'endsOnDegree') {
        const a = T.degreeOf(T.lastChord(step.chordsA), keyPc);
        const b = T.degreeOf(T.lastChord(step.chordsB), keyPc);
        ok((a === step.degree) !== (b === step.degree),
          where + ' 恰好一版落在第 ' + step.degree + ' 级（题目可解）', { a, b });
        answer = a === step.degree ? 'a' : 'b';
      } else if (step.abRule === 'endsOnTonic') {
        const a = T.endsOnTonic(step.chordsA, keyPc);
        const b = T.endsOnTonic(step.chordsB, keyPc);
        ok(a !== b, where + ' 恰好一版落回主和弦（题目可解）', { a, b });
        answer = a ? 'a' : 'b';
      } else if (step.abRule === 'hasDrums') {
        const a = L.hasDrums(step.drumsA);
        const b = L.hasDrums(step.drumsB);
        ok(a !== b, where + ' 恰好一版有鼓（题目可解）', { a, b });
        answer = a ? 'a' : 'b';
      } else {
        const ea = T.endsOnTonic(step.chordsA, keyPc);
        const eb = T.endsOnTonic(step.chordsB, keyPc);
        // 必须有且只有一版「没回家」，否则这道题没有答案
        ok(ea !== eb, where + ' 恰好一版没落回主和弦（题目可解）', { ea, eb });
        answer = ea ? 'b' : 'a';
      }

      ok(step.options.some(function (o) { return o.key === answer; }), where + ' 选项里含现算答案 ' + answer);
      if (step.melody) {
        const inRange = step.melody.every(function (n) { return n.midi > 40 && n.midi < 90; });
        ok(inRange, where + ' 旋律在可用音域内');
      }
    }

    if (step.kind === 'quiz') {
      let truth, label;
      if (step.quizType === 'offStrongBeat') {
        const bad = L.offStrongBeats(step.chords, step.melody, 4, [0, 2]);
        ok(bad.length === 1, where + ' 恰好一处强拍违规（否则这题没答案）', bad);
        truth = bad.length === 1 ? bad[0][0] + 1 : -1;
        label = '第 ' + truth + ' 小节';
      } else if (step.quizType === 'lastChord') {
        truth = T.lastChord(step.chords);
        label = '「' + truth + '」';
      } else if (step.quizType === 'breathBar') {
        const bs = L.breathBars(step.melody, step.chords.length);
        ok(bs.length === 1, where + ' 恰好一处换气（否则这题没答案）', bs);
        truth = bs.length === 1 ? bs[0] : -1;
        label = '第 ' + truth + ' 小节';
      } else if (step.quizType === 'alwaysRow') {
        const on = L.rowAlwaysOn(step.drums);
        ok(on.length === 1, where + ' 恰好一排整小节都在响（否则这题没答案）', on);
        truth = on[0] || '';
        label = '「' + truth + '」';
      } else if (step.quizType === 'bassDir') {
        truth = L.bassDirection(step.chords);
        ok(truth !== '基本不动', where + ' 低音走向明确（否则这题没答案）', truth);
        label = '「' + truth + '」';
      } else {
        truth = T.barsWithDegree(step.chords, keyPc, 5).length;
        label = '「' + truth + ' 次」';
      }
      ok(step.options.indexOf(truth) >= 0, where + ' 选项里含现算答案' + label, step.options);
      ok(step.options.filter(function (n) { return n === truth; }).length === 1, where + ' 答案唯一');
    }

    if (step.kind === 'rhythm') {
      const rules = step.rules || {};
      const mk = function () {
        return { hats: [0, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], kick: [0, 0, 0, 0, 0, 0, 0, 0] };
      };
      const build = function (r) {
        const p = mk();
        for (let i = 0; i < 8; i++) p.hats[i] = 1;
        (r.kickAt || []).forEach(function (i) { p.kick[i] = 1; });
        (r.snareAt || []).forEach(function (i) { p.snare[i] = 1; });
        return p;
      };

      if (step.dual) {
        const st = { rules: rules };
        const verse = build(rules.verse || {});
        const chorus = build(rules.chorus || {});

        ok(L.checkDrums2(st, { patterns: [verse, chorus], map: [0, 0, 1, 1] }).ok,
          where + ' 两套的骨格都齐了就算成立', L.checkDrums2(st, { patterns: [verse, chorus] }).msg);

        // 副歌换成主歌的密度 → 不成立
        const same = L.checkDrums2(st, { patterns: [verse, verse] });
        ok(!same.ok, where + ' 副歌跟主歌一样就通不过', same.msg);

        // 主歌军鼓跑到第 2 拍（不是 half-time）→ 不成立
        const badVerse = JSON.parse(JSON.stringify(verse));
        badVerse.snare[2] = 1;
        ok(!L.checkDrums2(st, { patterns: [badVerse, chorus] }).ok, where + ' 主歌军鼓跑到第 2 拍会被拦下来');

        // 主歌塞满额外底鼓、副歌不变 → 密度差不够，要拦
        const fatVerse = JSON.parse(JSON.stringify(verse));
        fatVerse.kick[2] = 1;
        fatVerse.kick[6] = 1;
        const notDense = L.checkDrums2(st, { patterns: [fatVerse, chorus] });
        ok(!notDense.ok, where + ' 副歌只比主歌多不到 2 下，会被拦下来', notDense.msg);
      } else {
        ok(!L.checkDrums(step, mk()).ok, where + ' 空鼓点会被拦下来');

        const good = build(rules);
        const r = L.checkDrums(step, good);
        ok(r.ok, where + ' 约束有解（八分踩镲 + 底鼓 + 军鼓）', r.msg);

        const noHat = JSON.parse(JSON.stringify(good));
        noHat.hats[3] = 0;
        ok(!L.checkDrums(step, noHat).ok, where + ' 缺一格踩镲会被拦下来');

        if (rules.snareAt && rules.snareAt.length) {
          const noSnare = JSON.parse(JSON.stringify(good));
          noSnare.snare[rules.snareAt[0]] = 0;
          ok(!L.checkDrums(step, noSnare).ok, where + ' 少一个军鼓会被拦下来');
        }
      }
    }

    if (step.kind === 'melody') {      const chords = lesson.defaultHarmony;
      ok(!!chords, where + ' 有默认和声可供自检');
      ok(step.palette.length >= 4, where + ' 音板够用', step.palette);

      // 用音板里的和弦音拼一个合法解，看看这套约束有没有解
      const beats = 4;
      const palette = step.palette;
      const rules = step.rules || {};
      const slots = new Array(step.bars * beats).fill(null);
      for (let bar = 0; bar < step.bars; bar++) {
        const pcs = T.chordNotes(chords[bar]).map(function (m) { return ((m % 12) + 12) % 12; });
        const tones = palette.filter(function (m) { return pcs.indexOf(((m % 12) + 12) % 12) >= 0; });
        slots[bar * beats] = tones[0];
        // 第 2 格跟第 1 格同音 —— 这就是一个两拍长音
        slots[bar * beats + 1] = tones[0];
        slots[bar * beats + 2] = tones[tones.length - 1];
        slots[bar * beats + 3] = palette[(bar + 2) % palette.length];
      }
      // 该换气的地方擦干净（长音已经放在第 1、2 格，不会被擦掉）
      (rules.restBeats || []).forEach(function (r) { slots[r.bar * beats + r.beat] = null; });

      const good = L.checkMelody(step, slots, chords);
      ok(good.ok, where + ' 约束有解（按音板拼出来的那句能过）', good.msg);

      // 空的和弦音违规必须被拦下来
      const badSlots = slots.slice();
      const bar0pcs = T.chordNotes(chords[0]).map(function (m) { return ((m % 12) + 12) % 12; });
      const off = palette.filter(function (m) { return bar0pcs.indexOf(((m % 12) + 12) % 12) < 0; })[0];
      badSlots[0] = off;
      const bad = L.checkMelody(step, badSlots, chords);
      ok(!bad.ok, where + ' 强拍放和弦外的音会被拦下来', bad.msg);

      const empty = L.checkMelody(step, new Array(step.bars * beats).fill(null), chords);
      ok(!empty.ok, where + ' 空旋律会被拦下来');
    }

    if (step.kind === 'build') {
      const allowed = step.allowed;
      ok(allowed.every(function (c) { return T.degreeOf(c, keyPc, mode) > 0; }), where + ' 允许的和弦都在调内', allowed);

      // 穷举：这套约束必须至少有一个解
      let found = null;
      const total = Math.pow(allowed.length, step.bars);
      for (let m = 0; m < total && !found; m++) {
        const cs = [];
        let x = m;
        for (let k = 0; k < step.bars; k++) { cs.push(allowed[x % allowed.length]); x = Math.floor(x / allowed.length); }
        if (L.checkBuild(step, cs).ok) found = cs;
      }
      ok(!!found, where + ' 约束有解（穷举 ' + total + ' 种）', found);
      ok(found && L.checkBuild(step, found).ok, where + ' 解能通过检查');

      // 初始状态不能已经通过，否则这一步没事可做
      if (step.initial) {
        ok(!L.checkBuild(step, step.initial).ok || step.initial.some(function (c) { return !c; }),
          where + ' 初始状态不是已通过（还要动手）', step.initial);
      }

      // 允许的每一种排法都得能被叫出名字（第 8 课的「我告诉你排出来的是哪个」靠它）
      if (step.nameIt) {
        const bars = step.bars;
        const out = [];
        (function arrange(list, prefix) {
          if (prefix.length === bars) { out.push(prefix); return; }
          list.forEach(function (c, i) {
            arrange(list.slice(0, i).concat(list.slice(i + 1)), prefix.concat(c));
          });
        })(allowed.slice(), []);

        const valid = out.filter(function (p) { return L.checkBuild(step, p).ok; });

        // 首小节固定 → 剩下 (n-1) 个里挑 (bars-1) 个排列
        let expect = 1;
        for (let i = 0; i < bars - 1; i++) expect *= (allowed.length - 1 - i);
        ok(valid.length === expect, where + ' 合法排法 ' + expect + ' 种', valid.length);

        if (step.nameIt === 'all') {
          const unnamed = valid.filter(function (p) { return !L.progressionName(p, keyPc, mode).name; });
          ok(unnamed.length === 0, where + ' 每一种排法都有名字', unnamed);
        } else {
          const named = valid.filter(function (p) { return !!L.progressionName(p, keyPc, mode).name; });
          ok(named.length > 0, where + ' 至少有排法能被叫出名字', named.length);
        }
      }
    }

    if (step.kind === 'checklist') {
      ok(step.items.length >= 3, where + ' 至少 3 条', step.items.length);
      const uniq = step.items.filter(function (v, i, a) { return a.indexOf(v) === i; });
      ok(uniq.length === step.items.length, where + ' 没有重复条目');
    }

    if (step.kind === 'text' && step.demo) {
      ok(step.demo.chords.length >= 4, where + ' 试听至少 4 小节');
    }
  });
});

/* ============================================================
 * 2b. 范例必须遵守自己教的规则
 * ============================================================ */

console.log('\n[2b] 范例自洽');

const L10 = L.byId('l10');
const melStep10 = L10.steps.filter(function (s) { return s.kind === 'melody'; })[0];
const demo10 = L10.steps.filter(function (s) { return s.demo && s.demo.melody; })[0].demo;
const slots10 = L.melodyToSlots(demo10.melody, 4, 4);

const r10 = L.checkMelody(melStep10, slots10, demo10.chords);
ok(r10.ok, '第 10 课的示范旋律通过这一课自己的规则', r10.msg);

const bb = L.breathBars(demo10.melody, 4);
ok(bb.join(',') === '2,4', '示范在第 2、4 小节换气', bb);

// 把两处换气填上，必须被拦下来 —— 否则这条规则形同虚设
const noRest = slots10.slice();
noRest[7] = 66;
noRest[15] = 69;
const nr = L.checkMelody(melStep10, noRest, demo10.chords);
ok(!nr.ok, '补上换气拍以后通不过', nr.msg);

// 两句收尾都改成同一个音，也必须被拦下来
const sameEnd = slots10.slice();
sameEnd[15] = null;
sameEnd[14] = slots10[6];           // 让第 4 小节最后一个音和第 2 小节一样
const se = L.checkMelody(melStep10, sameEnd, demo10.chords);
ok(!se.ok, '两句收尾相同会被拦下来', se.msg);

/* ============================================================
 * 2c. 认进行
 * ============================================================ */

console.log('\n[2c] 认进行');

const p1564 = L.progressionName(['D', 'A', 'Bm', 'G'], 2);
ok(p1564.degrees === '1-5-6m-4', 'D–A–Bm–G 认成 1-5-6m-4', p1564);
ok(!!p1564.name, '有大调里的名字', p1564.name);

const p1645 = L.progressionName(['D', 'G', 'A', 'Bm'], 2);
ok(p1645.degrees === '1-4-5-6m', 'D–G–A–Bm 认成 1-4-5-6m', p1645);
ok(!!p1645.name, '有名字', p1645.name);

// 移调到 E 大调，写法和级数都不该变
const pE = L.progressionName(['E', 'B', 'C#m', 'A'], 4);
ok(pE.degrees === '1-5-6m-4', 'E 大调里同样的进行还是 1-5-6m-4', pE);

const pUnknown = L.progressionName(['D', 'A', 'Bm', 'A'], 2);
ok(pUnknown.name === null, '认不出来的进行返回 null，不硬编', pUnknown);

/* 拆歌工具读出来的那张卡片 */
const an = L.analyzeProgression(['D', 'A', 'Bm', 'G'], 2);
ok(an.degrees === '1-5-6m-4', '分析卡：级数', an.degrees);
ok(an.roman === 'I–V–vi–IV', '分析卡：罗马数字', an.roman);
ok(an.bass === 'D–A–B–G', '分析卡：低音线', an.bass);
ok(an.endsHome === false && an.lastRoman === 'IV', '分析卡：没回主和弦，停在 IV', an);
ok(an.name && an.name.indexOf('王道') >= 0, '分析卡：带名字', an.name);

const an2 = L.analyzeProgression(['D', 'A', 'Bm', 'D'], 2);
ok(an2.endsHome === true, '分析卡：回主和弦能认出来', an2);

/* 小调的分析卡 */
const anM = L.analyzeProgression(['Am', 'F', 'C', 'G'], 9, 'minor');
ok(anM.roman === 'i–VI–III–VII', '小调分析卡：罗马数字', anM.roman);
ok(anM.degrees === '1m-6-3-7', '小调分析卡：级数', anM.degrees);
ok(anM.name && anM.name.indexOf('小调') >= 0, '小调分析卡：带名字', anM.name);
ok(anM.endsHome === false, '小调分析卡：停在 G 上，没回主和弦', anM.endsHome);

const anM2 = L.analyzeProgression(['Am', 'F', 'C', 'G'], 9, 'minor');
ok(anM2.lastRoman === 'VII', '小调分析卡：最后一格是 VII', anM2.lastRoman);

ok(L.analyzeProgression([], 2) === null, '空序列返回 null');

/* ============================================================
 * 3. MIDI 编码
 * ============================================================ */

console.log('\n[3] MIDI 编码');

function parseMidi(bytes) {
  const b = Array.prototype.slice.call(bytes);
  let i = 0;
  function u32() { const v = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0; i += 4; return v; }
  function u16() { const v = (b[i] << 8) | b[i + 1]; i += 2; return v; }

  const head = String.fromCharCode(b[0], b[1], b[2], b[3]);
  i = 4;
  u32();
  const format = u16(), ntrks = u16(), div = u16();

  const tracks = [];
  while (i < b.length - 7 && String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]) === 'MTrk') {
    i += 4;
    const tlen = u32();
    const end = i + tlen;
    let tick = 0, running = 0;
    const evs = [];
    while (i < end) {
      let delta = 0, c;
      do { c = b[i++]; delta = (delta << 7) | (c & 0x7f); } while (c & 0x80);
      tick += delta;
      let status = b[i];
      if (status & 0x80) i++; else status = running;

      if (status === 0xFF) {
        const type = b[i++];
        let len = 0;
        do { c = b[i++]; len = (len << 7) | (c & 0x7f); } while (c & 0x80);
        const data = b.slice(i, i + len);
        i += len;
        evs.push({ tick: tick, meta: type, data: data });
        if (type === 0x2F) break;
      } else {
        running = status;
        const hi = status & 0xF0;
        if (hi === 0xC0 || hi === 0xD0) {
          i += 1;
          evs.push({ tick: tick, kind: 'program', ch: status & 15, data: [b[i - 1]] });
        } else {
          const d1 = b[i], d2 = b[i + 1];
          i += 2;
          evs.push({
            tick: tick,
            kind: hi === 0x90 ? 'on' : hi === 0x80 ? 'off' : 'ctrl',
            ch: status & 15,
            midi: d1,
            vel: d2
          });
        }
      }
    }
    i = end;
    const nameEv = evs.filter(function (e) { return e.meta === 0x03; })[0];
    const name = nameEv ? Buffer.from(nameEv.data).toString('utf8') : '';
    tracks.push({ name: name, evs: evs, endTick: evs[evs.length - 1].tick });
  }
  return { head: head, format: format, ntrks: ntrks, div: div, tracks: tracks, raw: b };
}

const bytes = M.fromProgression({ chords: ['D', 'A', 'D', 'D'], keyPc: 2, bpm: 96 });
const mid = parseMidi(bytes);

// 第 8 课的导出：4 小节放两遍 = 8 小节
const eight = parseMidi(M.fromProgression({
  chords: ['D', 'A', 'Bm', 'G', 'D', 'A', 'Bm', 'G'],
  keyPc: 2,
  bpm: 96
}));
ok(eight.tracks[1].evs.filter(function (e) { return e.kind === 'on'; }).length === 24,
  '8 小节 = 24 个和弦音（8 × 3）');
ok(eight.tracks[3].endTick === 8 * 1920, '8 小节长度', eight.tracks[3].endTick);

// 带鼓导出：Drums 轨，第 10 通道，通用 MIDI 打击乐音高
const DRUM_TEST = {
  hats: [1, 1, 1, 1, 1, 1, 1, 1],
  snare: [0, 0, 1, 0, 0, 0, 1, 0],
  kick: [1, 0, 0, 0, 1, 0, 0, 0]
};
const drumMidi = parseMidi(M.fromProgression({
  chords: ['D', 'A', 'D', 'D'],
  keyPc: 2,
  bpm: 96,
  drums: DRUM_TEST
}));
const drumTrack = drumMidi.tracks.filter(function (t) { return t.name === 'Drums'; })[0];
ok(!!drumTrack, '导出了 Drums 轨', drumMidi.tracks.map(function (t) { return t.name; }));

const drumOns = drumTrack ? drumTrack.evs.filter(function (e) { return e.kind === 'on'; }) : [];
ok(drumOns.length === 48, '4 小节 × (8 镲 + 2 军鼓 + 2 底鼓) = 48 个音', drumOns.length);
ok(drumOns.every(function (e) { return e.ch === 9; }), '鼓在通用 MIDI 第 10 通道（channel 9）');
ok(drumOns.filter(function (e) { return e.midi === 36; }).length === 8, '底鼓音高 36，两个一拍共 8 个');
ok(drumOns.filter(function (e) { return e.midi === 38; }).length === 8, '军鼓音高 38');
ok(drumOns.filter(function (e) { return e.midi === 42; }).length === 32, '闭合踩镲音高 42，每小节 8 个');

// 两套鼓 + 每小节用哪套：前两小节主歌型，后两小节副歌型
const VERSE_T = { hats: [1,1,1,1,1,1,1,1], snare: [0,0,0,0,1,0,0,0], kick: [1,0,0,0,0,0,0,0] };
const CHORUS_T = { hats: [1,1,1,1,1,1,1,1], snare: [0,0,1,0,0,0,1,0], kick: [1,0,0,0,1,0,0,0] };
const dualMidi = parseMidi(M.fromProgression({
  chords: ['D', 'A', 'D', 'D'],
  keyPc: 2,
  bpm: 96,
  drums: { patterns: [VERSE_T, CHORUS_T], map: [0, 0, 1, 1] }
}));
const dualDrums = dualMidi.tracks.filter(function (t) { return t.name === 'Drums'; })[0];
const dualOns = dualDrums ? dualDrums.evs.filter(function (e) { return e.kind === 'on'; }) : [];
ok(dualOns.filter(function (e) { return e.midi === 38; }).length === 6,
  '两套鼓：军鼓 1+1+2+2 = 6 个（map 生效）', dualOns.filter(function (e) { return e.midi === 38; }).length);
ok(dualOns.filter(function (e) { return e.midi === 36; }).length === 6,
  '两套鼓：底鼓 1+1+2+2 = 6 个');

ok(mid.head === 'MThd', '头是 MThd');
ok(mid.format === 1, 'SMF Type 1');
ok(mid.div === 480, '每四分音符 480 tick');
ok(mid.ntrks === 4 && mid.tracks.length === 4, '4 条轨：走带 + Chords + Bass + Vocal', { ntrks: mid.ntrks, got: mid.tracks.length });

const cond = mid.tracks[0];
const tempo = cond.evs.filter(function (e) { return e.meta === 0x51; })[0];
const us = tempo ? (tempo.data[0] << 16) | (tempo.data[1] << 8) | tempo.data[2] : 0;
ok(us === 625000, '速度 96 BPM 编码正确（625000 µs）', us);

const keySig = cond.evs.filter(function (e) { return e.meta === 0x59; })[0];
ok(keySig && keySig.data[0] === 2 && keySig.data[1] === 0, '调号 D 大调 = 2 个升号', keySig && keySig.data);

const names = mid.tracks.map(function (t) { return t.name; });
ok(names[1] === 'Chords' && names[2] === 'Bass' && names[3] === 'Vocal', '轨道名 Chords / Bass / Vocal', names);

const chordOns = mid.tracks[1].evs.filter(function (e) { return e.kind === 'on'; });
ok(chordOns.length === 12, 'Chords 轨 12 个音（4 小节 × 三和弦）', chordOns.length);

const bassOns = mid.tracks[2].evs.filter(function (e) { return e.kind === 'on'; });
ok(bassOns.length === 4, 'Bass 轨 4 个音', bassOns.length);

const vocalOns = mid.tracks[3].evs.filter(function (e) { return e.kind === 'on'; });
ok(vocalOns.length === 0, 'Vocal 轨是空的');
ok(mid.tracks[3].endTick === 4 * 480 * 4, 'Vocal 轨长度 = 4 小节（空的也要有长度）', mid.tracks[3].endTick);

// 时值：每小节的第一个音必须落在小节线上
const barlines = chordOns.map(function (e) { return e.tick; }).filter(function (t) { return t % 1920 === 0; });
ok(barlines.length === 12, '所有和弦音都落在小节线上', barlines);

// 带旋律导出：旋律必须进 Vocal 轨，且落在拍子上
const withMel = M.fromProgression({
  chords: ['D', 'A', 'D', 'D'],
  keyPc: 2,
  bpm: 96,
  melody: [{ bar: 0, beat: 0, dur: 2, midi: 69 }, { bar: 1, beat: 2, dur: 1, midi: 71 }]
});
const wm = parseMidi(withMel);
const vnote = wm.tracks[3].evs.filter(function (e) { return e.kind === 'on'; });
ok(vnote.length === 2, '旋律进了 Vocal 轨（2 个音）', vnote.map(function (n) { return n.midi; }));
ok(vnote[0].midi === 69 && vnote[1].midi === 71, '音高原样保留');
ok(vnote[0].tick === 0 && vnote[1].tick === 1920 + 960, '旋律落在拍子上', vnote.map(function (n) { return n.tick; }));
const off0 = wm.tracks[3].evs.filter(function (e) { return e.kind === 'off' && e.midi === 69; })[0];
ok(off0 && off0.tick === 960, '时值 2 拍 = 960 tick', off0 && off0.tick);

/* ============================================================
 * 4. 边界
 * ============================================================ */

console.log('\n[4] 边界');

let outOfRange = [];
L.LESSONS.forEach(function (l) {
  L.chordsInLesson(l).forEach(function (c) {
    T.voicing(c).notes.forEach(function (n) {
      if (n < 0 || n > 127) outOfRange.push(c + ' → ' + n);
    });
  });
});
ok(outOfRange.length === 0, '所有和弦音在 MIDI 音域内', outOfRange);

const silent = M.fromProgression({ chords: ['D', null, 'A', null], keyPc: 2 });
ok(silent.length > 0, '带空小节也能编码');

const big = M.fromProgression({ chords: new Array(16).fill('D'), keyPc: 2 });
const bigMid = parseMidi(big);
ok(bigMid.tracks[3].endTick === 16 * 1920, '16 小节长度正确', bigMid.tracks[3].endTick);

/* ============================================================
 * 5. 走带与 A/B（用桩件模拟 AudioContext）
 *
 * 声音本身没法在 node 里听，但「什么时候该响」可以查。
 * 这一段专治两种从界面完全看不出来的错：
 *   1. 循环回不到第 1 小节（第二遍开始就漂）
 *   2. A/B 切换不是落在小节线上（学习者听到的差别里掺了抖动）
 * ============================================================ */

console.log('\n[5] 走带与 A/B');

const OSC = [];
const GAINS = [];
let TICK = null;

function makeParam(log, v) {
  function rec(type, val, t) { log.push({ type: type, v: val, t: t }); }
  return {
    value: v,
    setValueAtTime: function (val, t) { rec('set', val, t); return this; },
    setTargetAtTime: function (val, t) { rec('target', val, t); return this; },
    exponentialRampToValueAtTime: function (val, t) { rec('ramp', val, t); return this; },
    linearRampToValueAtTime: function (val, t) { rec('lin', val, t); return this; },
    cancelScheduledValues: function (t) { rec('cancel', 0, t); return this; }
  };
}

function makeNode(kind) {
  const log = [];
  const node = { kind: kind, log: log };
  node.gain = makeParam(log, 1);
  node.frequency = makeParam(log, 440);
  node.detune = makeParam(log, 0);
  node.Q = makeParam(log, 1);
  node.threshold = makeParam(log, -24);
  node.ratio = makeParam(log, 12);
  node.attack = makeParam(log, 0.003);
  node.release = makeParam(log, 0.25);
  node.knee = makeParam(log, 30);
  node.pan = makeParam(log, 0);
  node.connect = function () { return node; };
  node.disconnect = function () {};
  return node;
}

const CTX = {
  currentTime: 0,
  state: 'running',
  sampleRate: 44100,
  destination: { connect: function () {}, disconnect: function () {} },
  resume: function () {},
  createGain: function () { const n = makeNode('gain'); GAINS.push(n); return n; },
  createBiquadFilter: function () { return makeNode('filter'); },
  createDynamicsCompressor: function () { return makeNode('comp'); },
  createStereoPanner: function () { return makeNode('pan'); },
  createConvolver: function () { const n = makeNode('convolver'); n.buffer = null; return n; },
  createBuffer: function (ch, len) {
    return {
      length: len,
      getChannelData: function () { return new Float32Array(len); }
    };
  },
  createOscillator: function () {
    const n = makeNode('osc');
    n.start = function (t) { OSC.push({ t: t, kind: 'osc', f: n.frequency.value }); };
    n.stop = function () {};
    return n;
  },
  createBufferSource: function () {
    const n = makeNode('buf');
    n.buffer = null;
    n.start = function (t) { OSC.push({ t: t, kind: 'buf' }); };
    n.stop = function () {};
    return n;
  }
};

globalThis.AudioContext = function () { return CTX; };
globalThis.setInterval = function (fn) { TICK = fn; return 1; };
globalThis.clearInterval = function () { TICK = null; };

require('../js/audio.js');
const A = globalThis.MA;

const BAR = 2.5;      // 96 BPM，4/4
const T0 = 0.08;      // 起播留的 80ms

A.play({
  chordsA: ['D', 'A', 'D', 'D'],
  chordsB: ['D', 'A', 'D', 'A'],
  bars: 4,
  bpm: 96,
  bass: true,
  melody: [{ bar: 0, beat: 0, dur: 1, midi: 69 }]
});

function startsAt(t) {
  return OSC.filter(function (o) { return Math.abs(o.t - t) < 1e-6; }).length;
}
function tickTo(t) { CTX.currentTime = t; if (TICK) TICK(); }

function role(name) { return GAINS.filter(function (n) { return n._role === name; })[0]; }

ok(!!role('master') && !!role('busA') && !!role('busB') && !!role('busMel'),
  '总线齐了：master / busA / busB / busMel');
ok(startsAt(T0) > 0, '第 1 小节排在第 1 条小节线上（起播留 80ms）');

[2.5, 5.0, 7.5, 10.0].forEach(tickTo);

const expectBars = [0, 1, 2, 3].map(function (k) { return T0 + BAR * k; });
ok(expectBars.every(function (t) { return startsAt(t) > 0; }), '前 4 小节全部排上',
  expectBars.map(startsAt));
ok(startsAt(T0 + BAR * 4) > 0, '第 5 小节回到第 1 小节（循环成立）');

CTX.currentTime = T0 + BAR * 2;
const pos = A.position();
ok(pos && pos.bar === 2 && Math.abs(pos.beat) < 1e-9, '播放头：第 3 小节第 1 拍', pos);

CTX.currentTime = T0 + BAR * 4;
ok(A.position().bar === 0, '走过一整圈后播放头回到第 1 小节', A.position());

const busA = role('busA'), busB = role('busB');
ok(busA.log.length === 0 && busB.log.length === 0, '起播时 A 满、B 静，没有任何多余渐变');

CTX.currentTime = 3.0;                 // 第 2 小节中间点下 B
A.setVersion('b');
const expectAt = T0 + BAR * 2;         // 下一条小节线
const lastA = busA.log[busA.log.length - 1];
const lastB = busB.log[busB.log.length - 1];

ok(lastA && lastA.type === 'target' && lastA.v === 0 && Math.abs(lastA.t - expectAt) < 1e-9,
  'A 总线的淡出落在小节线 ' + expectAt.toFixed(2) + 's，不是点击那一刻', lastA);
ok(lastB && lastB.type === 'target' && lastB.v === 1 && Math.abs(lastB.t - expectAt) < 1e-9,
  'B 总线在同一条小节线上淡入', lastB);

A.stop();
ok(TICK === null, '停止后走带定时器被清掉');
ok(busA.log[busA.log.length - 1].v === 0, '停止时总线拉到 0，不留残响');

/* ---------- 鼓的落点 ---------- */
console.log('\n[5b] 鼓的落点');

CTX.currentTime = 0;
OSC.length = 0;

A.play({
  chordsA: [null],          // 只要鼓，不要和声
  bars: 1,
  bpm: 120,                 // 一小节 2 秒，八分格 0.25 秒
  bass: false,
  preSchedule: true,
  drums: {
    hats: [1, 1, 1, 1, 1, 1, 1, 1],
    snare: [0, 0, 1, 0, 0, 0, 1, 0],
    kick: [1, 0, 0, 0, 1, 0, 0, 0]
  }
});

const D0 = 0.08;
const EIGHTH = 0.25;
const bufStarts = OSC.filter(function (o) { return o.kind === 'buf'; });
const oscStarts = OSC.filter(function (o) { return o.kind === 'osc'; });

ok(bufStarts.length === 10, '噪声源 10 个（8 个踩镲 + 2 个军鼓）', bufStarts.length);
ok(oscStarts.length === 4, '振荡器 4 个（2 个底鼓 + 2 个军鼓的体）', oscStarts.length);

const onGrid = function (list) {
  return list.every(function (o) {
    const k = (o.t - D0) / EIGHTH;
    return Math.abs(k - Math.round(k)) < 1e-6;
  });
};
ok(onGrid(bufStarts), '所有噪声源都落在八分格上');
ok(onGrid(oscStarts), '所有底鼓 / 军鼓体都落在八分格上');
ok(bufStarts.filter(function (o) { return Math.abs(o.t - D0) < 1e-6; }).length === 1,
  '第 1 拍同时有踩镲和底鼓');

const snareTimes = oscStarts.filter(function (o) { return Math.abs(o.f - 186) < 1; }).map(function (o) { return o.t; });
ok(snareTimes.length === 2 &&
  Math.abs(snareTimes[0] - (D0 + 2 * EIGHTH)) < 1e-6 &&
  Math.abs(snareTimes[1] - (D0 + 6 * EIGHTH)) < 1e-6,
  '军鼓落在第 2、4 拍（八分格第 2、6 格）', snareTimes);

A.stop();

/* ---------- 两套鼓按 map 换 ---------- */
CTX.currentTime = 0;
OSC.length = 0;

A.play({
  chordsA: [null, null, null, null],
  bars: 4,
  bpm: 120,               // 一小节 2 秒
  bass: false,
  preSchedule: true,
  drums: {
    patterns: [
      { hats: [1, 1, 1, 1, 1, 1, 1, 1], snare: [0, 0, 0, 0, 1, 0, 0, 0], kick: [1, 0, 0, 0, 0, 0, 0, 0] },
      { hats: [1, 1, 1, 1, 1, 1, 1, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0], kick: [1, 0, 0, 0, 1, 0, 0, 0] }
    ],
    map: [0, 0, 1, 1]
  }
});

const buf4 = OSC.filter(function (o) { return o.kind === 'buf'; });
const osc4 = OSC.filter(function (o) { return o.kind === 'osc'; });
ok(buf4.length === 38, '噪声源 38 个（9 + 9 + 10 + 10）', buf4.length);
ok(osc4.length === 12, '振荡器 12 个（2 + 2 + 4 + 4）', osc4.length);

const barStart = function (n) { return 0.08 + n * 2.0; };
const inBar = function (list, n) {
  const a = barStart(n), b = a + 2.0 - 1e-9;
  return list.filter(function (o) { return o.t >= a && o.t < b; }).length;
};
ok(inBar(buf4, 0) === 9 && inBar(buf4, 1) === 9 && inBar(buf4, 2) === 10 && inBar(buf4, 3) === 10,
  '前两小节各 9 个噪声源，后两小节各 10 个——map 换了图案',
  [inBar(buf4, 0), inBar(buf4, 1), inBar(buf4, 2), inBar(buf4, 3)]);

A.stop();

/* ============================================================
 * 6. 练习页的出题
 * ============================================================ */

console.log('\n[6] 自由练习的出题');

require('../js/practice.js');
const PRACTICE = globalThis.PRACTICE;

['degree', 'interval', 'chord'].forEach(function (mode) {
  let bad = 0;
  const answers = [];
  for (let i = 0; i < 300; i++) {
    const q = PRACTICE._make(mode, 1 + (i % 3));
    if (q.options.indexOf(q.answer) < 0) bad++;
    if (q.options.filter(function (o, j, a) { return a.indexOf(o) === j; }).length !== q.options.length) bad++;
    if (!q.options.length) bad++;
    answers.push(q.answer);
  }
  const uniq = answers.filter(function (v, i, a) { return a.indexOf(v) === i; });
  ok(bad === 0, mode + '：300 道题，答案都在选项里且不重复', bad);
  ok(uniq.length >= 2, mode + '：答案有变化（' + uniq.length + ' 种）', uniq.length);
});

// 级数题必须覆盖七级
const degreeSeen = {};
for (let i = 0; i < 400; i++) degreeSeen[PRACTICE._make('degree', 1).answer] = 1;
ok(Object.keys(degreeSeen).length === 7, '级数题七级都出得到', Object.keys(degreeSeen).sort());

/* ============================================================
 * 7. 音频分析
 * ============================================================ */

console.log('\n[7] 音频分析');

require('../js/audio-lab.js');
const LAB = globalThis.AUDIOLAB;

function fakeBuffer(samples, sr) {
  return {
    sampleRate: sr,
    length: samples.length,
    numberOfChannels: 1,
    duration: samples.length / sr,
    getChannelData: function () { return samples; }
  };
}

// 节拍：每 60/bpm 秒一下
function clickTrack(bpm, sec, sr) {
  const n = Math.floor(sec * sr);
  const d = new Float32Array(n);
  const period = 60 / bpm;
  for (let t = 0; t < sec; t += period) {
    const i0 = Math.floor(t * sr);
    for (let k = 0; k < 90; k++) {
      if (i0 + k < n) d[i0 + k] = Math.sin(k * 0.9) * Math.exp(-k / 12) * 0.9;
    }
  }
  return d;
}

const clickRes = LAB.analyze(fakeBuffer(clickTrack(120, 6, 44100), 44100), { length: 6 });
ok(Math.abs(clickRes.tempo.bpm - 120) <= 4,
  '120 BPM 的节拍测出来是 ' + clickRes.tempo.bpm, clickRes.tempo);

const click90 = LAB.analyze(fakeBuffer(clickTrack(90, 8, 44100), 44100), { length: 8 });
ok(Math.abs(click90.tempo.bpm - 90) <= 4,
  '90 BPM 的节拍测出来是 ' + click90.tempo.bpm, click90.tempo);

// 调性：D 大调三和弦铺 6 秒
function chordTone(freqs, sec, sr) {
  const n = Math.floor(sec * sr);
  const d = new Float32Array(n);
  freqs.forEach(function (f, i) {
    for (let k = 0; k < n; k++) d[k] += Math.sin(2 * Math.PI * f * k / sr + i) * 0.22;
  });
  return d;
}

const dMajor = chordTone([146.83, 185.00, 220.00, 293.66, 369.99], 6, 44100);
const keyRes = LAB.analyze(fakeBuffer(dMajor, 44100), { length: 6 });
ok(keyRes.keys[0].name === 'D 大调' || keyRes.keys[0].name === 'B 小调',
  'D 大调和弦铺底，首候选是 ' + keyRes.keys[0].name,
  keyRes.keys.map(function (k) { return k.name; }));
ok(keyRes.keys.length >= 2, '给两个候选（关系大小调分不清是常态）', keyRes.keys.length);

// 音高检测
const sr12 = 12000;
function tone(hz) {
  const b = new Float32Array(1024);
  for (let i = 0; i < b.length; i++) b[i] = Math.sin(2 * Math.PI * hz * i / sr12) * 0.5;
  return b;
}
const f220 = PRACTICE._pitch(tone(220), sr12);
ok(Math.abs(f220 - 220) < 4, '单音 220Hz 测出 ' + f220.toFixed(1) + 'Hz', f220);

const f440 = PRACTICE._pitch(tone(440), sr12);
ok(Math.abs(f440 - 440) < 8, '单音 440Hz 测出 ' + f440.toFixed(1) + 'Hz', f440);

ok(PRACTICE._pitch(new Float32Array(1024), sr12) === 0, '静音不瞎报音高');

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
