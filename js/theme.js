/*!
 * theme.js — 深色 / 浅色
 *
 * 颜色的唯一来源是 CSS 变量：这里只负责切属性、存取选择，
 * 以及把画布要用的那几个颜色从 CSS 读出来（画布不认 CSS 变量）。
 */
(function (root) {
  'use strict';

  const T = {};
  const KEY = 'muse.theme';
  const ATTR = 'data-theme';

  T.get = function () {
    const el = root.document && root.document.documentElement;
    return (el && el.getAttribute(ATTR)) || 'light';
  };

  T.isLight = function () { return T.get() === 'light'; };

  T.set = function (name) {
    const n = name === 'dark' ? 'dark' : 'light';
    if (root.document) root.document.documentElement.setAttribute(ATTR, n);
    try { root.localStorage.setItem(KEY, n); } catch (e) { /* 隐私模式 */ }
    return n;
  };

  T.toggle = function () { return T.set(T.isLight() ? 'dark' : 'light'); };

  /** 画布用的颜色：从 CSS 变量读一次，返回驼峰键的对象 */
  T.palette = function () {
    const names = ['bg', 'grid', 'bar', 'note', 'note-edge', 'empty', 'label', 'dim',
      'head', 'mel', 'mel-edge', 'tone', 'tone-line', 'stripe', 'ghost',
      'hat', 'snare', 'kick'];

    const out = {};
    if (!root.document || !root.getComputedStyle) {
      names.forEach(function (n) { out[key(n)] = n === 'bg' ? '#141a22' : '#888'; });
      return out;
    }
    const cs = root.getComputedStyle(root.document.documentElement);
    names.forEach(function (n) {
      out[key(n)] = cs.getPropertyValue('--cv-' + n).trim() || '#888';
    });
    return out;
  };

  function key(name) {
    return name.replace(/-(\w)/g, function (m, c) { return c.toUpperCase(); });
  }

  /** 把画布上要用的颜色刷新一遍之后重画：调用方传一个重绘函数 */
  T.repaint = function (fn) { if (fn) fn(); };

  root.THEME = T;
})(typeof window !== 'undefined' ? window : globalThis);
