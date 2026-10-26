/*!
 * lessons.js — 课程数据与判分规则
 *
 * 一条硬规矩：这里**不许**出现手写的「正确答案」标注。
 * 每道题只存原料（和弦、旋律、调），答案一律用 MT 现算，
 * 自检脚本会独立重算一遍来对账（tools/self-test.js）。
 *
 * 现在只有第 4 课。第 5、8 课等这一课跑通再加。
 */
(function (root) {
  'use strict';

  const MT = root.MT;
  const L = {};

  /* ============================================================
   * 旋律素材
   * ============================================================ */

  // 4 小节的一句，D 大调。故意用 D/A 两个和弦都容得下的音，
  // 这样 A/B 两版的差别只可能来自和声，不会掺进旋律因素。
  const PHRASE_4BARS = [
    { bar: 0, beat: 0, dur: 1, midi: 69 },   // A4
    { bar: 0, beat: 1, dur: 1, midi: 71 },   // B4
    { bar: 0, beat: 2, dur: 1, midi: 69 },
    { bar: 0, beat: 3, dur: 1, midi: 66 },   // F#4

    { bar: 1, beat: 0, dur: 1.5, midi: 64 }, // E4
    { bar: 1, beat: 1.5, dur: 1.5, midi: 66 },
    { bar: 1, beat: 3, dur: 1, midi: 64 },

    { bar: 2, beat: 0, dur: 1, midi: 62 },   // D4
    { bar: 2, beat: 1, dur: 1, midi: 64 },
    { bar: 2, beat: 2, dur: 1, midi: 66 },
    { bar: 2, beat: 3, dur: 1, midi: 69 },

    { bar: 3, beat: 0, dur: 4, midi: 69 }    // A4 长音
  ];

  /** 格子 → 音符。连着同一个音并成一个长音，听起来才像「唱」而不是「敲」 */
  function slotsToMelody(slots, beatsPerBar) {
    const beats = beatsPerBar || 4;
    const out = [];
    for (let i = 0; i < slots.length; i++) {
      const m = slots[i];
      if (m === null || m === undefined) continue;
      const bar = Math.floor(i / beats);
      const beat = i % beats;
      const prev = out[out.length - 1];
      if (prev && prev.midi === m && prev.bar === bar && prev.beat + prev.dur === beat) {
        prev.dur += 1;
      } else {
        out.push({ bar: bar, beat: beat, dur: 1, midi: m });
      }
    }
    return out;
  }
  L.slotsToMelody = slotsToMelody;

  /** 反过来：音符 → 16 个格子（只收整拍的音） */
  function melodyToSlots(melody, bars, beatsPerBar) {
    const beats = beatsPerBar || 4;
    const slots = new Array(bars * beats).fill(null);
    melody.forEach(function (n) {
      const d = Math.round(n.dur || 1);
      for (let k = 0; k < d; k++) {
        const i = n.bar * beats + n.beat + k;
        if (i >= 0 && i < slots.length) slots[i] = n.midi;
      }
    });
    return slots;
  }
  L.melodyToSlots = melodyToSlots;

  /* ============================================================
   * 鼓的常用图案（第 2、12、13 课都用）
   * 八分格：0..7。第 2 拍 = 格 2，第 3 拍 = 格 4，第 4 拍 = 格 6。
   * ============================================================ */

  const BASIC_DRUMS = {
    hats: [1, 1, 1, 1, 1, 1, 1, 1],
    snare: [0, 0, 1, 0, 0, 0, 1, 0],
    kick: [1, 0, 0, 0, 1, 0, 0, 0]
  };

  // 同样的底鼓军鼓，只把踩镲从八分改成四分
  const QUARTER_HATS = {
    hats: [1, 0, 1, 0, 1, 0, 1, 0],
    snare: [0, 0, 1, 0, 0, 0, 1, 0],
    kick: [1, 0, 0, 0, 1, 0, 0, 0]
  };

  /* ============================================================
   * 第 1–3 课：只用耳朵
   * ============================================================ */

  const L1 = {
    id: 'l1',
    no: 1,
    title: '它结束了没有',
    sub: '先听那个「落地」',
    keyPc: 2,
    keyLabel: 'D 大调',
    goal: '不用乐理词，听出一段音乐「结束了」和「还悬着」的区别。',
    steps: [
      {
        kind: 'text',
        title: '结束的那一下',
        body: [
          '一段音乐真的结束的时候，身体会有反应：肩膀会松一下，呼吸会落下。',
          '先听两个结尾，都是 8 小节、同样的和弦、同样的速度。',
          '**只有一个真的结束了**，另一个还悬着。不用分析，听身体。'
        ],
        demos: [
          { label: '结尾一', chords: ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'D'], bpm: 92 },
          { label: '结尾二', chords: ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A'], bpm: 92 }
        ]
      },
      {
        kind: 'ab',
        title: '哪一段结束了',
        question: '两段一样长、一样快、和弦几乎一样，只有最后一个小节不同。哪一段真的结束了？',
        bpm: 92,
        bars: 8,
        chordsA: ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'D'],
        chordsB: ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A'],
        abRule: 'endsOnTonic',
        options: [
          { key: 'a', label: '结尾一' },
          { key: 'b', label: '结尾二' }
        ],
        why: '结尾一最后回到了出发的那个和弦，所以「落地」了；结尾二停在半路，所以一直悬着。你还不需要知道这两个和弦叫什么——耳朵先记住这个差别。'
      },
      {
        kind: 'text',
        title: '这件事跟和弦名无关',
        body: [
          '你刚才做的事，就是听出「和声有没有回到主和弦」。',
          '这件事比和弦名重要得多。名字是后来才需要的东西，耳朵不是。',
          '第 4 课我们会把这个「落」拆开看，那时候才需要名字。'
        ]
      }
    ]
  };

  const L2 = {
    id: 'l2',
    no: 2,
    title: '薄的和厚的',
    sub: '主歌和副歌',
    keyPc: 2,
    keyLabel: 'D 大调',
    goal: '听出「薄」和「厚」的差别——那就是主歌和副歌的差别。',
    steps: [
      {
        kind: 'text',
        title: '同一个 4 小节，两遍',
        body: [
          '和弦一模一样，速度一模一样，旋律也没有变。',
          '第一遍是「薄」的，第二遍是「厚」的。',
          '副歌听起来变大，**不是因为它更响**，是因为它更满。'
        ],
        demos: [
          { label: '薄', chords: ['D', 'A', 'Bm', 'G'], bpm: 96 },
          { label: '厚', chords: ['D', 'A', 'Bm', 'G'], bpm: 96, drums: BASIC_DRUMS }
        ]
      },
      {
        kind: 'ab',
        title: '哪一段更像副歌',
        question: '两段的和弦、速度、旋律完全一样。哪一段听起来更像副歌？',
        bpm: 96,
        bars: 4,
        chordsA: ['D', 'A', 'Bm', 'G'],
        chordsB: ['D', 'A', 'Bm', 'G'],
        drumsB: BASIC_DRUMS,
        abRule: 'hasDrums',
        options: [
          { key: 'a', label: '第一段' },
          { key: 'b', label: '第二段' }
        ],
        why: '第二段多了鼓，所以更「满」。副歌变大通常靠三件事：加鼓、加高音、加层次——音量推子只占很小一部分。'
      },
      {
        kind: 'text',
        title: '记住这个，以后不用推推子',
        body: [
          '很多人做副歌，第一反应是把音量推上去。推完会发现：只是变吵了，没有变大。',
          '真正的「变大」来自**多出来的元素**：踩镲、高八度的音、多一层和声。',
          '这一条会一直用到第 12、13 课。'
        ]
      }
    ]
  };

  const L3 = {
    id: 'l3',
    no: 3,
    title: '最低那条线',
    sub: '听出歌往哪走',
    keyPc: 2,
    keyLabel: 'D 大调',
    goal: '把注意力放到最底下那一层，听出它整体在往上还是往下。',
    steps: [
      {
        kind: 'text',
        title: '先只听最底下',
        body: [
          '这段 4 小节，除了和弦，最底下还有一条线在走。',
          '别的都别管，只跟着最低那个音，用「嗯」哼出来。',
          '哼不出来也没关系，先听它是在往上爬还是在往下掉。'
        ],
        demo: { bpm: 92, chords: ['D', 'A', 'Bm', 'G'], bass: true },
        playLabel: '听这 4 小节',
        caption: '和弦 + 一条低音线'
      },
      {
        kind: 'text',
        title: '为什么是最低那条',
        body: [
          '低音线是最容易被忽略的一层，但一首歌「往哪走」，八成由它决定。',
          '旋律可以绕来绕去，低音必须直——它每小节只走一步，方向就是整首歌的方向。',
          '下一题：听一段没听过的，判断它整体往上还是往下。'
        ]
      },
      {
        kind: 'quiz',
        title: '它在往上还是往下',
        question: '这一段的最低音，整体在往上走还是往下走？',
        bpm: 92,
        quizType: 'bassDir',
        chords: ['D', 'Em', 'F#m', 'G'],
        options: ['往上', '往下', '基本不动'],
        why: '低音是 D → E → F# → G，一级一级往上爬。和弦本身也在抬，所以整段听着「越来越亮」。'
      },
      {
        kind: 'text',
        title: '下一步：让它由你来排',
        body: [
          '能跟着哼出低音线，你就已经摸到一首歌的骨架了。',
          '第 4 课开始，这条线不用你听——由你决定。我们会从只有两个和弦开始。'
        ]
      }
    ]
  };

  /* ============================================================
   * 第 4 课
   * ============================================================ */

  const L4 = {
    id: 'l4',
    no: 4,
    title: '只有 1 和 5',
    sub: '一个推，一个落',
    keyPc: 2,
    keyLabel: 'D 大调',
    goal: '4 小节里只用手两个和弦，并且说得出哪一下是「推」。',
    steps: [

      /* ---------------- 0 ---------------- */
      {
        kind: 'text',
        title: '两个和弦就够 4 小节',
        body: [
          '在 D 大调里，第 1 级是 D，第 5 级是 A。',
          '这两个和弦就够写 4 小节了。它们干的事相反：**D 让你觉得「到了」，A 让你觉得「还没到」**。',
          '先听 8 小节。前 6 小节只有 D，第 7 小节换成 A，第 8 小节回到 D。听的时候不用分析，只注意一件事——第 7 小节那一下，你有没有想往下走。'
        ],
        demo: { bpm: 92, chords: ['D', 'D', 'D', 'D', 'D', 'D', 'A', 'D'], bass: true },
        playLabel: '听这 8 小节',
        caption: '6 小节 D → 1 小节 A → 回到 D'
      },

      /* ---------------- 1 ---------------- */
      {
        kind: 'ab',
        title: '哪一段「没回家」',
        question: '两段一样长、旋律一模一样，只有和弦的顺序不同。哪一段的最后停在「还没回家」的地方？',
        bpm: 96,
        bars: 4,
        chordsA: ['D', 'A', 'D', 'A'],
        chordsB: ['D', 'A', 'D', 'D'],
        melody: PHRASE_4BARS,
        options: [
          { key: 'a', label: 'A 段' },
          { key: 'b', label: 'B 段' }
        ],
        why: 'A 段最后停在 A（第 5 级），B 段回到了 D（第 1 级）。第 5 级天生不安定，它想往下掉回第 1 级——这就是「推」和「落」。'
      },

      /* ---------------- 2 ---------------- */
      {
        kind: 'text',
        title: '为什么 A 不安定',
        body: [
          'A 和弦的三个音是 **A–C#–E**。其中 C# 是 D 大调的第 7 级音，离 D 只差半个音。',
          '半个音的东西站不住。所以只要 C# 在响，耳朵就在等它往上走到 D。',
          'D 和弦的三个音是 **D–F#–A**，里面没有这种「只差半个音」的关系，它自己就是终点。',
          '听一遍 A → A → D → D。第 3 小节 D 进来的那一下，就是那个「塌下来」的感觉。'
        ],
        demo: { bpm: 88, chords: ['A', 'A', 'D', 'D'], bass: true },
        playLabel: '听 A 到 D',
        caption: 'A A D D'
      },

      /* ---------------- 3 ---------------- */
      {
        kind: 'build',
        title: '你来摆 4 小节',
        instruction: '先在上面选一个和弦，再点小节，把它放进去。摆完点播放。',
        bars: 4,
        allowed: ['D', 'A'],
        initial: ['D', null, null, 'D'],
        rules: { first: 'D', last: 'D', variety: true },
        passMsg: '成立。听一遍，再想想第 2、3 小节换一下会变成什么。',
        hint: '想让它「推」一下，就把 A 放在第 2 或第 3 小节。两小节都放 A，它会悬得更久。'
      },

      /* ---------------- 4 ---------------- */
      {
        kind: 'quiz',
        title: '换一段，数一数',
        question: '这一段一共 8 小节。A 和弦（第 5 级）出现了几次？',
        bpm: 100,
        chords: ['D', 'A', 'D', 'A', 'D', 'D', 'A', 'D'],
        options: [2, 3, 4, 5],
        optionSuffix: ' 次'
      },

      /* ---------------- 5 ---------------- */
      {
        kind: 'export',
        title: '把它变成文件',
        body: [
          '你摆的这 4 小节可以导出了。文件是标准 MIDI（Type 1），三条轨：',
          '**Chords**、**Bass**，还有一条空着的 **Vocal**——长度已经按整首写好，拖进 Studio One 直接在它上面建 VOCALOID6 轨道就行。',
          '先不用管音色。这 4 小节的价值在于它是你自己决定的，不是照着抄的。'
        ],
        tip: '导出的调号是 D 大调、速度 96。要换速度就在 Studio One 里改，别在这里改。'
      }
    ]
  };

  /* ============================================================
   * 第 5 课
   * ============================================================ */

  // 第 1 小节第 1 拍拍在 E 上——D 和弦里没有 E，故意的
  const OFF_PHRASE = PHRASE_4BARS.map(function (n, i) {
    return i === 0 ? { bar: 0, beat: 0, dur: 1, midi: 64 } : n;
  });

  // 第 3 小节是 D 和弦，第 1 拍拍在 B 上（六度，不在和弦里）
  const OFF_BAR3 = PHRASE_4BARS.map(function (n) {
    return (n.bar === 2 && n.beat === 0)
      ? { bar: 2, beat: 0, dur: 1, midi: 71 }
      : n;
  });

  const L5 = {
    id: 'l5',
    no: 5,
    title: '配一句哼唱',
    sub: '4 小节上写一条旋律',
    keyPc: 2,
    keyLabel: 'D 大调',
    goal: '写一句能唱、强拍都落在和弦音上的旋律，并把它写进 Vocal 轨。',
    usesHarmony: true,
    defaultHarmony: ['D', 'A', 'D', 'D'],
    steps: [

      /* ---------------- 0 ---------------- */
      {
        kind: 'text',
        title: '先听一句已经写好的',
        body: [
          '这 4 小节是 **D – A – D – D**。和弦你已经会摆了，这一课在上面加一条旋律。',
          '旋律不用发明。**只要每个强拍上的音，恰好是那一小节和弦里的音**，它自己就会像话。',
          '先听。只注意一件事：每一小节第 1 拍唱的那个音，落稳了没有。'
        ],
        demo: { bpm: 96, chords: ['D', 'A', 'D', 'D'], melody: PHRASE_4BARS },
        playLabel: '听和弦 + 旋律',
        caption: 'D – A – D – D，上面一句四小节的旋律'
      },

      /* ---------------- 1 ---------------- */
      {
        kind: 'text',
        title: '强拍落和弦音',
        body: [
          '三条规则里，这一课只用第一条：**第 1、3 拍上唱的音，必须是当前小节和弦的三个音之一**。',
          '第 2、4 拍可以不是和弦音，但它得是「路过」的——下一拍要落回去。',
          '听下面两个版本。旋律一模一样，只有第 1 小节第 1 拍那个音不同。'
        ],
        demos: [
          { label: '第 1 拍唱 E ——不在 D 里', chords: ['D', 'A', 'D', 'D'], melody: OFF_PHRASE },
          { label: '第 1 拍唱 A ——D 的五音', chords: ['D', 'A', 'D', 'D'], melody: PHRASE_4BARS }
        ]
      },

      /* ---------------- 2 ---------------- */
      {
        kind: 'melody',
        title: '你来摆 8 个音',
        instruction: '先在上面选一个音，再点格子。每格一拍，一小节 4 拍。绿色那几行，是这一小节和弦里的音。',
        bars: 4,
        palette: [62, 64, 66, 69, 71, 74],
        rules: { strongBeats: [0, 2], minNotes: 10, minDistinct: 3 },
        hint: '四个小节的第 1、3 拍必须先放满，而且必须是绿行——这就 8 个音了。听一遍，再往第 2、4 拍上补。'
      },

      /* ---------------- 3 ---------------- */
      {
        kind: 'quiz',
        title: '找一句错的',
        question: '这一段四小节，第 1 拍里有一小节的音不在那小节的和弦里。是第几小节？',
        bpm: 100,
        quizType: 'offStrongBeat',
        chords: ['D', 'A', 'D', 'D'],
        melody: OFF_BAR3,
        options: [1, 2, 3, 4],
        optionSuffix: ' 小节',
        why: '第 3 小节是 D 和弦（D–F#–A），第 1 拍拍的是 B。B 是 D 的六度——它悬在半空，而且正好落在强拍上，所以听着不舒服。'
      },

      /* ---------------- 4 ---------------- */
      {
        kind: 'export',
        title: '这次 Vocal 轨里有东西',
        body: [
          '你的 4 小节，加上这一句旋律，可以一起导出了。',
          '**旋律会写进 Vocal 轨。** 拖进 Studio One，在这条轨上建 VOCALOID6——音高和节奏都已经在了，只差歌词。',
          '这句只有 4 小节，但它是你写的：和弦是你摆的，音是你放上去的。'
        ],
        tip: '歌词是下一步的事。先把音高和节奏唱对，再填字。'
      }
    ]
  };

  /* ============================================================
   * 第 8 课
   * ============================================================ */

  const L8 = {
    id: 'l8',
    no: 8,
    title: '换一个顺序',
    sub: '1-5-6m-4 和 1-4-5-6m',
    keyPc: 2,
    keyLabel: 'D 大调',
    goal: '把同一组四个和弦排出自己的顺序，说出它和最常见那两种差在哪。',
    doubleBars: true,
    steps: [

      /* ---------------- 0 ---------------- */
      {
        kind: 'text',
        title: '同一组和弦，两种排法',
        body: [
          'D 大调里取四个和弦：**D（1）、A（5）、Bm（6m）、G（4）**。',
          '还是这四个，换一下顺序，就是另一首歌。',
          '先听 **D–A–Bm–G** 走两遍。它最后停在 G，没有回 D。听的时候注意一件事：每次到第 2 小节那个 A，是不是有一股「要冲出去」的劲。'
        ],
        demo: { bpm: 100, chords: ['D', 'A', 'Bm', 'G', 'D', 'A', 'Bm', 'G'] },
        playLabel: '听 1-5-6m-4',
        caption: 'D – A – Bm – G，两遍'
      },

      /* ---------------- 1 ---------------- */
      {
        kind: 'ab',
        title: '哪一段落到了「暗」的那一个',
        question: '两段用的是同一组和弦、同一个音色，只有顺序不同。哪一段最后落到了 Bm（第 6 级，那个「暗」的）？',
        bpm: 100,
        bars: 4,
        chordsA: ['D', 'A', 'Bm', 'G'],
        chordsB: ['D', 'G', 'A', 'Bm'],
        abRule: 'endsOnDegree',
        degree: 6,
        options: [
          { key: 'a', label: 'A 段' },
          { key: 'b', label: 'B 段' }
        ],
        why: 'A 段最后停在 G（第 4 级），它悬着，像还要再来一遍；B 段最后落到 Bm（第 6 级）——那是关系小调，听起来像话没说完就转身走了。'
      },

      /* ---------------- 2 ---------------- */
      {
        kind: 'text',
        title: '两种排法，两个方向',
        body: [
          '**1-5-6m-4（D–A–Bm–G）**：先把张力顶到 A，然后回避主和弦、落到 Bm，最后退到 G。因为它永远不回 D，所以能一直转下去——副歌循环最常见的就是它。',
          '**1-4-5-6m（D–G–A–Bm）**：先往下压到 G，再抬到 A，最后一脚踩空落到 Bm。它有一个明显的「上台阶」，所以常放在主歌尾、预副歌。',
          '共同点：都是这四个和弦，都不回 D。区别只在**什么时候冲、什么时候落**。'
        ],
        demo: { bpm: 100, chords: ['D', 'G', 'A', 'Bm', 'D', 'G', 'A', 'Bm'] },
        playLabel: '听 1-4-5-6',
        caption: 'D – G – A – Bm，两遍'
      },

      /* ---------------- 3 ---------------- */
      {
        kind: 'build',
        title: '你排一个',
        instruction: '只许用这四个和弦。第 1 小节固定是 D，最后一个小节不许是 D——这一课讲的就是「不回主和弦」。摆完点检查，我告诉你排出来的是哪个进行。',
        bars: 4,
        allowed: ['D', 'A', 'Bm', 'G'],
        initial: ['D', null, null, null],
        rules: { first: 'D', lastNot: 'D' },
        nameIt: 'all',
        hint: '一共只有六种排法。每一种听起来都不一样——排完多放几遍，再换下一种。'
      },

      /* ---------------- 4 ---------------- */
      {
        kind: 'quiz',
        title: '这一段停在哪儿',
        question: '听这一段四小节。它最后停在哪个和弦？',
        bpm: 104,
        quizType: 'lastChord',
        chords: ['D', 'Bm', 'G', 'A'],
        options: ['D', 'A', 'Bm', 'G'],
        why: '最后停在 A（第 5 级）。它没回 D，也没落到小调——这叫半终止，听起来像话说到一半，等你接下一句。'
      },

      /* ---------------- 5 ---------------- */
      {
        kind: 'export',
        title: '八小节',
        body: [
          '你排的这 4 小节放两遍，就是 8 小节——够撑起一个完整的主歌或副歌了。',
          '导出的 `Chords` 和 `Bass` 是它的骨架；`Vocal` 轨留空，要唱歌就在上面建 VOCALOID6。',
          '想让这 8 小节有人声，回第 5 课的办法：先把强拍上的音定下来，弱拍随便走。'
        ],
        tip: '同一个 4 小节重复两遍，第二遍换一层乐器就会像「发展」了。这件事网站判不了，得你自己在 Studio One 里试。'
      }
    ]
  };

  /* ============================================================
   * 第 10 课
   * ============================================================ */

  // 两小节一句，两句之间在第 2、4 小节的第 4 拍换气
  const PHRASE_10_SLOTS = [
    69, 69, 66, 62,      // A A F# D
    69, 71, 64, null,    // A B E（空）
    66, 66, 69, 62,      // F# F# A D
    74, 71, 66, null     // D5 B F#（空）
  ];

  // 故意不换气的版本：把两个空拍填上
  const PHRASE_10_NOREST = PHRASE_10_SLOTS.map(function (m, i) {
    if (m !== null) return m;
    return i === 7 ? 66 : 69;
  });

  const L10 = {
    id: 'l10',
    no: 10,
    title: '两小节一句',
    sub: '给它一个呼吸',
    keyPc: 2,
    keyLabel: 'D 大调',
    goal: '把一串音写成两句：每句两小节，句尾换气，每句有长音，第二句不照抄第一句。',
    usesHarmony: true,
    defaultHarmony: ['D', 'A', 'D', 'D'],
    doubleBars: true,
    steps: [

      /* ---------------- 0 ---------------- */
      {
        kind: 'text',
        title: '一句话有多长',
        body: [
          '上一课你写了一串音。这一课把它写成**两句话**。',
          '一句 = 2 小节。说完要换气——第 2 小节和第 4 小节的最后**一拍空着**。',
          '先听这句示范：D–A–D–D 上面一句旋律，第 2 小节末尾和第 4 小节末尾各空了一拍。'
        ],
        demo: {
          bpm: 92,
          chords: ['D', 'A', 'D', 'D'],
          melody: slotsToMelody(PHRASE_10_SLOTS, 4)
        },
        playLabel: '听这句',
        caption: 'A A F# D ｜ A B E ＿ ｜ F# F# A D ｜ D5 B F# ＿'
      },

      /* ---------------- 1 ---------------- */
      {
        kind: 'text',
        title: '换气，和长音',
        body: [
          '两件事让一串音变成句子。',
          '**换气**：第 2、4 小节的第 4 拍不唱。空出来的那一下，人才听得出来这是两句。',
          '**长音**：每句至少有一个音要撑住两拍——同一个音连着放两格。全是 1 拍的音，听起来像念经。',
          '下面两个版本只有空拍不同。'
        ],
        demos: [
          { label: '一口气唱完（第 2、4 小节第 4 拍都有音）', chords: ['D', 'A', 'D', 'D'], melody: slotsToMelody(PHRASE_10_NOREST, 4) },
          { label: '有空拍（两句）', chords: ['D', 'A', 'D', 'D'], melody: slotsToMelody(PHRASE_10_SLOTS, 4) }
        ]
      },

      /* ---------------- 2 ---------------- */
      {
        kind: 'melody',
        title: '你来写两句',
        instruction: '规则加了三条：第 2、4 小节的第 4 拍必须空着；每句至少一个音要撑两拍（同一个音连着放两格）；两句的收尾音不能一样。',
        bars: 4,
        palette: [62, 64, 66, 69, 71, 74],
        rules: {
          strongBeats: [0, 2],
          minNotes: 10,
          minDistinct: 3,
          restBeats: [{ bar: 1, beat: 3 }, { bar: 3, beat: 3 }],
          longNotePerPhrase: true,
          phraseBars: 2,
          differentEndings: true
        },
        hint: '先把两句的强拍摆满（第 1、3 拍），再挑一个音连放两格当长音，最后把第 2、4 小节的第 4 拍擦掉。',
        passMsg: '成立。这就是两句了。听一遍，注意第 2 小节末尾和第 4 小节末尾那两下空白——人声就在那儿换气。'
      },

      /* ---------------- 3 ---------------- */
      {
        kind: 'quiz',
        title: '它只在哪儿换了口气',
        question: '这一段四小节，只在一个小节的末尾换了气（那一拍空着）。是第几小节？',
        bpm: 96,
        quizType: 'breathBar',
        chords: ['D', 'A', 'D', 'D'],
        melody: slotsToMelody(PHRASE_10_NOREST.map(function (m, i) {
          return i === 11 ? null : m;      // 只留第 3 小节末尾那一拍
        }), 4),
        options: [1, 2, 3, 4],
        optionSuffix: ' 小节',
        why: '只有第 3 小节末尾空着。另外三处都在唱，所以听起来是一长串，不是两句。'
      },

      /* ---------------- 4 ---------------- */
      {
        kind: 'export',
        title: '八小节，四句',
        body: [
          '你这 4 小节放两遍，就是 8 小节——四个两小节的句子，正好是主歌的长度。',
          '旋律仍然写进 **Vocal 轨**。这次它是有呼吸的：句尾空着，人声才有地方换气。',
          '拿去 Studio One，挂上 VOCALOID6，句尾那两拍空拍就是 GUMI 换气的位置。'
        ],
        tip: '真唱的时候，换气的地方往往还要再早半拍。先在 GUMI 里听一遍，再决定空拍够不够。'
      }
    ]
  };

  /* ============================================================
   * 第 12 课
   * ============================================================ */

  const L12 = {
    id: 'l12',
    no: 12,
    title: '加一个鼓',
    sub: '八分音符怎么推',
    keyPc: 2,
    keyLabel: 'D 大调',
    goal: '给 4 小节配一个能推起来的鼓：八分踩镲不停，底鼓 1、3，军鼓 2、4。',
    usesHarmony: true,
    defaultHarmony: ['D', 'A', 'D', 'D'],
    usesMelody: 'l10',
    doubleBars: true,
    steps: [

      /* ---------------- 0 ---------------- */
      {
        kind: 'text',
        title: '有鼓和没鼓',
        body: [
          '同一段和声，听两遍。先没有鼓，再加鼓。',
          '加进去以后，它不只是变响了——**时间开始往前走**。同一个小节，本来只是"在那儿"，现在有了要去的方向。',
          '这一课就是搞明白那一下是从哪来的。'
        ],
        demos: [
          { label: '只有和声', chords: ['D', 'A', 'D', 'D'] },
          { label: '加鼓', chords: ['D', 'A', 'D', 'D'], drums: BASIC_DRUMS }
        ]
      },

      /* ---------------- 1 ---------------- */
      {
        kind: 'text',
        title: '三件东西',
        body: [
          '**底鼓**：第 1、3 拍。它像心跳，决定这首歌有多"重"。',
          '**军鼓**：第 2、4 拍。它是拍手的位置，人跟着点头就点在这儿。',
          '**踩镲**：八分音符，**一直不停**。推进感来自这里——不是来自速度。',
          '下面两个版本，鼓点完全一样，只有踩镲一个是八分、一个是四分。听差别。'
        ],
        demos: [
          { label: '八分踩镲（推）', chords: ['D', 'A', 'D', 'D'], drums: BASIC_DRUMS },
          { label: '四分踩镲（拖）', chords: ['D', 'A', 'D', 'D'], drums: QUARTER_HATS }
        ],
        caption: '同一个速度，只改踩镲密度'
      },

      /* ---------------- 2 ---------------- */
      {
        kind: 'rhythm',
        title: '你摆一个基本型',
        instruction: '点格子开关。先摆最基础的四拍：八格踩镲全亮，底鼓在第 1 拍，军鼓在第 2、4 拍。',
        rules: { hatsAll: true, kickAt: [0], snareAt: [2, 6] },
        hint: '摆完以后，试着在第 2、3 拍之间多放一个底鼓——这就是「加密」，副歌常用。放完再听一遍。'
      },

      /* ---------------- 3 ---------------- */
      {
        kind: 'quiz',
        title: '哪一排一直在响',
        question: '听这段鼓。三排里，有一排在整个小节里**一直没有停**。是哪一排？',
        bpm: 100,
        quizType: 'alwaysRow',
        chords: ['D', 'A', 'D', 'D'],
        drums: BASIC_DRUMS,
        options: ['底鼓', '军鼓', '踩镲', '都没有'],
        why: '踩镲八个格全亮，所以它一直在响。底鼓只在第 1、3 拍，军鼓只在第 2、4 拍——它们给的是"点"，踩镲给的是"线"。'
      },

      /* ---------------- 4 ---------------- */
      {
        kind: 'export',
        title: '八小节，有鼓了',
        body: [
          '和声、旋律（如果第 5、10 课写过）、鼓，现在一起导出。',
          '文件里会多一条 **Drums** 轨，用的是通用 MIDI 打击乐（第 10 通道）：底鼓 36、军鼓 38、闭合踩镲 42。',
          '拖进 Studio One，Battery 或者 Impact XT 都能直接认。'
        ],
        tip: '真做歌的时候，鼓不会一直不变：主歌减一半、副歌加密。这个网站在教「怎么摆」，不教「什么时候变」——那得靠听歌。'
      }
    ]
  };

  // 主歌型：军鼓只在第 3 拍（half-time），底鼓只 1 拍
  const VERSE_DRUMS = {
    hats: [1, 1, 1, 1, 1, 1, 1, 1],
    snare: [0, 0, 0, 0, 1, 0, 0, 0],
    kick: [1, 0, 0, 0, 0, 0, 0, 0]
  };

  // 副歌型：军鼓回到 2、4 拍，底鼓 1、3 拍
  const CHORUS_DRUMS = {
    hats: [1, 1, 1, 1, 1, 1, 1, 1],
    snare: [0, 0, 1, 0, 0, 0, 1, 0],
    kick: [1, 0, 0, 0, 1, 0, 0, 0]
  };

  const L13 = {
    id: 'l13',
    no: 13,
    title: '主歌和副歌',
    sub: '同一个鼓，两套密度',
    keyPc: 2,
    keyLabel: 'D 大调',
    goal: '给 4 小节配两套鼓：前两小节沉，后两小节打开。',
    usesHarmony: true,
    defaultHarmony: ['D', 'A', 'D', 'D'],
    usesMelody: 'l10',
    doubleBars: true,
    steps: [

      /* ---------------- 0 ---------------- */
      {
        kind: 'text',
        title: '四小节，两套鼓',
        body: [
          '听 4 小节：前 2 小节一套鼓，后 2 小节换成另一套。',
          '注意第 3 小节进来那一下——**不是变响了，是变密了**。',
          '这是流行歌里最省力的「发展」：和弦不动、旋律不动，只换鼓的密度。'
        ],
        demos: [
          { label: '4 小节全用主歌型', chords: ['D', 'A', 'D', 'D'], drums: { patterns: [VERSE_DRUMS], map: [0] } },
          { label: '前 2 主歌型，后 2 副歌型', chords: ['D', 'A', 'D', 'D'], drums: { patterns: [VERSE_DRUMS, CHORUS_DRUMS], map: [0, 0, 1, 1] } }
        ]
      },

      /* ---------------- 1 ---------------- */
      {
        kind: 'text',
        title: 'half-time 是什么',
        body: [
          '主歌型里，**军鼓只在第 3 拍**，第 2、4 拍空着。这叫 half-time——同样的速度，感觉慢一半，听起来「沉」。',
          '副歌型把军鼓退回第 2、4 拍，底鼓也从 1 拍变成 1、3 拍。密度一上来，歌就「打开」了。',
          '先听主歌型单独走一遍，再听副歌型单独走一遍。'
        ],
        demos: [
          { label: '主歌型（half-time）', chords: ['D', 'A', 'D', 'D'], drums: { patterns: [VERSE_DRUMS], map: [0] } },
          { label: '副歌型', chords: ['D', 'A', 'D', 'D'], drums: { patterns: [CHORUS_DRUMS], map: [0] } }
        ]
      },

      /* ---------------- 2 ---------------- */
      {
        kind: 'rhythm',
        dual: true,
        title: '你摆两套',
        instruction: '上面切换「主歌型 / 副歌型」，各摆一套。踩镲都要八格全亮；主歌军鼓只在第 3 拍；副歌军鼓在第 2、4 拍、底鼓在第 1、3 拍。副歌总音数要比主歌多至少 2 下。',
        rules: {
          verse: { hatsAll: true, kickAt: [0], snareAt: [4] },
          chorus: { hatsAll: true, kickAt: [0, 4], snareAt: [2, 6] }
        },
        hint: '先听「全用主歌型」，再听「两套连起来」。差别就是第 3 小节那一下。'
      },

      /* ---------------- 3 ---------------- */
      {
        kind: 'export',
        title: '八小节，两套鼓',
        body: [
          '4 小节放两遍，就是 8 小节：主歌主歌副歌副歌，再来一遍。',
          '导出的 `Drums` 轨会按这个顺序写——前两小节是主歌型，后两小节是副歌型。',
          '到 Studio One 里，你可以把这两套鼓换成自己的音色，但**密度关系别改**，那是这一段能不能「打开」的关键。'
        ],
        tip: '真歌里通常更长：主歌 8、副歌 8。这里缩成 2+2，是为了让你在一屏里听清那一下变化。'
      }
    ]
  };

  /* ============================================================
   * 第 7 课
   * ============================================================ */

  const L7 = {
    id: 'l7',
    no: 7,
    title: '换个家',
    sub: '同一组音，换个重心',
    keyPc: 9,
    mode: 'minor',
    keyLabel: 'A 小调',
    goal: '把 4 小节摆在 A 小调上，听同一个和弦组换个家以后的样子。',
    doubleBars: true,
    steps: [

      /* ---------------- 0 ---------------- */
      {
        kind: 'text',
        title: '同一组和弦，两个家',
        body: [
          'C 大调和 A 小调用的是**同一组七个音**。区别只在哪个和弦算「家」。',
          '先听 A 小调的 **i–VI–III–VII**：Am – F – C – G。',
          '它一直在动，但永远「没落地」——因为家本身是暗的。'
        ],
        demo: { bpm: 100, chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'] },
        playLabel: '听 Am–F–C–G',
        caption: 'A 小调的 i–VI–III–VII，两遍'
      },

      /* ---------------- 1 ---------------- */
      {
        kind: 'text',
        title: '小调少了哪三个半音',
        body: [
          '小调的音阶里，**第 3、6、7 级比大调低半音**。',
          '所以 A 小调的 III、VI、VII 是大三和弦：**C、F、G**——和 C 大调里那几个一模一样。',
          'A 小调的七个和弦是：**Am – Bdim – C – Dm – Em – F – G**。',
          '下面两段音集完全相同，只是重心不同。先听大调，再听小调。'
        ],
        demos: [
          { label: 'C 大调：C–Am–F–G', chords: ['C', 'Am', 'F', 'G'] },
          { label: 'A 小调：Am–F–C–G', chords: ['Am', 'F', 'C', 'G'] }
        ]
      },

      /* ---------------- 2 ---------------- */
      {
        kind: 'build',
        title: '你摆一段小调',
        instruction: '第 1 小节固定是 Am（那是这个调的家）。后面三个小节从这六个和弦里挑。摆完点检查，我告诉你排出来的是哪个进行。',
        bars: 4,
        allowed: ['Am', 'F', 'C', 'G', 'Dm', 'Em'],
        initial: ['Am', null, null, null],
        rules: { first: 'Am', variety: true },
        nameIt: true,
        hint: '想让它是「小调」而不是「C 大调」，就别在结尾回到 C。停在 Am 是落地，停在 G 或 Em 是悬着。'
      },

      /* ---------------- 3 ---------------- */
      {
        kind: 'export',
        title: '八小节，小调',
        body: [
          '4 小节放两遍，就是 8 小节。导出的时候调号会写成 **A 小调**（和 C 大调一样，没有升降号），但调式标记是 minor。',
          'Studio One 里看着是同一个调号，听感却是暗的——这件事只有耳朵知道。'
        ],
        tip: '把小调的 Am 换成 A 大三和弦，同一段会突然变亮。那一手叫「同主音大调」，很多副歌最后一句用它。'
      }
    ]
  };

  /* ============================================================
   * 第 11 课
   * ============================================================ */

  const L11 = {
    id: 'l11',
    no: 11,
    title: '进软件',
    sub: '把它变成一首歌',
    keyPc: 2,
    keyLabel: 'D 大调',
    goal: '把前面导出的东西在 Studio One 里变成一首能听的歌。',
    steps: [

      /* ---------------- 0 ---------------- */
      {
        kind: 'text',
        title: '网站到这儿就停了',
        body: [
          '接下来是 Studio One 里的事。网站判不了「音色好不好」「人声够不够」。',
          '但可以给你一张清单。**做一条勾一条**，全是手上动作，没有需要理解的东西。',
          '全勾完，你手上就有一首 8 小节的完整 demo 了。'
        ]
      },

      /* ---------------- 1 ---------------- */
      {
        kind: 'checklist',
        title: '对着做一遍',
        intro: '需要：Studio One 7、VOCALOID6、GUMI，还有上一课导出的 .mid。',
        items: [
          '新建一首，速度 96、4/4，调号 D 大调（两个升号）',
          '把导出的 .mid 拖进去，确认四条轨都在：Chords / Bass / Drums / Vocal',
          '在 Vocal 轨上插 VOCALOID6，加载 GUMI，确认音高都画出来了',
          '给 Vocal 填一句歌词——先随便什么，能唱就行',
          '播一遍，把各轨音量调平：鼓别盖住人声，贝斯别糊掉底鼓',
          '导出 30 秒，发给自己，戴上耳机从头听一遍'
        ]
      },

      /* ---------------- 2 ---------------- */
      {
        kind: 'text',
        title: '然后呢',
        body: [
          '到这里你已经有一首 8 小节的东西：和声是你排的，旋律是你摆的，鼓是你配的，人声在 GUMI 嘴里。',
          '下一件事不是学新知识，是**把它听完**，然后写下一句话：',
          '「我最不满意的是 ______。」',
          '那句话就是你的下一课。网站能教的是通用手法，你耳朵挑出来的那个毛病，才是你真正要解决的问题。'
        ]
      }
    ]
  };

  /* ============================================================
   * 目录
   * ============================================================ */

  L.LESSONS = [L1, L2, L3, L4, L5, L7, L8, L10, L11, L12, L13];

  // 还没有待做的课了，留个空数组省得别处判空
  L.PLANNED = [];

  L.byId = function (id) {
    return L.LESSONS.filter(function (l) { return l.id === id; })[0] || null;
  };

  /* ============================================================
   * 判分（课程数据和自检脚本共用同一套）
   * ============================================================ */

  /** 你摆的 4 小节满不满足这一课的约束 */
  L.checkBuild = function (step, chords) {
    const allowed = step.allowed || [];
    const rules = step.rules || {};

    for (let i = 0; i < chords.length; i++) {
      if (!chords[i]) return { ok: false, msg: '第 ' + (i + 1) + ' 小节还是空的。' };
    }
    for (let i = 0; i < chords.length; i++) {
      if (allowed.indexOf(chords[i]) < 0) {
        return { ok: false, msg: '第 ' + (i + 1) + ' 小节用了 ' + chords[i] + '。这一课只允许 ' + allowed.join(' / ') + '。' };
      }
    }
    if (rules.first && chords[0] !== rules.first) {
      return { ok: false, msg: '第 1 小节得是 ' + rules.first + '，那是「家」。' };
    }
    if (rules.last && chords[chords.length - 1] !== rules.last) {
      return { ok: false, msg: '最后一个小节得回到 ' + rules.last + '，不然它一直悬着。' };
    }
    if (rules.lastNot && chords[chords.length - 1] === rules.lastNot) {
      return { ok: false, msg: '最后一个小节不能是 ' + rules.lastNot + '。这一课讲的就是「不回主和弦」——它得悬着，或者落到别处。' };
    }
    if (rules.variety && chords.every(function (c) { return c === chords[0]; })) {
      return { ok: false, msg: '四个小节全是同一个和弦，就没有「推」这回事了。放一个 A 进去试试。' };
    }
    return { ok: true, msg: step.passMsg || '成立。' };
  };

  /* ============================================================
   * 认进行：学员排出来的东西叫什么
   * ============================================================ */

  // 只写"它是什么"，级数前缀由 progressionName 拼，别重复
  const PROG_NAMES = {
    '1,5,6,4': '王道进行的一种，副歌循环最常见',
    '1,4,5,6': '先压下去再抬起来，最后落到小调',
    '1,6,4,5': '卡农进行，一直在往下走',
    '1,6,5,4': '小调和弦先出来，比卡农更沉',
    '1,4,6,5': '绕一圈再抬到第 5 级，收在半空',
    '1,5,4,6': '冲一下再退，落在小调'
  };

  // 小调里最常被拿来当「那个循环」的几条
  const MINOR_NAMES = {
    '1,6,3,7': '小调最常用的循环，跟大调的 1-5-6m-4 是一对',
    '1,4,7,3': '先沉下去，再从底下抬回来',
    '1,7,6,5': '一路往下走，停在 v 上，等你接下一句',
    '1,5,6,4': '小调版的 1-5-6m-4，冲一下再退'
  };

  /**
   * ['D','A','Bm','G'] → { degrees: '1-5-6m-4', name: '……' }
   * 名字只是"这个进行大家都这么叫"，认不出来就返回 null，别硬编。
   */
  L.progressionName = function (chords, keyPc, mode) {
    const deg = chords.map(function (c) { return c ? MT.degreeOf(c, keyPc, mode) : 0; });
    const label = chords.map(function (c, i) {
      if (!c) return String(deg[i]);
      const minor = MT.parseChord(c).quality.indexOf('min') === 0;
      return deg[i] + (minor ? 'm' : '');
    }).join('-');

    const table = mode === 'minor' ? MINOR_NAMES : PROG_NAMES;
    const known = table[deg.join(',')];
    return { degrees: label, name: known || null };
  };

  /**
   * 把一串和弦读成一张卡片：级数、罗马数字、低音、怎么收的、叫什么。
   * 拆歌工具用它，自检也用它。
   */
  L.analyzeProgression = function (chords, keyPc, mode) {
    const list = (chords || []).filter(Boolean);
    if (!list.length) return null;

    const degs = list.map(function (c) { return MT.degreeOf(c, keyPc, mode); });
    const named = L.progressionName(list, keyPc, mode);
    const lastDeg = degs[degs.length - 1];

    return {
      degrees: named.degrees,
      name: named.name,
      roman: list.map(function (c) { return MT.romanOf(c, keyPc, mode); }).join('–'),
      bass: list.map(function (c) { return MT.rootName(c); }).join('–'),
      endsHome: lastDeg === 1,
      lastRoman: MT.romanOf(list[list.length - 1], keyPc, mode),
      outOfKey: degs.filter(function (d) { return d === 0; }).length
    };
  };

  /* ============================================================
   * 鼓
   * ============================================================ */

  /** 你摆的鼓点满不满足这一课的约束 */
  L.checkDrums = function (step, pattern) {
    const rules = step.rules || {};
    const p = pattern || {};

    if (rules.hatsAll !== false) {
      const missing = [];
      for (let i = 0; i < 8; i++) {
        if (!(p.hats && p.hats[i])) missing.push(i + 1);
      }
      if (missing.length) {
        return {
          ok: false,
          msg: '踩镲还有 ' + missing.length + ' 格空着（第 ' + missing.join('、') +
            ' 格）。八分音符要一直不停——推进感就来自这里。'
        };
      }
    }

    const kickAt = rules.kickAt || [];
    for (let i = 0; i < kickAt.length; i++) {
      if (!(p.kick && p.kick[kickAt[i]])) {
        return { ok: false, msg: '第 ' + (Math.floor(kickAt[i] / 2) + 1) + ' 拍要有底鼓。' };
      }
    }

    const snareAt = rules.snareAt || [];
    for (let i = 0; i < snareAt.length; i++) {
      if (!(p.snare && p.snare[snareAt[i]])) {
        return { ok: false, msg: '第 ' + (Math.floor(snareAt[i] / 2) + 1) + ' 拍要有军鼓。' };
      }
    }

    const extras = (p.kick || []).filter(function (v, i) { return v && i !== 0 && i !== 4; }).length;
    return {
      ok: true,
      msg: extras > 0
        ? '成立。你加了 ' + extras + ' 个额外的底鼓——这就是「加密」，副歌常用。再听一遍，注意它把八分音符切成了几段。'
        : '成立。这是最基础的四拍。听一遍，再试着在第 2、3 拍之间多放一个底鼓。'
    };
  };

  /** 哪一排是整小节一直在响的 */
  L.rowAlwaysOn = function (pattern) {
    const rows = [['hats', '踩镲'], ['snare', '军鼓'], ['kick', '底鼓']];
    const out = [];
    rows.forEach(function (r) {
      const a = (pattern && pattern[r[0]]) || [];
      if (a.length === 8 && a.every(function (v) { return !!v; })) out.push(r[1]);
    });
    return out;
  };

  /** 两套鼓（主歌 / 副歌）：各自合法，而且副歌必须更密 */
  L.checkDrums2 = function (step, state) {
    const pats = (state && state.patterns) || [];
    const verse = pats[0];
    const chorus = pats[1];
    if (!verse || !chorus) return { ok: false, msg: '两套鼓都要摆。' };

    const rules = step.rules || {};
    const rv = L.checkDrums({ rules: rules.verse || {} }, verse);
    if (!rv.ok) return { ok: false, msg: '主歌型：' + rv.msg };

    const rc = L.checkDrums({ rules: rules.chorus || {} }, chorus);
    if (!rc.ok) return { ok: false, msg: '副歌型：' + rc.msg };

    const count = function (p) {
      return p.hats.reduce(function (a, b) { return a + b; }, 0) +
        p.snare.reduce(function (a, b) { return a + b; }, 0) +
        p.kick.reduce(function (a, b) { return a + b; }, 0);
    };
    const vn = count(verse);
    const cn = count(chorus);
    if (cn < vn + 2) {
      return {
        ok: false,
        msg: '副歌型只有 ' + cn + ' 下，主歌型 ' + vn + ' 下。副歌至少要多 2 下，不然听不出「打开」。'
      };
    }

    return {
      ok: true,
      msg: '成立。主歌 ' + vn + ' 下、副歌 ' + cn + ' 下。听一遍——第 3 小节那一下不是变响，是变密。'
    };
  };

  /** 四个小节 + 一句旋律，强拍上有没有踩到和弦外 */
  L.melodyNotes = function (slots, beatsPerBar) {    const beats = beatsPerBar || 4;
    const out = [];
    slots.forEach(function (m, i) {
      if (m === null || m === undefined) return;
      out.push({ bar: Math.floor(i / beats), beat: i % beats, dur: 1, midi: m });
    });
    return out;
  };

  /** 返回强拍上不在和弦里的 [小节号, 拍号] 列表（0 基） */
  L.offStrongBeats = function (chords, melody, beatsPerBar, strongBeats) {
    const beats = beatsPerBar || 4;
    const strong = strongBeats || [0, 2];
    const at = {};
    melody.forEach(function (n) { at[n.bar * beats + n.beat] = n.midi; });

    const out = [];
    chords.forEach(function (label, bar) {
      if (!label) return;
      const pcs = MT.chordNotes(label).map(function (m) { return ((m % 12) + 12) % 12; });
      strong.forEach(function (beat) {
        const m = at[bar * beats + beat];
        if (m === undefined) return;
        if (pcs.indexOf(((m % 12) + 12) % 12) < 0) out.push([bar, beat]);
      });
    });
    return out;
  };

  /** 你摆的旋律满不满足这一课的约束 */
  L.checkMelody = function (step, slots, chords) {
    const beats = step.beatsPerBar || 4;
    const rules = step.rules || {};
    const strong = rules.strongBeats || [0, 2];
    const minNotes = rules.minNotes || 8;

    const notes = L.melodyNotes(slots, beats);
    if (notes.length < minNotes) {
      return { ok: false, msg: '才 ' + notes.length + ' 个音，至少要 ' + minNotes + ' 个，这一句才立得住。' };
    }

    // 该空着的地方必须空着（换气）
    const rests = rules.restBeats || [];
    for (let i = 0; i < rests.length; i++) {
      const r = rests[i];
      const m = slots[r.bar * beats + r.beat];
      if (m !== null && m !== undefined) {
        return {
          ok: false,
          msg: '第 ' + (r.bar + 1) + ' 小节第 ' + (r.beat + 1) + ' 拍有音（' + MT.midiName(m) +
            '）。这一拍要空着——那是换气的地方。'
        };
      }
    }

    for (let bar = 0; bar < chords.length; bar++) {
      const label = chords[bar];
      if (!label) continue;
      const pcs = MT.chordNotes(label).map(function (m) { return ((m % 12) + 12) % 12; });
      const names = pcs.map(MT.pcName).join(' · ');

      for (let k = 0; k < strong.length; k++) {
        const beat = strong[k];
        const m = slots[bar * beats + beat];
        if (m === null || m === undefined) {
          return { ok: false, msg: '第 ' + (bar + 1) + ' 小节第 ' + (beat + 1) + ' 拍是空的。强拍不能空着。' };
        }
        if (pcs.indexOf(((m % 12) + 12) % 12) < 0) {
          return {
            ok: false,
            msg: '第 ' + (bar + 1) + ' 小节第 ' + (beat + 1) + ' 拍是 ' + MT.midiName(m) +
              '，可 ' + label + ' 和弦只有 ' + names + '。换一个和弦音，或者把它挪到第 2、4 拍。'
          };
        }
      }
    }

    // 每句至少一个长音：同一个音连着两格，播出来就是一个两拍的长音
    if (rules.longNotePerPhrase) {
      const phraseBars = rules.phraseBars || 2;
      const phrases = Math.max(1, Math.floor(chords.length / phraseBars));
      for (let p = 0; p < phrases; p++) {
        let has = false;
        for (let bar = p * phraseBars; bar < (p + 1) * phraseBars && !has; bar++) {
          for (let b = 0; b < beats - 1; b++) {
            const a = slots[bar * beats + b];
            const c = slots[bar * beats + b + 1];
            if (a !== null && a !== undefined && a === c) { has = true; break; }
          }
        }
        if (!has) {
          return {
            ok: false,
            msg: '第 ' + (p + 1) + ' 句（第 ' + (p * phraseBars + 1) + '–' + ((p + 1) * phraseBars) +
              ' 小节）里没有一个长音。把同一个音连着放两格，它就撑两拍了。'
          };
        }
      }
    }

    // 第二句别照抄第一句的收尾
    if (rules.differentEndings) {
      const phraseBars = rules.phraseBars || 2;
      const endingOf = function (fromBar, toBar) {
        for (let i = (toBar + 1) * beats - 1; i >= fromBar * beats; i--) {
          if (slots[i] !== null && slots[i] !== undefined) return slots[i];
        }
        return null;
      };
      const e1 = endingOf(0, phraseBars - 1);
      const e2 = endingOf(phraseBars, phraseBars * 2 - 1);
      if (e1 !== null && e2 !== null && e1 === e2) {
        return {
          ok: false,
          msg: '两句都收在 ' + MT.midiName(e1) + ' 上。第二句别照抄第一句——换个地方落，它才像在回答。'
        };
      }
    }

    let distinct = [];
    notes.forEach(function (n) { if (distinct.indexOf(n.midi) < 0) distinct.push(n.midi); });
    if (distinct.length < (rules.minDistinct || 3)) {
      return { ok: false, msg: '只用了 ' + distinct.length + ' 个不同的音。一句能唱的话，至少得动一动。' };
    }

    return { ok: true, msg: step.passMsg || '成立。听一遍，再试试把某个强拍换成同一个和弦里的另一个音——感觉差很多。' };
  };

  /** 需要哪些音在响：给「薄 vs 厚」这类题用 */
  L.hasDrums = function (drums) {
    if (!drums) return false;
    const pats = drums.patterns || [drums];
    return pats.some(function (p) {
      return ['hats', 'snare', 'kick'].some(function (k) {
        return (p[k] || []).some(function (v) { return !!v; });
      });
    });
  };

  /** 低音线整体走向：往上 / 往下 / 基本不动 */
  L.bassDirection = function (chords) {
    const pcs = chords.filter(Boolean).map(function (c) { return MT.parseChord(c).pc; });
    let up = 0, down = 0;
    for (let i = 1; i < pcs.length; i++) {
      const d = ((pcs[i] - pcs[i - 1]) % 12 + 12) % 12;
      if (d === 0) continue;
      if (d <= 6) up += d;
      else down += 12 - d;
    }
    if (up > down * 1.5) return '往上';
    if (down > up * 1.5) return '往下';
    return '基本不动';
  };

  /** 哪几个小节的末尾是空的（换气点），1 基 */  L.breathBars = function (melody, bars) {
    const at = {};
    melody.forEach(function (n) { at[n.bar * 4 + n.beat] = n.midi; });
    const out = [];
    for (let b = 0; b < bars; b++) {
      if (at[b * 4 + 3] === undefined) out.push(b + 1);
    }
    return out;
  };

  /** 课内出现的所有和弦名（给自检核对写法用） */
  L.chordsInLesson = function (lesson) {
    const out = [];
    lesson.steps.forEach(function (s) {
      ['chords', 'chordsA', 'chordsB', 'initial'].forEach(function (k) {
        if (Array.isArray(s[k])) out.push.apply(out, s[k].filter(Boolean));
      });
    });
    return out;
  };

  root.ML = L;
  root.MT = root.MT || MT;
})(typeof window !== 'undefined' ? window : globalThis);
