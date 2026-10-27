/*!
 * pianoroll.js — 钢琴卷帘（按小节摆和弦）
 *
 * 这一版只做一件事：4 个小节，每格放一个和弦，把它的三个音画出来。
 * 画出来的目的是让人**看见**和弦的形状：D 和 A 叠在一起时高了多少，
 * 换一个小节，那三块砖就整体往上挪——这比文字解释管用。
 */
(function (root) {
  'use strict';

  const MT = root.MT;
  const PR = {};

  const COLOR = {
    bg: '#141a22',
    stripe: 'rgba(255,255,255,0.022)',
    grid: 'rgba(255,255,255,0.055)',
    bar: 'rgba(255,255,255,0.18)',
    note: '#5fd39a',
    noteEdge: 'rgba(255,255,255,0.5)',
    empty: 'rgba(255,255,255,0.16)',
    label: 'rgba(255,255,255,0.72)',
    head: '#e0a44b'
  };

  const LOW = 45;    // A2
  const HIGH = 77;   // F5

  function rr(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, rad); return; }
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function isBlack(midi) {
    return [1, 3, 6, 8, 10].indexOf(((midi % 12) + 12) % 12) >= 0;
  }

  PR.Grid = function (canvas, opts) {
    const self = this;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.bars = this.opts.bars || 4;
    this.chords = (this.opts.chords || []).slice();
    while (this.chords.length < this.bars) this.chords.push(null);
    this.paint = this.opts.paint || null;
    this.onChange = this.opts.onChange || function () {};
    this.head = null;
    this._raf = null;
    this._getPos = null;

    canvas.style.touchAction = 'manipulation';
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const bar = Math.max(0, Math.min(self.bars - 1, Math.floor(x * self.bars)));
      if (e.shiftKey || self.paint === null) {
        self.chords[bar] = self.chords[bar] ? null : self.paint;
      } else {
        self.chords[bar] = self.paint;
      }
      self.draw();
      self.onChange(self.chords.slice());
    });

    this._onResize = function () { self.resize(); };
    if (root.ResizeObserver) {
      this._ro = new root.ResizeObserver(this._onResize);
      this._ro.observe(canvas);
    } else {
      root.addEventListener('resize', this._onResize);
    }
    this.resize();
  };

  PR.Grid.prototype.setPaint = function (chord) {
    this.paint = chord;
  };

  PR.Grid.prototype.setChords = function (arr) {
    this.chords = arr.slice();
    while (this.chords.length < this.bars) this.chords.push(null);
    this.draw();
  };

  /** 擦除模式：paint 为 null 时点击只在「有 / 无」之间切换 */
  PR.Grid.prototype.setErase = function (on) {
    this.paint = on ? null : (this._lastPaint || null);
  };

  PR.Grid.prototype.resize = function () {
    const cv = this.canvas;
    const dpr = root.devicePixelRatio || 1;
    const w = cv.clientWidth || 640;
    const h = cv.clientHeight || 240;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
    this.draw();
  };

  PR.Grid.prototype.follow = function (getPos) {
    const self = this;
    this._getPos = getPos;
    if (this._raf) { root.cancelAnimationFrame(this._raf); this._raf = null; }
    if (!getPos) { this.head = null; this.draw(); return; }
    const loop = function () {
      const p = self._getPos ? self._getPos() : null;
      self.head = p;
      self.draw();
      self._raf = root.requestAnimationFrame(loop);
    };
    this._raf = root.requestAnimationFrame(loop);
  };

  PR.Grid.prototype.destroy = function () {
    if (this._raf) root.cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    else root.removeEventListener('resize', this._onResize);
  };

  PR.Grid.prototype.draw = function () {
    const ctx = this.ctx;
    if (!ctx || !this.w) return;
    const w = this.w, h = this.h;
    const padTop = 16, padBot = 34;
    const rows = HIGH - LOW + 1;
    const gridH = h - padTop - padBot;
    const rowH = gridH / rows;
    const barW = w / this.bars;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLOR.bg;
    rr(ctx, 0, 0, w, h, 10);
    ctx.fill();

    /* 半音行：黑键行稍暗一些，卷帘的「台阶感」靠这个 */
    for (let m = LOW; m <= HIGH; m++) {
      const y = padTop + (HIGH - m) * rowH;
      if (isBlack(m)) {
        ctx.fillStyle = COLOR.stripe;
        ctx.fillRect(0, y, w, rowH);
      }
      if (((m % 12) + 12) % 12 === 0) {
        ctx.strokeStyle = COLOR.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
      }
    }

    /* 小节线 */
    for (let b = 0; b <= this.bars; b++) {
      const x = Math.round(b * barW) + 0.5;
      ctx.strokeStyle = b === 0 || b === this.bars ? COLOR.bar : COLOR.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padTop - 6);
      ctx.lineTo(x, h - padBot + 6);
      ctx.stroke();
    }

    /* 和弦砖 */
    for (let b = 0; b < this.bars; b++) {
      const label = this.chords[b];
      const x0 = b * barW;
      if (!label) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = COLOR.empty;
        ctx.lineWidth = 1;
        rr(ctx, x0 + 6, padTop + 4, barW - 12, gridH - 8, 6);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      const v = MT.voicing(label);
      v.notes.forEach(function (m) {
        const y = padTop + (HIGH - m) * rowH;
        const bh = Math.max(4, rowH - 1.5);
        ctx.fillStyle = COLOR.note;
        rr(ctx, x0 + 6, y + 0.5, barW - 12, bh, Math.min(3, bh / 2));
        ctx.fill();
        ctx.strokeStyle = COLOR.noteEdge;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      });
    }

    /* 小节号 + 和弦名 */
    ctx.textAlign = 'center';
    for (let b = 0; b < this.bars; b++) {
      const cx = b * barW + barW / 2;
      ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = this.chords[b] ? '#dff7e9' : 'rgba(255,255,255,0.3)';
      ctx.fillText(this.chords[b] || '空', cx, h - padBot + 20);
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(String(b + 1), cx, padTop - 5);
    }

    /* 播放头 */
    if (this.head && this.head.barFloat != null) {
      const x = Math.round((this.head.barFloat % this.bars) * barW) + 0.5;
      ctx.strokeStyle = COLOR.head;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, padTop - 8);
      ctx.lineTo(x, h - padBot + 8);
      ctx.stroke();
      ctx.fillStyle = COLOR.head;
      ctx.beginPath();
      ctx.arc(x, padTop - 10, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  /* ============================================================
   * 旋律网格：4 小节 × 4 拍，每格一个音
   *
   * 为什么是格子不是自由卷帘：第 5 课只需要"把音放在对的拍上"，
   * 自由拖拽会把注意力从"哪一拍"移到"拖多长"。
   * 每小节的和弦音那几行会亮起来——初学者最大的困难不是不会写，
   * 是不知道该看哪儿。
   * ============================================================ */

  const MEL = {
    note: '#78c8ff',
    edge: 'rgba(255,255,255,.55)',
    tone: 'rgba(95,211,154,.115)',
    toneLine: 'rgba(95,211,154,.22)',
    ghost: 'rgba(120,200,255,.35)'
  };

  PR.MelodyGrid = function (canvas, opts) {
    const self = this;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};

    this.bars = this.opts.bars || 4;
    this.beats = this.opts.beatsPerBar || 4;
    const total = this.bars * this.beats;

    this.slots = (this.opts.slots || []).slice();
    while (this.slots.length < total) this.slots.push(null);
    this.slots.length = total;

    this.chords = (this.opts.chords || []).slice();
    this.palette = (this.opts.palette || [62, 64, 66, 69, 71, 74]).slice();
    this.paint = this.opts.paint == null ? this.palette[0] : this.opts.paint;
    this.onChange = this.opts.onChange || function () {};

    this.low = Math.min.apply(null, this.palette);
    this.high = Math.max.apply(null, this.palette);

    this.head = null;
    this._raf = null;
    this._getPos = null;
    this._pcs = this.chords.map(function (c) {
      if (!c) return null;
      return MT.chordNotes(c).map(function (m) { return ((m % 12) + 12) % 12; });
    });

    canvas.style.touchAction = 'manipulation';
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const col = Math.max(0, Math.min(self.slots.length - 1, Math.floor(x * self.slots.length)));
      if (e.shiftKey) self.slots[col] = null;
      else self.slots[col] = self.slots[col] === self.paint ? null : self.paint;
      self.draw();
      self.onChange(self.slots.slice());
    });

    this._onResize = function () { self.resize(); };
    if (root.ResizeObserver) {
      this._ro = new root.ResizeObserver(this._onResize);
      this._ro.observe(canvas);
    } else {
      root.addEventListener('resize', this._onResize);
    }
    this.resize();
  };

  PR.MelodyGrid.prototype.setPaint = function (midi) {
    this.paint = midi;
    this.draw();
  };

  PR.MelodyGrid.prototype.setChords = function (chords) {
    this.chords = chords.slice();
    this._pcs = this.chords.map(function (c) {
      if (!c) return null;
      return MT.chordNotes(c).map(function (m) { return ((m % 12) + 12) % 12; });
    });
    this.draw();
  };

  PR.MelodyGrid.prototype.setSlots = function (slots) {
    this.slots = slots.slice();
    while (this.slots.length < this.bars * this.beats) this.slots.push(null);
    this.draw();
  };

  PR.MelodyGrid.prototype.resize = function () {
    const cv = this.canvas;
    const dpr = root.devicePixelRatio || 1;
    const w = cv.clientWidth || 640;
    const h = cv.clientHeight || 240;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
    this.draw();
  };

  PR.MelodyGrid.prototype.follow = function (getPos) {
    const self = this;
    this._getPos = getPos;
    if (this._raf) { root.cancelAnimationFrame(this._raf); this._raf = null; }
    if (!getPos) { this.head = null; this.draw(); return; }
    const loop = function () {
      self.head = self._getPos ? self._getPos() : null;
      self.draw();
      self._raf = root.requestAnimationFrame(loop);
    };
    this._raf = root.requestAnimationFrame(loop);
  };

  PR.MelodyGrid.prototype.destroy = function () {
    if (this._raf) root.cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    else root.removeEventListener('resize', this._onResize);
  };

  PR.MelodyGrid.prototype.draw = function () {
    const ctx = this.ctx;
    if (!ctx || !this.w) return;
    const self = this;
    const w = this.w, h = this.h;
    const padTop = 12, padBot = 36;
    const rows = this.high - this.low + 1;
    const gridH = h - padTop - padBot;
    const rowH = gridH / rows;
    const cols = this.slots.length;
    const colW = w / cols;
    const barW = colW * this.beats;

    function yOf(m) { return padTop + (self.high - m) * rowH; }

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLOR.bg;
    rr(ctx, 0, 0, w, h, 10);
    ctx.fill();

    /* 每小节的和弦音：铺一条淡绿底，让人知道往哪几行放 */
    for (let b = 0; b < this.bars; b++) {
      const pcs = this._pcs[b];
      if (!pcs) continue;
      for (let m = this.low; m <= this.high; m++) {
        if (pcs.indexOf(((m % 12) + 12) % 12) >= 0) {
          ctx.fillStyle = MEL.tone;
          ctx.fillRect(b * barW, yOf(m), barW, rowH);
        }
      }
    }

    /* 行 */
    for (let m = this.low; m <= this.high; m++) {
      const y = yOf(m);
      if (((m % 12) + 12) % 12 === 0) {
        ctx.strokeStyle = COLOR.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
      }
    }

    /* 拍与小节 */
    for (let i = 0; i <= cols; i++) {
      const x = Math.round(i * colW) + 0.5;
      const isBar = i % this.beats === 0;
      ctx.strokeStyle = isBar ? COLOR.bar : 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, h - padBot);
      ctx.stroke();
    }

    /* 已放的音 */
    for (let i = 0; i < cols; i++) {
      const m = this.slots[i];
      if (m == null) continue;
      ctx.fillStyle = MEL.note;
      rr(ctx, i * colW + 2, yOf(m) + 1, colW - 4, Math.max(5, rowH - 2), 3);
      ctx.fill();
      ctx.strokeStyle = MEL.edge;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    /* 当前画笔的那一行，用虚线标出来 */
    if (this.paint != null) {
      const y = yOf(this.paint) + rowH / 2;
      ctx.save();
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = MEL.ghost;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.restore();
    }

    /* 小节号 + 和弦名 */
    ctx.textAlign = 'center';
    for (let b = 0; b < this.bars; b++) {
      const cx = b * barW + barW / 2;
      ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = this.chords[b] ? '#dff7e9' : 'rgba(255,255,255,0.3)';
      ctx.fillText(this.chords[b] || '—', cx, h - padBot + 21);
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(String(b + 1), cx, h - padBot + 34);
    }

    /* 播放头 */
    if (this.head && this.head.barFloat != null) {
      const x = Math.round((this.head.barFloat % this.bars) * barW) + 0.5;
      ctx.strokeStyle = COLOR.head;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, padTop - 6);
      ctx.lineTo(x, h - padBot + 4);
      ctx.stroke();
    }
  };

  /* ============================================================
   * 节奏格子：一小节 × 八分音符，三行（镲 / 军鼓 / 底鼓）
   * ============================================================ */

  const RHY = {
    rows: [
      { key: 'hats', label: '镲', color: '#93a7bd' },
      { key: 'snare', label: '军鼓', color: '#e0a44b' },
      { key: 'kick', label: '底鼓', color: '#5fd39a' }
    ],
    gutter: 46,
    labelH: 22
  };

  function emptyPattern() {
    return { hats: [0, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], kick: [0, 0, 0, 0, 0, 0, 0, 0] };
  }

  PR.emptyPattern = emptyPattern;

  PR.RhythmGrid = function (canvas, opts) {
    const self = this;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.pattern = emptyPattern();
    const p = this.opts.pattern || {};
    RHY.rows.forEach(function (r) {
      if (Array.isArray(p[r.key])) {
        for (let i = 0; i < 8; i++) self.pattern[r.key][i] = p[r.key][i] ? 1 : 0;
      }
    });
    this.onChange = this.opts.onChange || function () {};
    this.head = null;
    this._raf = null;
    this._getPos = null;

    canvas.style.touchAction = 'manipulation';
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      const g = RHY.gutter / self.w;
      if (x < g) return;
      const col = Math.floor(((x - g) / (1 - g)) * 8);
      const rowH = (self.h - RHY.labelH - 8) / 3;
      const rowIdx = Math.floor((y * self.h - 8) / rowH);
      if (col < 0 || col > 7 || rowIdx < 0 || rowIdx > 2) return;
      const key = RHY.rows[rowIdx].key;
      self.pattern[key][col] = self.pattern[key][col] ? 0 : 1;
      self.draw();
      self.onChange(JSON.parse(JSON.stringify(self.pattern)));
    });

    this._onResize = function () { self.resize(); };
    if (root.ResizeObserver) {
      this._ro = new root.ResizeObserver(this._onResize);
      this._ro.observe(canvas);
    } else {
      root.addEventListener('resize', this._onResize);
    }
    this.resize();
  };

  PR.RhythmGrid.prototype.setPattern = function (p) {
    const self = this;
    RHY.rows.forEach(function (r) {
      if (p && Array.isArray(p[r.key])) {
        for (let i = 0; i < 8; i++) self.pattern[r.key][i] = p[r.key][i] ? 1 : 0;
      }
    });
    this.draw();
  };

  PR.RhythmGrid.prototype.resize = function () {
    const cv = this.canvas;
    const dpr = root.devicePixelRatio || 1;
    const w = cv.clientWidth || 640;
    const h = cv.clientHeight || 220;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
    this.draw();
  };

  PR.RhythmGrid.prototype.follow = function (getPos) {
    const self = this;
    this._getPos = getPos;
    if (this._raf) { root.cancelAnimationFrame(this._raf); this._raf = null; }
    if (!getPos) { this.head = null; this.draw(); return; }
    const loop = function () {
      self.head = self._getPos ? self._getPos() : null;
      self.draw();
      self._raf = root.requestAnimationFrame(loop);
    };
    this._raf = root.requestAnimationFrame(loop);
  };

  PR.RhythmGrid.prototype.destroy = function () {
    if (this._raf) root.cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    else root.removeEventListener('resize', this._onResize);
  };

  PR.RhythmGrid.prototype.draw = function () {
    const ctx = this.ctx;
    if (!ctx || !this.w) return;
    const self = this;
    const w = this.w, h = this.h;
    const gutter = RHY.gutter;
    const gridW = w - gutter;
    const cellW = gridW / 8;
    const rowH = (h - RHY.labelH - 8) / 3;
    const pad = Math.min(5, cellW * 0.14);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLOR.bg;
    rr(ctx, 0, 0, w, h, 10);
    ctx.fill();

    /* 拍线：每两格一拍 */
    for (let b = 0; b <= 4; b++) {
      const x = Math.round(gutter + b * 2 * cellW) + 0.5;
      ctx.strokeStyle = b === 0 || b === 4 ? COLOR.bar : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 6);
      ctx.lineTo(x, h - RHY.labelH + 2);
      ctx.stroke();
    }

    /* 三行 */
    RHY.rows.forEach(function (row, r) {
      const top = 8 + r * rowH;

      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(row.label, gutter - 12, top + (rowH - 6) / 2);

      for (let c = 0; c < 8; c++) {
        const x = gutter + c * cellW;
        const active = self.pattern[row.key][c];
        ctx.fillStyle = active ? row.color : 'rgba(255,255,255,0.035)';
        rr(ctx, x + pad, top + pad, cellW - pad * 2, rowH - 6 - pad * 2, 4);
        ctx.fill();
        if (active) {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    });

    /* 拍号 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let b = 0; b < 4; b++) {
      ctx.fillText('第 ' + (b + 1) + ' 拍', gutter + (b * 2 + 1) * cellW, h - 6);
    }

    /* 播放头（按八分格走） */
    if (this.head && this.head.beat != null) {
      const x = Math.round(gutter + (this.head.beat / 4) * gridW) + 0.5;
      ctx.strokeStyle = COLOR.head;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x, h - RHY.labelH + 2);
      ctx.stroke();
    }
  };

  root.PR = PR;
})(typeof window !== 'undefined' ? window : globalThis);
