/*!
 * audio-lab.js — 从音频里读出线索
 *
 * 它**不**告诉你「第 3 小节是 Bm」。和弦识别在密集混音上只有六七成准，
 * 错了又看不出来——那正好是这个站最不能犯的错。
 *
 * 它给的是三样能验证的东西：
 *   1. 速度（带一个试听按钮，你自己跟着数就知道对不对）
 *   2. 调性（一次给两个候选，因为关系大小调本来就分不清）
 *   3. 和弦色带（12 个音高类的能量随时间流动，换和弦的地方会跳一下）
 *
 * 全部在浏览器里算，音频不上传、不落盘。
 */
(function (root) {
  'use strict';

  const MT = root.MT;
  const LAB = {};

  const TARGET_SR = 11025;      // 分析用的采样率，够看 4kHz 以下的泛音
  const WIN = 2048;             // 186ms
  const HOP = 128;              // 11.6ms，速度估计要靠它
  const MIN_BPM = 60;
  const MAX_BPM = 200;

  /* ============================================================
   * FFT（radix-2，原地）
   * ============================================================ */

  function makeFFT(n) {
    const levels = Math.round(Math.log2(n));
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let x = i, r = 0;
      for (let j = 0; j < levels; j++) { r = (r << 1) | (x & 1); x >>= 1; }
      rev[i] = r;
    }
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      cos[i] = Math.cos(-2 * Math.PI * i / n);
      sin[i] = Math.sin(-2 * Math.PI * i / n);
    }

    return function fft(re, im) {
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) {
          let t = re[i]; re[i] = re[j]; re[j] = t;
          t = im[i]; im[i] = im[j]; im[j] = t;
        }
      }
      for (let size = 2; size <= n; size *= 2) {
        const half = size / 2;
        const step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = 0, k = 0; j < half; j++, k += step) {
            const c = cos[k], s = sin[k];
            const a = i + j, b = a + half;
            const tr = re[b] * c - im[b] * s;
            const ti = re[b] * s + im[b] * c;
            re[b] = re[a] - tr; im[b] = im[a] - ti;
            re[a] += tr; im[a] += ti;
          }
        }
      }
    };
  }

  const fft = makeFFT(WIN);

  /* ============================================================
   * 预处理：混单声道 + 降采样
   * ============================================================ */

  function toMonoLowRate(buffer, startSec, lengthSec) {
    const src = buffer.sampleRate;
    const step = Math.max(1, Math.round(src / TARGET_SR));
    const sr = src / step;

    const start = Math.max(0, Math.floor(startSec * src));
    const end = Math.min(buffer.length, start + Math.floor(lengthSec * src));
    const n = Math.max(0, Math.floor((end - start) / step));

    const mono = new Float32Array(n);
    const chans = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
    const nch = chans.length || 1;

    for (let i = 0; i < n; i++) {
      let sum = 0;
      const base = start + i * step;
      for (let k = 0; k < step; k++) {
        let s = 0;
        for (let c = 0; c < nch; c++) s += chans[c][base + k] || 0;
        sum += s / nch;
      }
      mono[i] = sum / step;
    }
    return { data: mono, sr: sr };
  }

  /* ============================================================
   * 短时傅里叶 → 每帧的 chroma 与能量
   * ============================================================ */

  function stftFeatures(sig) {
    const { data, sr } = sig;
    const frames = [];
    const flux = [];
    const re = new Float64Array(WIN);
    const im = new Float64Array(WIN);
    const hann = new Float64Array(WIN);
    for (let i = 0; i < WIN; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / WIN);

    // 每个 bin 对应的音高类；只看 80Hz 以上
    const binPc = new Int8Array(WIN / 2);
    const binFreq = new Float32Array(WIN / 2);
    for (let b = 1; b < WIN / 2; b++) {
      const f = b * sr / WIN;
      binFreq[b] = f;
      if (f < 80 || f > 4200) { binPc[b] = -1; continue; }
      const midi = 69 + 12 * Math.log2(f / 440);
      binPc[b] = ((Math.round(midi) % 12) + 12) % 12;
    }

    let prevMag = new Float32Array(WIN / 2);

    for (let pos = 0; pos + WIN <= data.length; pos += HOP) {
      for (let i = 0; i < WIN; i++) {
        re[i] = data[pos + i] * hann[i];
        im[i] = 0;
      }
      fft(re, im);

      const chroma = new Float32Array(12);
      const mag = new Float32Array(WIN / 2);
      let energy = 0;
      let fl = 0;

      for (let b = 1; b < WIN / 2; b++) {
        const m = Math.hypot(re[b], im[b]);
        mag[b] = m;
        energy += m * m;
        if (m > prevMag[b]) fl += m - prevMag[b];
        const pc = binPc[b];
        if (pc >= 0) {
          // 高频泛音权重低一点，免得一个大三度被自己的泛音带偏
          chroma[pc] += m / Math.sqrt(binFreq[b] / 220);
        }
      }
      prevMag = mag;

      let sum = 0;
      for (let i = 0; i < 12; i++) sum += chroma[i];
      if (sum > 0) for (let i = 0; i < 12; i++) chroma[i] /= sum;

      frames.push(chroma);
      flux.push(fl);
    }

    return { frames: frames, flux: flux, hopSec: HOP / sr, sr: sr };
  }

  /* ============================================================
   * 速度
   * ============================================================ */

  function estimateTempo(flux, hopSec) {
    // 去掉直流、做成零均值
    const n = flux.length;
    if (n < 64) return { bpm: 0, alt: 0, conf: 0 };

    let mean = 0;
    for (let i = 0; i < n; i++) mean += flux[i];
    mean /= n;
    const x = flux.map(function (v) { return Math.max(0, v - mean); });

    const lagMin = Math.max(2, Math.round((60 / MAX_BPM) / hopSec));
    const lagMax = Math.min(n - 2, Math.round((60 / MIN_BPM) / hopSec));
    if (lagMax <= lagMin) return { bpm: 0, alt: 0, conf: 0 };

    const ac = [];
    for (let lag = lagMin - 1; lag <= lagMax + 1; lag++) {
      if (lag < 1 || lag >= n) { ac.push(0); continue; }
      let s = 0;
      for (let i = 0; i + lag < n; i++) s += x[i] * x[i + lag];
      ac.push(s / (n - lag));
    }

    // 找所有局部最大，再用一个偏向 90–160 BPM 的先验去挑
    // （不然每两拍一个峰，很容易测成半速）
    const cands = [];
    for (let i = 1; i < ac.length - 1; i++) {
      if (ac[i] >= ac[i - 1] && ac[i] >= ac[i + 1] && ac[i] > 0) {
        const y0 = ac[i - 1], y1 = ac[i], y2 = ac[i + 1];
        const den = (y0 - 2 * y1 + y2);
        const shift = den ? 0.5 * (y0 - y2) / den : 0;
        const lag = (lagMin - 1 + i + shift);
        if (lag <= 0) continue;
        const bpm = 60 / (lag * hopSec);
        if (bpm < MIN_BPM || bpm > MAX_BPM) continue;
        const prior = Math.exp(-Math.pow(Math.log2(bpm / 120), 2) / (2 * 0.9 * 0.9));
        cands.push({ bpm: bpm, val: ac[i], score: ac[i] * prior });
      }
    }
    if (!cands.length) return { bpm: 0, alt: 0, conf: 0 };

    cands.sort(function (a, b) { return b.score - a.score; });
    const bestC = cands[0];
    const bpm = bestC.bpm;

    // 备选：半速或双速里，原始相关更接近的那个
    const others = cands.filter(function (c) {
      return c !== bestC && Math.abs(c.bpm - bpm) > 8;
    });
    const alt = others.length ? Math.round(others[0].bpm * 10) / 10 : 0;

    return {
      bpm: Math.round(bpm * 10) / 10,
      alt: alt,
      conf: bestC.val / (Math.abs(ac[0]) || 1)
    };
  }

  /* ============================================================
   * 调性（Krumhansl-Kessler 轮廓相关）
   * ============================================================ */

  const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  function corr(a, b) {
    const n = a.length;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
      const x = a[i] - ma, y = b[i] - mb;
      num += x * y; da += x * x; db += y * y;
    }
    return (da && db) ? num / Math.sqrt(da * db) : 0;
  }

  function estimateKey(chromaSum) {
    const out = [];
    for (let pc = 0; pc < 12; pc++) {
      const rot = [];
      for (let i = 0; i < 12; i++) rot.push(chromaSum[(pc + i) % 12]);
      out.push({ pc: pc, mode: 'major', score: corr(rot, KK_MAJOR) });
      out.push({ pc: pc, mode: 'minor', score: corr(rot, KK_MINOR) });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, 3).map(function (k) {
      return {
        pc: k.pc,
        mode: k.mode,
        score: k.score,
        name: MT.pcName(k.pc) + (k.mode === 'minor' ? ' 小调' : ' 大调')
      };
    });
  }

  /* ============================================================
   * 对外：分析一段
   * ============================================================ */

  LAB.analyze = function (buffer, opts) {
    const o = opts || {};
    const startSec = o.start || 0;
    const lengthSec = o.length || Math.min(45, buffer.duration - startSec);

    const sig = toMonoLowRate(buffer, startSec, lengthSec);
    const feat = stftFeatures(sig);

    const n = feat.frames.length;
    const chromaSum = new Float32Array(12);
    let weight = 0;
    for (let i = 0; i < n; i++) {
      let e = 0;
      for (let k = 0; k < 12; k++) e += feat.frames[i][k];
      if (e <= 0) continue;
      for (let k = 0; k < 12; k++) chromaSum[k] += feat.frames[i][k];
      weight++;
    }
    if (weight) for (let k = 0; k < 12; k++) chromaSum[k] /= weight;

    return {
      duration: sig.data.length / sig.sr,   // 实际分析到的长度（可能比要求短）
      start: startSec,
      hopSec: feat.hopSec,
      frames: feat.frames,
      chromaSum: chromaSum,
      tempo: estimateTempo(feat.flux, feat.hopSec),
      keys: estimateKey(chromaSum)
    };
  };

  /* ============================================================
   * 画和弦色带
   * ============================================================ */

  LAB.renderStrip = function (canvas, res, opts) {
    const o = opts || {};
    const ctx = canvas.getContext('2d');
    const dpr = root.devicePixelRatio || 1;
    const w = canvas.clientWidth || 720;
    const h = canvas.clientHeight || 180;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padL = 34, padT = 10, padB = 22;
    const gridW = w - padL;
    const gridH = h - padT - padB;
    const rowH = gridH / 12;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#141a22';
    ctx.fillRect(0, 0, w, h);

    const frames = res.frames;
    const n = frames.length;
    const colW = gridW / Math.max(1, n);

    const tonic = o.tonicPc;
    const scale = o.scalePcs || [];

    // 行：C 在上，B 在下
    for (let row = 0; row < 12; row++) {
      const pc = row;
      const y = padT + row * rowH;
      if (scale.indexOf(pc) >= 0) {
        ctx.fillStyle = 'rgba(95,211,154,0.045)';
        ctx.fillRect(padL, y, gridW, rowH);
      }
      if (pc === tonic) {
        ctx.fillStyle = 'rgba(95,211,154,0.10)';
        ctx.fillRect(padL, y, gridW, rowH);
      }
      ctx.fillStyle = pc === tonic ? '#5fd39a' : 'rgba(255,255,255,0.32)';
      ctx.font = (pc === tonic ? '600 ' : '') + '10px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(MT.pcName(pc), padL - 8, y + rowH / 2);
    }

    // 每帧一列
    for (let i = 0; i < n; i++) {
      const f = frames[i];
      const x = padL + i * colW;
      for (let pc = 0; pc < 12; pc++) {
        const v = Math.min(1, f[pc] * 3.2);
        if (v <= 0.02) continue;
        const y = padT + (11 - pc) * rowH;
        ctx.fillStyle = 'rgba(120,200,255,' + (v * 0.9).toFixed(3) + ')';
        ctx.fillRect(x, y, Math.ceil(colW), rowH);
      }
    }

    // 小节线
    const bpm = o.bpm;
    if (bpm) {
      const barSec = 4 * 60 / bpm;
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      for (let t = 0; t <= res.duration; t += barSec) {
        const x = Math.round(padL + (t / res.duration) * gridW) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + gridH);
        ctx.stroke();
      }
    }

    // 时间刻度
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = 0; t <= res.duration; t += 5) {
      const x = padL + (t / res.duration) * gridW;
      ctx.fillText(t + 's', Math.min(w - 12, Math.max(12, x)), padT + gridH + 6);
    }
  };

  /* ============================================================
   * 试听节拍：自己跟着数，就知道对不对
   * ============================================================ */

  LAB.clickTrack = function (bpm, beats) {
    const MA = root.MA;
    if (!MA) return;
    const n = beats || 8;
    const step = 60 / bpm;
    for (let i = 0; i < n; i++) {
      MA.blip(i % 4 === 0 ? 88 : 84, i * step, 0.09, i % 4 === 0 ? 0.3 : 0.16);
    }
  };

  /**
   * 一段自己合成的示例：D–A–Bm–G，120 BPM，带鼓。
   * 给「没有文件也想看看」的人用，也让截图和测试有个稳定的输入。
   */
  LAB.demoBuffer = function () {
    const sr = 44100;
    const barSec = 2;            // 120 BPM，4/4
    const bars = 4;
    const sec = barSec * bars;
    const n = Math.round(sr * sec);
    const d = new Float32Array(n);
    const prog = ['D', 'A', 'Bm', 'G'];

    prog.forEach(function (label, bar) {
      const ch = MT.parseChord(label);
      const root = 48 + ch.pc;
      const notes = ch.intervals.map(function (i) { return root + i; });
      const t0 = bar * barSec;

      notes.concat([root - 12]).forEach(function (m, idx) {
        const f = MT.freq(m);
        const amp = idx === notes.length ? 0.22 : 0.13;
        const len = Math.floor(barSec * 0.96 * sr);
        for (let i = 0; i < len; i++) {
          const tt = i / sr;
          const env = Math.min(1, tt / 0.02) * Math.exp(-tt * 0.75);
          d[Math.round(t0 * sr) + i] += Math.sin(2 * Math.PI * f * tt) * env * amp;
        }
      });

      // 鼓：每拍一下底鼓，每半拍一下镲
      for (let b = 0; b < 4; b++) {
        const at = Math.round((t0 + b * 0.5) * sr);
        for (let k = 0; k < 900; k++) {
          if (at + k >= n) break;
          const tt = k / sr;
          d[at + k] += Math.sin(2 * Math.PI * (110 - 70 * Math.min(1, tt * 12)) * tt) *
            Math.exp(-tt * 22) * 0.28;
        }
        for (let h = 0; h < 2; h++) {
          const at2 = Math.round((t0 + b * 0.5 + h * 0.25) * sr);
          for (let k = 0; k < 220; k++) {
            if (at2 + k >= n) break;
            d[at2 + k] += (Math.random() * 2 - 1) * Math.exp(-k / 45) * 0.05;
          }
        }
      }
    });

    return {
      sampleRate: sr,
      length: n,
      numberOfChannels: 1,
      duration: sec,
      getChannelData: function () { return d; }
    };
  };

  root.AUDIOLAB = LAB;
})(typeof window !== 'undefined' ? window : globalThis);
