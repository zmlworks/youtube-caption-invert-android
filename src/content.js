/* 字幕の色を反転 Android 版 2.5.1（デスクトップ版 2.4.3 から分岐）
 * - 字幕をタップすると「反転 → 反転+輪郭 →（高さを標準へ）→ 二重フチ → OFF」と切り替わる（このページだけ。再読み込みで保存した設定に戻る）。
 * - 反転 / 反転+輪郭 / 二重フチ は CSS（invert.css）で描く。ここではクラスと CSS 変数を切り替えるだけ。
 * - 字幕サイズ: YouTube は .ytp-caption-segment のインライン style に font-size を書き、
 *   プレーヤーのサイズが変わるたびに書き直す。その値を元に倍率をかけて !important で上書きする。
 *   ロールアップ字幕だけは CSS 変数（--ytic-rf）で、YouTube が行の高さを測る前から大きくしておく。
 *   倍率は YouTube の「フォント サイズ」と同じ（300% = 1.75 倍）。
 * - 監視は字幕コンテナ（.ytp-caption-window-container）だけ。ページ全体の監視は
 *   「コンテナが増えたか」を調べる予約だけで、重い処理はしない。
 */
(function () {
  "use strict";

  const root = document.documentElement;
  if (!root) return;

  // 埋め込み以外のサブフレーム（ライブチャット等）では何もしない。チャットは DOM 変化が非常に多く重くなる。
  let isTop = true;
  try {
    isTop = window.top === window;
  } catch (e) {
    isTop = false;
  }
  const path = location.pathname || "";
  if (isTop ? /^\/live_chat/.test(path) : !/^\/embed\//.test(path)) return;

  if (root.dataset.yticExt === "a251") return;
  root.dataset.yticExt = "a251";

  const MODES = ["invert", "stroke", "edge"];
  const FONT_STEPS = [50, 75, 100, 150, 200, 300, 400];
  const DEFAULT_SHORTCUT = { alt: true, shift: true, ctrl: false, meta: false, key: "i", code: "KeyI" };
  const DEFAULT_FILL = [12, 39, 80];
  const DEFAULT_MID = [205, 225, 255];
  const LIVE_CLASS = "ytic-cc-live";
  const LIVE_IDLE_MS = 15000;

  const state = {
    enabled: true,
    center: true,
    mode: "invert",
    shortcutOn: true,
    shortcut: Object.assign({}, DEFAULT_SHORTCUT),
    strokeWidth: 1,
    weight: 700,
    fontPct: 100,
    capPos: 2,
    videoLayer: false,
    edgeCustom: false,
    fill: DEFAULT_FILL.slice(),
    mid: DEFAULT_MID.slice(),
  };

  /* ---------- 設定の正規化（popup.js と同じ規則） ---------- */

  function normWeight(value) {
    const n = Number(value);
    return n === 500 || n === 700 || n === 900 ? n : 700;
  }

  function normMode(value) {
    return MODES.indexOf(value) >= 0 ? value : "invert";
  }

  function normChannel(value, fallback) {
    const n = Number(value);
    if (value === "" || value === null || !Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(255, Math.round(n)));
  }

  function normRgb(value, fallback) {
    const src = Array.isArray(value) ? value : [];
    return [0, 1, 2].map((i) => normChannel(src[i], fallback[i]));
  }

  function normWidth(value) {
    const n = Number(value);
    if (value === "" || value === null || !Number.isFinite(n)) return 2;
    return Math.max(0, Math.min(16, Math.round(n)));
  }

  function normPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 100;
    return FONT_STEPS.reduce((best, step) => (Math.abs(step - n) < Math.abs(best - n) ? step : best), 100);
  }

  // 字幕の高さ: 1 = YouTube 標準（何もしない）、2〜10 = 下から上へ。
  function normPos(value) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 1 && n <= 10 ? n : 1;
  }

  function normShortcut(value) {
    if (!value || typeof value !== "object" || !value.key) return Object.assign({}, DEFAULT_SHORTCUT);
    return {
      alt: value.alt === true,
      shift: value.shift === true,
      ctrl: value.ctrl === true,
      meta: value.meta === true,
      key: String(value.key).toLowerCase(),
      code: typeof value.code === "string" ? value.code : "",
    };
  }

  let pageMode = ""; // このページだけの切り替え（"" = 保存した設定のまま）
  let pagePos = 0; // このページだけの字幕の高さ（0 = 保存した設定のまま）
  // 表示言語は Firefox（Android）の言語に従う。ja で始まれば日本語、それ以外は英語。
  const LANG = (() => {
    try {
      return /^ja/i.test(chrome.i18n.getUILanguage()) ? "ja" : "en";
    } catch (e) {
      return /^ja/i.test(navigator.language || "") ? "ja" : "en";
    }
  })();
  const TOAST_TEXT = {
    ja: { invert: "反転", stroke: "反転 + 輪郭", pos: "高さ 標準", edge: "二重フチ", off: "OFF" },
    en: { invert: "Invert", stroke: "Invert + outline", pos: "Height: default", edge: "Double edge", off: "OFF" },
  }[LANG];

  function migrate(data) {
    const fresh = data.settingsRev !== 1;
    const colors = {
      edgeCustom: data.edgeCustom === true,
      fill: normRgb(data.fill, DEFAULT_FILL),
      mid: fresh ? DEFAULT_MID.slice() : normRgb(data.mid, DEFAULT_MID),
    };
    // Android 版の初期値（中央寄せ ON・輪郭 1px・字幕の高さ 2）。2.5.0 への更新時に一度だけ適用する（androidRev）。
    const androidFresh = data.androidRev !== 1;
    const common = {
      center: androidFresh ? true : data.center === true,
      shortcutOn: data.shortcutOn !== false,
      shortcut: normShortcut(data.shortcut),
      strokeWidth: androidFresh ? 1 : normWidth(data.strokeWidth),
      weight: fresh ? 700 : normWeight(data.weight),
      fontPct: normPct(data.fontPct),
      capPos: androidFresh ? 2 : normPos(data.capPos),
      androidRev: 1,
      videoLayer: data.videoLayer === true,
      settingsRev: 1,
      lang: data.lang === "en" ? "en" : "ja",
    };
    if (MODES.indexOf(data.mode) >= 0 && typeof data.enabled === "boolean") {
      return Object.assign({ enabled: data.enabled, mode: data.mode }, common, colors);
    }
    if (data.phase === "off") return Object.assign({ enabled: false, mode: "invert" }, common, colors);
    if (data.phase === "edge" || data.mode === "rim") return Object.assign({ enabled: true, mode: "edge" }, common, colors);
    if (data.phase === "invert") return Object.assign({ enabled: true, mode: "invert" }, common, colors);
    if (data.enabled === false) return Object.assign({ enabled: false, mode: "invert" }, common, colors);
    return Object.assign({ enabled: true, mode: "invert" }, common, colors);
  }

  function applyStored(data) {
    const next = migrate(data || {});
    state.enabled = next.enabled;
    state.center = next.center;
    state.mode = normMode(next.mode);
    state.shortcutOn = next.shortcutOn;
    state.shortcut = next.shortcut;
    state.strokeWidth = next.strokeWidth;
    state.weight = next.weight;
    state.fontPct = next.fontPct;
    state.capPos = next.capPos;
    state.videoLayer = next.videoLayer;
    state.edgeCustom = next.edgeCustom;
    state.fill = next.fill;
    state.mid = next.mid;
  }

  /* ---------- 見た目（クラスと CSS 変数） ---------- */

  function cssRgb(channels) {
    return "rgb(" + channels[0] + " " + channels[1] + " " + channels[2] + ")";
  }

  function ring(radius, color) {
    const pts = [
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
      [radius, radius],
      [radius, -radius],
      [-radius, radius],
      [-radius, -radius],
    ];
    if (radius >= 2) {
      pts.push([radius, 1], [radius, -1], [-radius, 1], [-radius, -1], [1, radius], [-1, radius], [1, -radius], [-1, -radius]);
    }
    if (radius >= 4) {
      pts.push([radius, 2], [radius, -2], [-radius, 2], [-radius, -2], [2, radius], [-2, radius], [2, -radius], [-2, -radius]);
    }
    return pts.map((point) => point[0] + "px " + point[1] + "px 0 " + color).join(", ");
  }

  function rim(inner, outer) {
    return [1, 2].map((radius) => ring(radius, inner)).concat([3, 4, 5].map((radius) => ring(radius, outer))).join(", ");
  }

  function setVar(name, value) {
    if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
  }

  // YouTube 自身の「フォント サイズ」と同じ意味にする。YouTube の倍率は 1 + 0.25 × 段階（-2〜4）で、
  // 表示名と実際の倍率が違う（「300%」は 1.75 倍、「400%」は 2 倍）。captions.js の Ug$ / 設定 qNy を参照。
  const YT_MULT = { 50: 0.5, 75: 0.75, 100: 1, 150: 1.25, 200: 1.5, 300: 1.75, 400: 2 };

  function currentScale() {
    return effectiveMode() !== "off" && state.fontPct !== 100 ? YT_MULT[state.fontPct] || 1 : 1;
  }

  function videoLayerWanted() {
    const mode = effectiveMode();
    return mode !== "off" && state.videoLayer === true && mode !== "edge";
  }

  function apply() {
    const mode = effectiveMode();
    const on = mode !== "off";
    const centerOn = on && state.center === true;
    const native = on && !centerOn && (mode === "invert" || mode === "stroke");
    const custom = mode === "edge" && state.edgeCustom;
    const fill = custom ? cssRgb(state.fill) : "#fff";
    const inner = custom ? cssRgb(state.mid) : "#000";
    const outer = custom ? cssRgb(state.fill) : "#fff";
    root.classList.toggle("ytic-on", on);
    root.classList.toggle("ytic-native", native);
    root.classList.toggle("ytic-own", on && !native);
    if (centerOn) root.dataset.yticCenter = "1";
    else delete root.dataset.yticCenter;
    // 字幕の高さ。位置は invert.css が YouTube 標準の位置（bottom: 2%）にある枠だけを動かす。
    const capPos = pagePos || state.capPos;
    const pos = on && capPos > 1 ? String(capPos) : "";
    if (pos) {
      if (root.dataset.yticPos !== pos) root.dataset.yticPos = pos;
    } else delete root.dataset.yticPos;
    root.classList.toggle("ytic-invert", on && mode === "invert");
    root.classList.toggle("ytic-stroke", on && mode === "stroke");
    root.classList.toggle("ytic-mode-edge", on && mode === "edge");
    root.classList.toggle("ytic-scaled", currentScale() !== 1);
    setVar("--ytic-fill", fill);
    setVar("--ytic-rim", rim(inner, outer));
    setVar("--ytic-weight", String(state.weight));
    setVar("--ytic-stroke-width", state.strokeWidth + "px");
    watched.forEach((entry, container) => {
      processTree(container, true, entry);
      setRollupFont(entry);
      updateLive(entry);
      entry.obs.takeRecords(); // 自分で書いた style の変更は捨てる
    });
  }

  /* ---------- 字幕サイズ ---------- */

  // 要素ごとに「YouTube が書いた元の値」と「こちらが書いた値」を覚える。DOM には印を書かない。
  const marks = new WeakMap();

  function scaleProp(el, prop, scale) {
    const st = el.style;
    const cur = st.getPropertyValue(prop);
    let per = marks.get(el);
    if (!cur) {
      if (per) delete per[prop];
      return;
    }
    if (!per) {
      if (scale === 1) return;
      per = {};
      marks.set(el, per);
    }
    let m = per[prop];
    if (!m || cur !== m.applied || (m.applied && st.getPropertyPriority(prop) !== "important")) {
      // 値が違う、または !important が外れている = YouTube が書き直した（たまたま同じ値でも区別できる）。
      // YouTube が新しい値を書いた（初回・リサイズ・字幕更新）。これを基準にする。
      m = per[prop] = { base: cur, applied: "" };
    }
    if (scale === 1) {
      if (m.applied && cur === m.applied) st.setProperty(prop, m.base);
      delete per[prop];
      return;
    }
    if (!/px$/.test(m.base)) return;
    const px = parseFloat(m.base);
    if (!(px > 0)) return;
    const want = Math.round(px * scale * 100) / 100 + "px";
    if (cur !== want || st.getPropertyPriority(prop) !== "important") st.setProperty(prop, want, "important");
    m.applied = st.getPropertyValue(prop);
  }

  /* ロールアップ字幕（自動生成字幕など、行が下から上へ流れる字幕）は、YouTube が行の高さを測って
     流す量と枠の高さを決める。後から文字を大きくすると測った値と合わなくなり、行が跳ねたり戻ったりする。
     そこでロールアップ字幕だけは、YouTube が測る前から効いている CSS（--ytic-rf）で大きくする。
     値は「YouTube が書いた文字サイズ × 倍率」で、入れ物ごとに 1 つ。YouTube が文字サイズを書き直したら更新する。 */
  function setRollupFont(entry) {
    const container = entry.container;
    const scale = currentScale();
    const base = entry.rfBase;
    if (scale === 1) entry.rfBase = "";
    if (scale === 1 || !base || !/px$/.test(base) || !(parseFloat(base) > 0)) {
      if (container.classList.contains("ytic-rf")) {
        container.classList.remove("ytic-rf");
        container.style.removeProperty("--ytic-rf");
      }
      return;
    }
    const want = Math.round(parseFloat(base) * scale * 100) / 100 + "px";
    if (container.style.getPropertyValue("--ytic-rf") !== want) container.style.setProperty("--ytic-rf", want);
    if (!container.classList.contains("ytic-rf")) container.classList.add("ytic-rf");
  }

  function noteRollupFont(entry, seg) {
    const base = seg.style.getPropertyValue("font-size");
    if (!base || base === entry.rfBase) return;
    entry.rfBase = base;
    setRollupFont(entry);
  }

  function inRollup(el) {
    const win = el.classList.contains("caption-window") ? el : el.closest(".caption-window");
    return !!win && win.classList.contains("ytp-caption-window-rollup");
  }

  function handleEl(el, scale, entry) {
    const cl = el.classList;
    if (!cl) return;
    const seg = cl.contains("ytp-caption-segment");
    if (!seg && !cl.contains("caption-window")) return;
    if (inRollup(el)) {
      // ロールアップは CSS 側で拡大する。以前の版がインラインに書いた値が残っていれば戻す。
      if (marks.has(el)) scaleProp(el, seg ? "font-size" : "width", 1);
      if (seg && entry && scale !== 1) noteRollupFont(entry, el);
      return;
    }
    scaleProp(el, seg ? "font-size" : "width", scale);
  }

  function processTree(node, full, entry) {
    const scale = currentScale();
    if (scale === 1 && !full) return;
    if (node.nodeType !== 1) return;
    if (node.classList.contains("ytp-caption-segment") || node.classList.contains("caption-window")) handleEl(node, scale, entry);
    if (node.firstElementChild) {
      const list = node.querySelectorAll(".caption-window, .ytp-caption-segment");
      for (let i = 0; i < list.length; i++) handleEl(list[i], scale, entry);
    }
  }

  /* ---------- 映像を別レイヤー（字幕が出ている間だけ） ---------- */

  function setLive(entry, live) {
    if (entry.live === live) return;
    entry.live = live;
    if (entry.player) entry.player.classList.toggle(LIVE_CLASS, live);
  }

  function updateLive(entry) {
    if (!videoLayerWanted()) {
      if (entry.idle) clearTimeout(entry.idle);
      entry.idle = 0;
      setLive(entry, false);
      return;
    }
    if (entry.windows.length) {
      if (entry.idle) clearTimeout(entry.idle);
      entry.idle = 0;
      setLive(entry, true);
    } else if (entry.live && !entry.idle) {
      // 字幕と字幕の間で毎回付け外しするとちらつきが戻るので、しばらく字幕が無いときだけ外す。
      entry.idle = setTimeout(() => {
        entry.idle = 0;
        if (!entry.windows.length) setLive(entry, false);
      }, LIVE_IDLE_MS);
    }
  }

  /* ---------- 字幕コンテナの監視 ---------- */

  const watched = new Map(); // container -> entry

  function onCaptionMutations(entry, records) {
    if (currentScale() !== 1) {
      const scale = currentScale();
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (record.type === "attributes") {
          handleEl(record.target, scale, entry);
        } else {
          const added = record.addedNodes;
          for (let j = 0; j < added.length; j++) {
            if (added[j].nodeType === 1) processTree(added[j], false, entry);
          }
        }
      }
    }
    if (entry.live || videoLayerWanted()) updateLive(entry);
    entry.obs.takeRecords(); // 自分の書き込みで生じた記録を捨てる（ループ防止）
  }

  function attach(container) {
    if (watched.has(container)) return;
    const entry = {
      container: container,
      rfBase: "",
      player: container.closest(".html5-video-player") || container.parentElement,
      windows: container.getElementsByClassName("caption-window"), // ライブコレクション（安い）
      live: false,
      idle: 0,
      obs: null,
    };
    entry.obs = new MutationObserver((records) => onCaptionMutations(entry, records));
    entry.obs.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    watched.set(container, entry);
    processTree(container, false, entry);
    updateLive(entry);
    entry.obs.takeRecords();
  }

  function detach(container, entry) {
    entry.obs.disconnect();
    if (entry.idle) clearTimeout(entry.idle);
    if (entry.player) entry.player.classList.remove(LIVE_CLASS);
    container.classList.remove("ytic-rf");
    container.style.removeProperty("--ytic-rf");
    watched.delete(container);
  }

  let scanTimer = 0;

  function scan() {
    scanTimer = 0;
    watched.forEach((entry, container) => {
      if (!container.isConnected) detach(container, entry);
    });
    const list = document.getElementsByClassName("ytp-caption-window-container");
    for (let i = 0; i < list.length; i++) attach(list[i]);
  }

  function queueScan() {
    if (!scanTimer) scanTimer = setTimeout(scan, 250);
  }

  function startWatching() {
    scan();
    // ページ全体の監視は「探し直しを予約する」だけ（O(1)）。字幕の細かな変化はコンテナ側の監視で扱う。
    new MutationObserver(queueScan).observe(document.body || root, { childList: true, subtree: true });
    document.addEventListener("yt-navigate-finish", queueScan);
    document.addEventListener("fullscreenchange", queueScan);
  }

  if (document.body) startWatching();
  else document.addEventListener("DOMContentLoaded", startWatching, { once: true });

  /* ---------- 字幕タップで切り替え（Android） ----------
     m.youtube.com では操作パネル（#player-control-overlay）がプレーヤー全体の上に重なっているため、
     字幕そのものにはタップが届かない。そこでページ全体で（最初に・キャプチャ段階で）タッチを受け、
     指の位置が字幕の枠の上かどうかを座標で調べる。字幕の上なら YouTube には渡さない
     （操作パネルの表示・再生/一時停止・ダブルタップのシーク・字幕のドラッグが起きない）。
     指が 12px 以上動いた・600ms 以上押していた場合はタップとみなさない（切り替えない）。
     タッチ・ポインター・マウス互換イベント・click が続けて来ても、1 回の操作で 1 回だけ切り替える。 */

  const TAP_MOVE = 12;
  const TAP_MS = 600;
  const HIT_PAD = 8; // 字幕の周り 8px もタップ範囲にする（指で押しやすく）
    let gesture = null; // { x, y, t, moved, done, player }
  let swallowUntil = 0; // この時刻までの互換 mouse/click は字幕操作の続きとして捨てる

  function effectiveMode() {
    if (pageMode === "off") return "off";
    if (!state.enabled) return "off";
    return pageMode || state.mode;
  }

  function hitCaption(x, y) {
    if (effectiveMode() === "off") return null; // OFF のあとはタップ対象を作らない（仕様）
    let found = null;
    watched.forEach((entry, container) => {
      if (found) return;
      const wins = entry.windows;
      for (let i = 0; i < wins.length; i++) {
        const r = wins[i].getBoundingClientRect();
        if (r.width && r.height && x >= r.left - HIT_PAD && x <= r.right + HIT_PAD && y >= r.top - HIT_PAD && y <= r.bottom + HIT_PAD) {
          found = entry.player || container;
          return;
        }
      }
    });
    return found;
  }

  function point(event) {
    const t = event.changedTouches && event.changedTouches[0];
    return t ? { x: t.clientX, y: t.clientY } : { x: event.clientX, y: event.clientY };
  }

  function swallow(event, cancel) {
    if (cancel && event.cancelable) event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function onStart(event) {
    if (event.type === "mousedown" && Date.now() < swallowUntil) return swallow(event, true);
    if (event.button > 0) return;
    const p = point(event);
    if (gesture && !gesture.done && Date.now() - gesture.t < TAP_MS) {
      // 同じ操作の別系統のイベント（pointerdown のあとの touchstart など）
      return swallow(event, false);
    }
    const player = hitCaption(p.x, p.y);
    if (!player) {
      gesture = null;
      return;
    }
    gesture = { x: p.x, y: p.y, t: Date.now(), moved: false, done: false, player: player };
    // touchstart は preventDefault しない（ページのスクロールは止めない）。YouTube にだけ渡さない。
    swallow(event, false);
  }

  function onMove(event) {
    if (!gesture || gesture.done) return;
    const p = point(event);
    if (Math.abs(p.x - gesture.x) > TAP_MOVE || Math.abs(p.y - gesture.y) > TAP_MOVE) gesture.moved = true;
  }

  function onEnd(event) {
    if (event.type === "mouseup" && Date.now() < swallowUntil) return swallow(event, true);
    if (!gesture) return;
    swallow(event, event.type === "touchend"); // touchend の preventDefault で互換 mouse/click を止める
    if (gesture.done) return;
    const p = point(event);
    if (Math.abs(p.x - gesture.x) > TAP_MOVE || Math.abs(p.y - gesture.y) > TAP_MOVE) gesture.moved = true;
    gesture.done = true;
    swallowUntil = Date.now() + 800;
    if (gesture.moved || Date.now() - gesture.t > TAP_MS) return;
    cycleMode(gesture.player, p.x, p.y);
  }

  function onCancel() {
    if (gesture) gesture.done = true;
  }

  function onClick(event) {
    if (Date.now() < swallowUntil) swallow(event, true);
  }

  // 反転 → 反転+輪郭 →（高さが標準でなければ）高さを標準(1)へ → 二重フチ → OFF
  function cycleMode(player, x, y) {
    const now = effectiveMode();
    let label;
    if (now === "invert") {
      pageMode = "stroke";
      label = "stroke";
    } else if (now === "stroke" && (pagePos || state.capPos) !== 1) {
      pageMode = "stroke";
      pagePos = 1;
      label = "pos";
    } else if (now === "stroke") {
      pageMode = "edge";
      label = "edge";
    } else {
      pageMode = "off";
      label = "off";
    }
    apply();
    toast(player, x, y, TOAST_TEXT[label]);
  }


  let toastEl = null;
  let toastTimer = 0;

  function toast(player, x, y, text) {
    if (!player || !player.isConnected) return;
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "ytic-toast";
    }
    toastEl.textContent = text;
    const r = player.getBoundingClientRect();
    toastEl.style.left = Math.max(8, Math.min(r.width - 8, x - r.left)) + "px";
    toastEl.style.top = Math.max(8, y - r.top - 56) + "px";
    if (toastEl.parentNode !== player) player.appendChild(toastEl);
    toastEl.classList.remove("ytic-toast-hide");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.add("ytic-toast-hide");
      toastTimer = setTimeout(() => toastEl.remove(), 250);
    }, 800);
  }

  const opts = { capture: true, passive: false };
  ["pointerdown", "touchstart", "mousedown"].forEach((type) => window.addEventListener(type, onStart, opts));
  ["pointermove", "touchmove"].forEach((type) => window.addEventListener(type, onMove, { capture: true, passive: true }));
  ["pointerup", "touchend", "mouseup"].forEach((type) => window.addEventListener(type, onEnd, opts));
  ["pointercancel", "touchcancel"].forEach((type) => window.addEventListener(type, onCancel, { capture: true, passive: true }));
  window.addEventListener("click", onClick, opts);

  /* ---------- 設定の読み込みと同期 ---------- */

  function load(first) {
    try {
      chrome.storage.local.get(null, (data) => {
        if (chrome.runtime.lastError) return;
        const stored = data || {};
        applyStored(stored);
        apply();
        if (first && (stored.settingsRev !== 1 || stored.androidRev !== 1)) chrome.storage.local.set(migrate(stored));
      });
    } catch (e) {
      /* ignore */
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    // メニューで「オン/オフ」か「動作」を変えたら、タップで切り替えた状態よりメニューを優先する。
    if (changes.mode || changes.enabled) pageMode = "";
    if (changes.mode || changes.enabled || changes.capPos) pagePos = 0;
    load(false);
  });

  load(true);
})();
