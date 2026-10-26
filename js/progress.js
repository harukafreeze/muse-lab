/*!
 * progress.js — 进度存档（localStorage）
 *
 * 没有账号，数据只在这台机器上。清缓存之前记得导出——但这一版还没做导出。
 */
(function (root) {
  'use strict';

  const KEY = 'muse.lab.v1';
  const P = {};
  P.data = { done: {}, builds: {}, melodies: {}, drums: {}, checks: {}, seen: {} };

  function store() {
    try {
      return root.localStorage || null;
    } catch (e) {
      return null;    // 隐私模式下读 localStorage 就会抛
    }
  }

  P.load = function () {
    const s = store();
    if (!s) return P.data;
    try {
      const raw = s.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        P.data.done = d.done || {};
        P.data.builds = d.builds || {};
        P.data.melodies = d.melodies || {};
        P.data.drums = d.drums || {};
        P.data.checks = d.checks || {};
        P.data.seen = d.seen || {};
      }
    } catch (e) {
      /* 存档坏了就当没有，不要因此白屏 */
    }
    return P.data;
  };

  P.save = function () {
    const s = store();
    if (!s) return;
    try {
      s.setItem(KEY, JSON.stringify(P.data));
    } catch (e) {
      /* 配额满了也不影响这一局 */
    }
  };

  P.isDone = function (id) {
    return !!P.data.done[id];
  };

  P.markDone = function (id) {
    P.data.done[id] = Date.now();
    P.save();
  };

  P.saveBuild = function (id, chords) {
    P.data.builds[id] = chords.slice();
    P.save();
  };

  P.getBuild = function (id) {
    const b = P.data.builds[id];
    return Array.isArray(b) ? b.slice() : null;
  };

  P.saveMelody = function (id, slots) {
    P.data.melodies = P.data.melodies || {};
    P.data.melodies[id] = slots.slice();
    P.save();
  };

  P.getMelody = function (id) {
    const m = P.data.melodies && P.data.melodies[id];
    return Array.isArray(m) ? m.slice() : null;
  };

  P.saveDrums = function (id, pattern) {
    P.data.drums = P.data.drums || {};
    P.data.drums[id] = JSON.parse(JSON.stringify(pattern));
    P.save();
  };

  P.getDrums = function (id) {
    const d = P.data.drums && P.data.drums[id];
    return d ? JSON.parse(JSON.stringify(d)) : null;
  };

  P.saveChecks = function (id, arr) {
    P.data.checks = P.data.checks || {};
    P.data.checks[id] = arr.slice();
    P.save();
  };

  P.getChecks = function (id) {
    const a = P.data.checks && P.data.checks[id];
    return Array.isArray(a) ? a.slice() : null;
  };

  P.doneCount = function (ids) {
    return ids.filter(function (i) { return !!P.data.done[i]; }).length;
  };

  P.reset = function () {
    P.data = { done: {}, builds: {}, seen: {} };
    P.save();
  };

  root.MP = P;
})(typeof window !== 'undefined' ? window : globalThis);
