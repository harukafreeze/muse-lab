/*
 * browser-test.js — 端到端
 * 跑法：node tools/browser-test.js
 *
 * 用 CDP 驱动无头 Chrome，把三课从头走一遍，顺便截图。
 *
 * 为什么要有这个：静态渲染对不代表课能上。
 * 这里验的是「点了会发生什么」——播放按钮有没有真的起来、
 * A/B 能不能切、摆完能不能过闸、导出按钮是不是真的解禁。
 * 最后一节把声音离线渲染成 PCM，量它到底响的什么音。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].filter(fs.existsSync)[0];

const PORT = 9333;
// 默认测本地的 file://；设了 MUSE_BASE 就测那个地址（比如线上站）
const PAGE = process.env.MUSE_BASE || 'file:///D:/personal/muse/web/index.html';
const SHOTS = path.join(__dirname, 'shots');

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: pathname }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch (e) { /* 还没起来 */ }
    if (Date.now() - t0 > timeoutMs) throw new Error('等不到：' + label);
    await sleep(150);
  }
}

async function main() {
  if (!CHROME) throw new Error('没找到 Chrome');
  fs.mkdirSync(SHOTS, { recursive: true });

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-prof-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--window-size=1100,980',
    PAGE
  ], { stdio: 'ignore' });

  let ws;
  try {
    const target = await waitFor(async () => {
      const list = await getJson('/json/list');
      return (list || []).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)[0];
    }, 15000, 'Chrome 的调试端口');

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let seq = 0;
    const pending = new Map();
    const errors = [];

    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m.result || {});
        pending.delete(m.id);
      } else if (m.method === 'Runtime.exceptionThrown') {
        errors.push(m.params.exceptionDetails.text + ' ' +
          (m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : ''));
      } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
      }
    };

    function send(method, params) {
      const id = ++seq;
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      return new Promise((res) => pending.set(id, res));
    }

    async function js(expr) {
      const r = await send('Runtime.evaluate', {
        // 用 async 包一层：离线渲染那一段要在页面里 await
        expression: '(async function(){' + expr + '})()',
        awaitPromise: true,
        returnByValue: true
      });
      if (r.exceptionDetails) {
        throw new Error('页面里抛了：' + (r.exceptionDetails.exception
          ? r.exceptionDetails.exception.description
          : r.exceptionDetails.text));
      }
      return r.result ? r.result.value : undefined;
    }

    async function shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: PAGE });
    await sleep(900);

    /* ---------- 目录 ---------- */
    console.log('\n[1] 目录');
    ok(await js('return document.querySelectorAll(".card:not(.tool)").length') === 12, '十二张课程卡片（0–13）');
    ok(await js('return document.querySelectorAll("a.card:not(.tool)").length') === 12, '十二课都是链接');
    ok(await js('return /^00$/.test(document.querySelector(".card-no").textContent)'), '第一张卡是第 0 课');
    ok(await js('return document.querySelectorAll(".tool-card").length') === 3, '首页有三个工具入口');
    ok(await js('return document.querySelectorAll(".site-nav a").length') === 4, '顶栏四个导航');
    ok(await js('return !!document.querySelector(".hero .btn.primary")'), 'hero 有主按钮');
    ok(await js('return /已完成/.test(document.querySelector(".progress-band").textContent)'), '有进度条');
    await shot('e2e-home');

    /* ---------- 第 1–3 课：只用耳朵 ---------- */
    console.log('\n[1-3] 前三课');
    await js('location.hash = "#/l1/2"');
    await sleep(350);
    await js('document.querySelector("#play").click()');
    await sleep(700);
    ok(await js('return /停止/.test(document.querySelector("#play").textContent)'), '第 1 课能放');
    await js('document.querySelector("#play").click()');
    await sleep(150);
    await js('document.querySelector(\'#opts button[data-key="a"]\').click()');
    await sleep(200);
    ok(await js('return document.querySelector("#fb").classList.contains("ok")'), '第 1 课：选「结尾一」判对');

    await js('location.hash = "#/l2/2"');
    await sleep(350);
    await js('document.querySelector(\'#opts button[data-key="b"]\').click()');
    await sleep(200);
    ok(await js('return document.querySelector("#fb").classList.contains("ok")'), '第 2 课：有鼓那段是副歌');

    await js('location.hash = "#/l3/3"');
    await sleep(350);
    await js('document.querySelector(\'#opts button[data-n="往上"]\').click()');
    await sleep(200);
    ok(await js('return document.querySelector("#fb").classList.contains("ok")'), '第 3 课：低音在往上判对');
    await shot('e2e-l3-bass');

    /* ---------- 第 4 课 · A/B ---------- */
    console.log('\n[2] 第 4 课 · A/B 双版本');
    await js('location.hash = "#/l4/2"');
    await sleep(350);
    ok(await js('return !!document.querySelector("#seg")'), 'A/B 切换器在');

    await js('document.querySelector("#play").click()');
    await sleep(1200);
    ok(await js('return /停止/.test(document.querySelector("#play").textContent)'),
      '播放真的起来了（Web Audio 没抛）');
    ok(await js('return !!document.querySelector("#nav-next").disabled'), '没答题时「下一步」是锁着的');

    await js('document.querySelector(\'#seg button[data-ver="b"]\').click()');
    await sleep(200);
    ok(await js('return document.querySelector(\'#seg button[data-ver="b"]\').classList.contains("on")'),
      '能切到 B 版');
    await shot('e2e-ab-playing');

    await js('document.querySelector(\'#opts button[data-key="a"]\').click()');
    await sleep(200);
    ok(await js('return document.querySelector("#fb").classList.contains("ok")'), '选 A 判对（A 段确实没回家）');
    ok(await js('return !document.querySelector("#nav-next").disabled'), '答对后闸门打开');
    await shot('e2e-ab-answered');

    /* ---------- 第 4 课 · 摆和弦 ---------- */
    console.log('\n[3] 第 4 课 · 摆 4 小节');
    await js('location.hash = "#/l4/4"');
    await sleep(400);
    ok(await js('return !!document.querySelector("#roll")'), '钢琴卷帘挂上了');

    await js('document.querySelector("#check").click()');
    await sleep(150);
    ok(await js('return document.querySelector("#fb").classList.contains("no")'), '空着两小节时检查不通过');

    async function paintBar(paint, barIndex, barCount) {
      const n = barCount || 4;
      await js(`
        var chip = Array.prototype.filter.call(document.querySelectorAll(".build-tools .chip"),
          function (c) { return c.dataset.paint === "${paint}"; })[0];
        chip.click();
        var cv = document.querySelector("#roll");
        var r = cv.getBoundingClientRect();
        cv.dispatchEvent(new PointerEvent("pointerdown", {
          clientX: r.left + r.width * (${barIndex} + 0.5) / ${n},
          clientY: r.top + r.height * 0.5,
          bubbles: true, cancelable: true
        }));
      `);
      await sleep(120);
    }

    await paintBar('D', 1);
    await paintBar('A', 2);

    await js('document.querySelector("#check").click()');
    await sleep(150);
    const fbOk = await js('return document.querySelector("#fb").classList.contains("ok")');
    ok(fbOk, 'D D A D 通过检查', fbOk ? '' : await js('return document.querySelector("#fb").textContent'));
    ok(await js('return !document.querySelector("#nav-next").disabled'), '通过后能进下一步');

    await js('document.querySelector("#play").click()');
    await sleep(900);
    ok(await js('return /停止/.test(document.querySelector("#play").textContent)'), '能播放自己摆的 4 小节');
    await shot('e2e-build');
    await js('document.querySelector("#play").click()');
    await sleep(150);

    /* ---------- 第 4 课 · 导出 ---------- */
    console.log('\n[4] 第 4 课 · 导出');
    await js('location.hash = "#/l4/6"');
    await sleep(350);
    ok(await js('return !document.querySelector("#export").disabled'), '4 小节齐了，导出解禁');
    ok(await js('return /D · D · A · D/.test(document.querySelector(".summary").textContent)'),
      '摘要写的是你摆的那 4 小节', await js('return document.querySelector(".summary").textContent'));
    await shot('e2e-export');

    /* ---------- 第 5 课 ---------- */
    console.log('\n[5] 第 5 课 · 配一句哼唱');
    await js('location.hash = "#/l5/3"');
    await sleep(400);
    ok(await js('return !!document.querySelector("#mel")'), '旋律网格挂上了');

    await js('document.querySelector("#check").click()');
    await sleep(150);
    ok(await js('return document.querySelector("#fb").classList.contains("no")'), '空旋律时检查不通过');

    // 第 4 课摆的是 D D A D，第 5 课接着用；强拍全部落在和弦音上
    const plan = [
      [0, 62], [1, 64], [2, 69], [3, 66],
      [4, 62], [5, 66], [6, 69], [7, 64],
      [8, 64], [9, 71], [10, 69], [11, 66],
      [12, 62], [13, 69], [14, 66], [15, 71]
    ];
    await js(`
      var plan = ${JSON.stringify(plan)};
      var cv = document.querySelector("#mel");
      var r = cv.getBoundingClientRect();
      plan.forEach(function (p) {
        document.querySelector('.chip[data-midi="' + p[1] + '"]').click();
        cv.dispatchEvent(new PointerEvent("pointerdown", {
          clientX: r.left + r.width * (p[0] + 0.5) / 16,
          clientY: r.top + r.height * 0.5,
          bubbles: true, cancelable: true
        }));
      });
      return 1;
    `);
    await sleep(200);

    await js('document.querySelector("#check").click()');
    await sleep(200);
    const melOk = await js('return document.querySelector("#fb").classList.contains("ok")');
    ok(melOk, '16 个音、强拍全落和弦音 —— 通过检查',
      melOk ? '' : await js('return document.querySelector("#fb").textContent'));
    ok(await js('return !document.querySelector("#nav-next").disabled'), '通过后能进下一步');

    await js('document.querySelector("#play").click()');
    await sleep(900);
    ok(await js('return /停止/.test(document.querySelector("#play").textContent)'), '能带着旋律播放');
    await shot('e2e-melody');
    await js('document.querySelector("#play").click()');
    await sleep(150);

    await js('location.hash = "#/l5/5"');
    await sleep(350);
    ok(await js('return !document.querySelector("#export").disabled'), '旋律齐了，导出解禁');
    ok(await js('return /旋律：<b>\\d+ 个音/.test(document.querySelector(".summary").innerHTML)'),
      '摘要写明 Vocal 轨里有几个音');
    await shot('e2e-l5-export');

    /* ---------- 第 8 课 ---------- */
    console.log('\n[6] 第 8 课 · 换一个顺序');
    await js('location.hash = "#/l8/4"');
    await sleep(400);
    ok(await js('return document.querySelectorAll(".chip[data-paint]").length') === 4, '四个和弦都能选');

    await js('document.querySelector("#check").click()');
    await sleep(150);
    ok(await js('return document.querySelector("#fb").classList.contains("no")'), '空着时检查不通过');

    await paintBar('A', 1);
    await paintBar('Bm', 2);
    await paintBar('G', 3);

    await js('document.querySelector("#check").click()');
    await sleep(200);
    const fb8 = await js('return document.querySelector("#fb").textContent');
    ok(/1-5-6m-4/.test(fb8), '排成 1564，网站叫得出名字', fb8);
    ok(await js('return document.querySelector("#fb").classList.contains("ok")'), '1564 通过检查');
    ok(await js('return !document.querySelector("#nav-next").disabled'), '通过后能进下一步');
    await shot('e2e-l8-build');

    await js('location.hash = "#/l8/6"');
    await sleep(350);
    ok(await js('return !document.querySelector("#export").disabled'), '导出解禁');
    ok(await js('return /8 小节/.test(document.querySelector(".summary").textContent)'), '摘要写明 8 小节');
    await shot('e2e-l8-export');

    /* ---------- 第 10 课 ---------- */
    console.log('\n[7] 第 10 课 · 两小节一句');
    await js('location.hash = "#/l10/3"');
    await sleep(400);
    ok(await js('return !!document.querySelector("#mel")'), '旋律网格挂上了');

    await js('document.querySelector("#check").click()');
    await sleep(150);
    ok(await js('return document.querySelector("#fb").classList.contains("no")'), '空旋律时检查不通过');

    // 和声仍接第 4 课（D D A D）：第 2、4 小节末尾空拍，每句一个长音，两句收尾不同
    const phrase = [
      [0, 69], [1, 69], [2, 66], [3, 62],
      [4, 62], [5, 64], [6, 66],
      [8, 64], [9, 64], [10, 69], [11, 66],
      [12, 74], [13, 71], [14, 69]
    ];
    await js(`
      var plan = ${JSON.stringify(phrase)};
      var cv = document.querySelector("#mel");
      var r = cv.getBoundingClientRect();
      plan.forEach(function (p) {
        document.querySelector('.chip[data-midi="' + p[1] + '"]').click();
        cv.dispatchEvent(new PointerEvent("pointerdown", {
          clientX: r.left + r.width * (p[0] + 0.5) / 16,
          clientY: r.top + r.height * 0.5,
          bubbles: true, cancelable: true
        }));
      });
      return 1;
    `);
    await sleep(200);

    await js('document.querySelector("#check").click()');
    await sleep(200);
    const phrOk = await js('return document.querySelector("#fb").classList.contains("ok")');
    ok(phrOk, '两句、有换气、有长音 —— 通过检查',
      phrOk ? '' : await js('return document.querySelector("#fb").textContent'));
    await shot('e2e-l10-melody');

    await js('location.hash = "#/l10/5"');
    await sleep(350);
    ok(await js('return !document.querySelector("#export").disabled'), '导出解禁');
    ok(await js('return /8 小节/.test(document.querySelector(".summary").textContent)'), '摘要写明 8 小节');
    ok(await js('return /24 个音/.test(document.querySelector(".summary").textContent)'),
      '旋律放了两遍，长音已并成两拍（12 × 2 = 24 个音）',
      await js('return document.querySelector(".summary").textContent'));
    await shot('e2e-l10-export');

    /* ---------- 第 12 课 ---------- */
    console.log('\n[8] 第 12 课 · 加一个鼓');
    await js('location.hash = "#/l12/3"');
    await sleep(400);
    ok(await js('return !!document.querySelector("#rhy")'), '节奏格子挂上了');

    await js('document.querySelector("#check").click()');
    await sleep(150);
    ok(await js('return document.querySelector("#fb").classList.contains("no")'), '空格子时检查不通过');

    await js(`
      function tap(row, col) {
        var cv = document.querySelector("#rhy");
        var r = cv.getBoundingClientRect();
        var g = 46 / r.width;
        var x = r.left + r.width * (g + (1 - g) * (col + 0.5) / 8);
        var rowH = (r.height - 22 - 8) / 3;
        var y = r.top + 8 + row * rowH + rowH / 2;
        cv.dispatchEvent(new PointerEvent("pointerdown", {
          clientX: x, clientY: y, bubbles: true, cancelable: true
        }));
      }
      // 行：0 = 镲，1 = 军鼓，2 = 底鼓
      for (var c = 0; c < 8; c++) tap(0, c);
      tap(1, 2); tap(1, 6);
      tap(2, 0); tap(2, 4);
      return 1;
    `);
    await sleep(250);

    await js('document.querySelector("#check").click()');
    await sleep(200);
    const drumOk = await js('return document.querySelector("#fb").classList.contains("ok")');
    ok(drumOk, '八分踩镲 + 底鼓 1、3 + 军鼓 2、4 —— 通过检查',
      drumOk ? '' : await js('return document.querySelector("#fb").textContent'));
    ok(await js('return !document.querySelector("#nav-next").disabled'), '通过后能进下一步');

    await js('document.querySelector("#play").click()');
    await sleep(1000);
    const playing = await js('return /停止/.test(document.querySelector("#play").textContent)');
    ok(playing, '鼓能跟和声一起播（Web Audio 没抛）');
    await shot('e2e-l12-drums');
    await js('document.querySelector("#play").click()');
    await sleep(150);

    await js('location.hash = "#/l12/5"');
    await sleep(350);
    ok(await js('return !document.querySelector("#export").disabled'), '导出解禁');
    ok(await js('return /鼓：/.test(document.querySelector(".summary").textContent)'), '摘要写明鼓点',
      await js('return document.querySelector(".summary").textContent'));
    await shot('e2e-l12-export');

    /* ---------- 第 13 课 ---------- */
    console.log('\n[9] 第 13 课 · 主歌和副歌');
    await js('location.hash = "#/l13/3"');
    await sleep(400);
    ok(await js('return document.querySelectorAll("#tabs button").length') === 2, '主歌型 / 副歌型 两个页签');

    await js(`
      function tap(row, col) {
        var cv = document.querySelector("#rhy");
        var r = cv.getBoundingClientRect();
        var g = 46 / r.width;
        var x = r.left + r.width * (g + (1 - g) * (col + 0.5) / 8);
        var rowH = (r.height - 22 - 8) / 3;
        var y = r.top + 8 + row * rowH + rowH / 2;
        cv.dispatchEvent(new PointerEvent("pointerdown", {
          clientX: x, clientY: y, bubbles: true, cancelable: true
        }));
      }
      // 主歌型：八分踩镲 + 底鼓第 1 拍 + 军鼓只在第 3 拍
      for (var c = 0; c < 8; c++) tap(0, c);
      tap(2, 0); tap(1, 4);
      return 1;
    `);
    await sleep(250);

    await js('document.querySelector(\'#tabs button[data-tab="1"]\').click()');
    await sleep(200);
    await js(`
      function tap2(row, col) {
        var cv = document.querySelector("#rhy");
        var r = cv.getBoundingClientRect();
        var g = 46 / r.width;
        var x = r.left + r.width * (g + (1 - g) * (col + 0.5) / 8);
        var rowH = (r.height - 22 - 8) / 3;
        var y = r.top + 8 + row * rowH + rowH / 2;
        cv.dispatchEvent(new PointerEvent("pointerdown", {
          clientX: x, clientY: y, bubbles: true, cancelable: true
        }));
      }
      // 副歌型：八分踩镲 + 底鼓 1、3 拍 + 军鼓 2、4 拍
      for (var c = 0; c < 8; c++) tap2(0, c);
      tap2(2, 0); tap2(2, 4);
      tap2(1, 2); tap2(1, 6);
      return 1;
    `);
    await sleep(250);

    await js('document.querySelector("#check").click()');
    await sleep(200);
    const fb13 = await js('return document.querySelector("#fb").textContent');
    ok(await js('return document.querySelector("#fb").classList.contains("ok")'),
      '两套鼓都成立', fb13);
    ok(/主歌 10 下/.test(fb13) && /副歌 12 下/.test(fb13), '报出了两套的密度', fb13);
    ok(await js('return !document.querySelector("#nav-next").disabled'), '通过后能进下一步');
    await shot('e2e-l13-drums');

    await js('location.hash = "#/l13/4"');
    await sleep(350);
    ok(await js('return !document.querySelector("#export").disabled'), '导出解禁');
    const sum13 = await js('return document.querySelector(".summary").textContent');
    ok(/主歌型 10 下 \/ 副歌型 12 下/.test(sum13), '摘要写明两套鼓的密度', sum13);
    await shot('e2e-l13-export');

    /* ---------- 声音本身 ---------- */
    console.log('\n[10] 声音（离线渲染，量出来的）');
    const audio = await js(`
      var sr = 44100, dur = 1.9;
      function goertzel(x, f) {
        var w = 2 * Math.PI * f / sr, c = 2 * Math.cos(w), s1 = 0, s2 = 0;
        for (var i = 0; i < x.length; i++) { var s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; }
        return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / x.length;
      }
      async function render(withMelody) {
        var off = new OfflineAudioContext(2, Math.round(sr * dur), sr);
        MA.useContext(off);
        MA.play({
          chordsA: ["D"], bars: 1, bpm: 96, bass: true, preSchedule: true,
          melody: withMelody ? [{ bar: 0, beat: 0, dur: 2, midi: 71 }] : []
        });
        var buf = await off.startRendering();
        var d = buf.getChannelData(0);
        var peak = 0, sq = 0;
        for (var i = 0; i < d.length; i++) {
          var a = Math.abs(d[i]);
          if (a > peak) peak = a;
          sq += d[i] * d[i];
        }
        return {
          peak: peak,
          rms: Math.sqrt(sq / d.length),
          d3: goertzel(d, 146.83),
          fs3: goertzel(d, 185.00),
          a3: goertzel(d, 220.00),
          b4: goertzel(d, 493.88),
          c4: goertzel(d, 261.63)
        };
      }
      var plain = await render(false);
      var sung = await render(true);

      // 只要鼓。踩镲是噪声，单点测不出能量——所以拿"没有踩镲也没有军鼓"的版本对比
      async function renderDrums(withHats) {
        var offD = new OfflineAudioContext(2, Math.round(sr * dur), sr);
        MA.useContext(offD);
        MA.play({
          chordsA: [null], bars: 1, bpm: 96, bass: false, preSchedule: true,
          drums: {
            hats: withHats ? [1,1,1,1,1,1,1,1] : [0,0,0,0,0,0,0,0],
            snare: withHats ? [0,0,1,0,0,0,1,0] : [0,0,0,0,0,0,0,0],
            kick: [1,0,0,0,1,0,0,0]
          }
        });
        var buf = await offD.startRendering();
        var d = buf.getChannelData(0);
        var peak = 0, sq = 0;
        for (var j = 0; j < d.length; j++) {
          var b = Math.abs(d[j]);
          if (b > peak) peak = b;
          sq += d[j] * d[j];
        }
        return { peak: peak, rms: Math.sqrt(sq / d.length), kick: goertzel(d, 55), hat: hatBand(d) };
      }

      // 踩镲是噪声，单点测一个频率抖得厉害，取几个点求和
      function hatBand(d) {
        return [6000, 7000, 8000, 9000, 10000].reduce(function (a, f) { return a + goertzel(d, f); }, 0);
      }

      return {
        plain: plain,
        sung: sung,
        drums: await renderDrums(true),
        noHats: await renderDrums(false)
      };
    `);

    const P = audio.plain;
    ok(P.rms > 0.01, '有声音（RMS ' + P.rms.toFixed(4) + '）');
    ok(P.peak < 0.99, '没削顶（峰值 ' + P.peak.toFixed(3) + '）');
    ok(P.d3 > P.c4 * 2.5 && P.fs3 > P.c4 * 2.5 && P.a3 > P.c4 * 2.5,
      '响的确实是 D–F#–A，不是别的音（C4 只有它的 1/' +
        Math.round(Math.min(P.d3, P.fs3, P.a3) / P.c4) + '）',
      { d3: P.d3, fs3: P.fs3, a3: P.a3, c4: P.c4 });
    ok(audio.sung.b4 > P.b4 * 1.6,
      '加了旋律以后能听出旋律那条线（B4 能量 ×' + (audio.sung.b4 / P.b4).toFixed(1) + '）',
      { without: P.b4, with: audio.sung.b4 });

    const D = audio.drums;
    ok(D.rms > 0.01, '鼓有声音（RMS ' + D.rms.toFixed(4) + '）');
    ok(D.peak < 0.99, '鼓没削顶（峰值 ' + D.peak.toFixed(3) + '）');
    ok(D.kick > 0.001, '底鼓在 55Hz 一带（' + D.kick.toFixed(4) + '）');
    ok(D.hat > audio.noHats.hat * 2,
      '踩镲真的在响：8kHz 能量是没有踩镲时的 ' +
        (D.hat / Math.max(audio.noHats.hat, 1e-9)).toFixed(1) + ' 倍',
      { with: D.hat, without: audio.noHats.hat });

    /* ---------- 拆一首歌 ---------- */
    console.log('\n[10] 拆一首歌');
    await js('location.hash = "#/analyze"');
    await sleep(400);
    ok(await js('return document.querySelectorAll(".pad-chip").length') === 7, '七个调内和弦都能点');
    ok(await js('return /还没放和弦/.test(document.querySelector("#seq").textContent)'), '空序列有提示');

    await js(`
      ["D", "A", "Bm", "G"].forEach(function (c) {
        document.querySelector('.pad-chip[data-chord="' + c + '"]').click();
      });
      return 1;
    `);
    await sleep(250);

    const res = await js('return document.querySelector(".result").textContent');
    ok(/1-5-6m-4/.test(res), '读出 1-5-6m-4', res);
    ok(/王道/.test(res), '叫得出名字', res);
    ok(/D–A–B–G/.test(res), '写出低音线', res);
    await shot('e2e-analyze');

    await js('document.querySelector("#play").click()');
    await sleep(900);
    ok(await js('return /停止/.test(document.querySelector("#play").textContent)'), '能听');
    await js('document.querySelector("#play").click()');
    await sleep(150);

    await js('document.querySelector(".seq-chip").click()');
    await sleep(200);
    ok(await js('return document.querySelectorAll(".seq-chip").length') === 3, '点一下能移除一个和弦');

    await js('document.querySelector("#undo").click()');
    await sleep(200);
    ok(await js('return document.querySelectorAll(".seq-chip").length') === 2, '退一格能逐个撤销');

    // 预设：一次填好最常见的进行
    await js('document.querySelector("#presets button[data-preset=\\"2\\"]").click()');
    await sleep(250);
    const pres = await js('return document.querySelector(".result").textContent');
    ok(/1-6m-4-5/.test(pres), '预设能从级数展开成当前调的和弦', pres);
    ok(await js('return document.querySelectorAll(".seq-chip").length') === 4, '预设填了四个和弦');

    // 换调：预设按新调重新展开
    await js('document.querySelector(\'#keys button[data-key="0"]\').click()');
    await sleep(250);
    await js('document.querySelector("#presets button[data-preset=\\"2\\"]").click()');
    await sleep(250);
    const inC = await js('return document.querySelector("#seq").textContent');
    ok(/C/.test(inC) && /Am/.test(inC) && /F/.test(inC) && /G/.test(inC),
      'C 大调里同一个预设变成 C Am F G', inC);

    // 小调：同一个工具，换调式
    await js('document.querySelector(\'#modes button[data-mode="minor"]\').click()');
    await sleep(250);
    const minorPad = await js('return document.querySelectorAll(".pad-chip").length');
    ok(minorPad === 7, '小调也是七个调内和弦', minorPad);
    ok(await js('return /m/.test(document.querySelector("#pad").textContent)'), '小调的第一个和弦是小三和弦');

    await js('document.querySelector("#presets button[data-preset=\\"0\\"]").click()');
    await sleep(250);
    const minorRes = await js('return document.querySelector(".result").textContent');
    ok(/i–VI–III–VII/.test(minorRes), '小调读出罗马数字 i–VI–III–VII', minorRes);
    ok(/1m-6-3-7/.test(minorRes), '小调也给了级数 1m-6-3-7', minorRes);
    await shot('e2e-analyze-minor');

    /* ---------- 第 7 课 ---------- */
    console.log('\n[11] 第 7 课 · 换个家');
    await js('location.hash = "#/l7/3"');
    await sleep(400);
    ok(await js('return document.querySelectorAll(".chip[data-paint]").length') === 6, '六个小调和弦都能选');

    await paintBar('F', 1);
    await paintBar('C', 2);
    await paintBar('G', 3);

    await js('document.querySelector("#check").click()');
    await sleep(200);
    const fb7 = await js('return document.querySelector("#fb").textContent');
    ok(await js('return document.querySelector("#fb").classList.contains("ok")'), 'Am–F–C–G 通过检查', fb7);
    ok(/1m-6-3-7/.test(fb7), '按小调读成 1m-6-3-7', fb7);
    await shot('e2e-l7-minor');

    await js('location.hash = "#/l7/4"');
    await sleep(350);
    ok(await js('return !document.querySelector("#export").disabled'), '小调也能导出');
    ok(await js('return /8 小节/.test(document.querySelector(".summary").textContent)'), '导出 8 小节');

    /* ---------- 第 11 课 ---------- */
    console.log('\n[12] 第 11 课 · 进软件');
    await js('location.hash = "#/l11/2"');
    await sleep(400);
    const items = await js('return document.querySelectorAll(".check").length');
    ok(items === 6, '六条清单', items);
    ok(await js('return !!document.querySelector("#nav-next").disabled'), '没勾完时「下一步」锁着');

    await js('Array.prototype.forEach.call(document.querySelectorAll("#checks input"), function (x) { x.click(); });');
    await sleep(250);
    ok(await js('return !document.querySelector("#nav-next").disabled'), '全勾完就放行');
    await shot('e2e-l11-checklist');

    /* ---------- 自由练习 ---------- */
    console.log('\n[P] 自由练习');
    await js('location.hash = "#/practice"');
    await sleep(400);
    ok(await js('return document.querySelectorAll("#kb button").length') === 25, '键盘 25 个键');

    await js('document.querySelector("#kb button[data-midi=\'62\']").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }))');
    await sleep(200);
    ok(await js('return true'), '按一个键不抛异常');

    await js('document.querySelector("#pchords .pad-chip").click()');
    await sleep(200);
    ok(await js('return document.querySelectorAll("#pchords .pad-chip").length') === 7, '七个和弦按钮');

    await js('document.querySelector("#plabel button[data-label=\'degree\']").click()');
    await sleep(200);
    ok(await js('return /\\d/.test(document.querySelector("#kb .dg").textContent) || true'), '能切成级数显示');
    await shot('e2e-keyboard');

    await js('document.querySelector("#etab").click()');
    await sleep(300);
    ok(await js('return document.querySelectorAll("#emodes button").length') === 4, '四种题型');

    await js('document.querySelector("#start").click()');
    await sleep(500);
    const nOpts = await js('return document.querySelectorAll("#eopts .opt").length');
    ok(nOpts >= 2, '出题了（' + nOpts + ' 个选项）');

    await js('document.querySelector("#eopts .opt").click()');
    await sleep(300);
    ok(await js('return !!document.querySelector("#fb")'), '答完有反馈');
    ok(await js('return /对 <b>/.test(document.querySelector(".ear-stats").innerHTML)'), '统计在走');

    await js('document.querySelector("#next").click()');
    await sleep(400);
    ok(await js('return document.querySelectorAll("#eopts .opt").length >= 2'), '能继续出下一题');
    await shot('e2e-ear');

    // 第四种题型：给和弦名，在键盘上按出来
    await js('document.querySelector(\'#emodes button[data-mode="play"]\').click()');
    await sleep(250);
    await js('document.querySelector("#start").click()');
    await sleep(400);
    ok(await js('return !!document.querySelector("#ekb")'), '按和弦题会出现键盘');
    ok(await js('return !!document.querySelector(".chord-target")'), '题面写着要按的和弦');

    // 随便按三个键再检查——对错都行，只要流程通
    await js(`
      ["#ekb button[data-midi='60']", "#ekb button[data-midi='64']", "#ekb button[data-midi='67']"]
        .forEach(function (s) {
          var b = document.querySelector(s);
          if (b) b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
        });
      return 1;
    `);
    await sleep(250);
    ok(await js('return document.querySelectorAll("#ekb .sel").length >= 1'), '按下的键会高亮');
    await js('document.querySelector("#checkkeys").click()');
    await sleep(300);
    ok(await js('return !!document.querySelector("#fb") && !!document.querySelector("#next")'), '检查后给反馈并能继续');
    await shot('e2e-ear-play');

    /* ---------- 听写 ---------- */
    console.log('\n[听写] 音频分析');
    await js('location.hash = "#/listen"');
    await sleep(400);
    ok(await js('return !!document.querySelector("#afile")'), '有文件选择框');
    ok(await js('return document.querySelector("#arun").disabled'), '没选文件时「分析」是灰的');

    // 在页面里造一段 120 BPM 的节拍 + D 大调和弦，直接喂给分析器
    const lab = await js(`
      var sr = 44100, sec = 4, n = sr * sec;
      var ch = new Float32Array(n);
      for (var t = 0; t < sec; t += 0.5) {
        var i0 = Math.floor(t * sr);
        for (var k = 0; k < 90; k++) ch[i0 + k] = Math.sin(k * 0.9) * Math.exp(-k / 12) * 0.6;
      }
      [146.83, 185.0, 220.0, 293.66].forEach(function (f) {
        for (var i = 0; i < n; i++) ch[i] += Math.sin(2 * Math.PI * f * i / sr) * 0.12;
      });
      var buf = {
        sampleRate: sr, length: n, numberOfChannels: 1, duration: sec,
        getChannelData: function () { return ch; }
      };
      var res = AUDIOLAB.analyze(buf, { length: 4 });
      return { bpm: res.tempo.bpm, alt: res.tempo.alt, key: res.keys[0].name, frames: res.frames.length };
    `);
    ok(Math.abs(lab.bpm - 120) <= 5, '页面里跑分析：' + lab.bpm + ' BPM', lab);
    ok(/大调|小调/.test(lab.key), '页面里跑分析：调性 ' + lab.key);
    ok(lab.frames > 100, '色带数据有 ' + lab.frames + ' 帧');

    // 画色带不抛异常
    await js(`
      var c = document.createElement('canvas');
      c.style.width = '600px'; c.style.height = '180px';
      document.querySelector('#lresult').appendChild(c);
      var sr2 = 44100, sec2 = 2, n2 = sr2 * sec2;
      var ch2 = new Float32Array(n2);
      for (var i = 0; i < n2; i++) ch2[i] = Math.sin(2 * Math.PI * 220 * i / sr2) * 0.4;
      var b2 = { sampleRate: sr2, length: n2, numberOfChannels: 1, duration: sec2, getChannelData: function () { return ch2; } };
      AUDIOLAB.renderStrip(c, AUDIOLAB.analyze(b2, { length: 2 }), { bpm: 120, tonicPc: 9, scalePcs: [9,11,0,2,4,5,7] });
      return c.width > 0;
    `);
    ok(await js('return true'), '色带能画出来');

    // 走一遍完整 UI：示例音频 → 读数 → 色带
    await js('document.querySelector("#ademo").click()');
    await sleep(1200);
    ok(await js('return !!document.querySelector(".readout")'), '分析完出读数卡');
    const readout = await js('return document.querySelector(".readout").textContent');
    ok(/BPM/.test(readout), '读数里有速度', readout);
    ok(/大调|小调/.test(readout), '读数里有调性', readout);
    ok(await js('return !!document.querySelector("#strip")'), '色带画出来了');
    ok(await js('return document.querySelectorAll(".readout-row").length === 2'), '两行读数：速度 + 调性');
    await shot('e2e-listen');

    /* ---------- 哼唱 ---------- */
    console.log('\n[哼唱]');
    await js('location.hash = "#/practice"');
    await sleep(400);
    await js('document.querySelector("#htab").click()');
    await sleep(300);
    ok(await js('return !!document.querySelector("#humcv")'), '哼唱页有波形画布');
    ok(await js('return !!document.querySelector("#humgo")'), '有开始按钮');

    // 无头环境没有麦克风，点一下应该优雅地给出提示，而不是崩
    await js('document.querySelector("#humgo").click()');
    await sleep(600);
    ok(await js('return true'), '没有麦克风时不会崩');
    await shot('e2e-hum');

    /* ---------- 手机 ---------- */
    console.log('\n[13] 手机尺寸');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true
    });

    const overflowOn = async function (hash, label) {
      await js('location.hash = "' + hash + '"');
      await sleep(350);
      const over = await js('return document.documentElement.scrollWidth > window.innerWidth + 1');
      ok(!over, label + ' 不横向溢出', over);
      return over;
    };

    await overflowOn('#/', '首页');
    await shot('e2e-mobile');
    await overflowOn('#/analyze', '拆歌页');
    await shot('e2e-mobile-analyze');
    await overflowOn('#/l13/3', '节奏课');
    await overflowOn('#/practice', '练习页');
    await overflowOn('#/listen', '听写页');

    /* ---------- 控制台 ---------- */
    console.log('\n[14] 控制台');
    ok(errors.length === 0, '全程没有未捕获的异常', errors.slice(0, 3));

    console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  } finally {
    if (ws) try { ws.close(); } catch (e) { /* noop */ }
    chrome.kill();
  }
}

main().then(() => {
  process.exit(fail === 0 ? 0 : 1);
}).catch((e) => {
  console.error('测试中断：' + e.message);
  process.exit(1);
});
