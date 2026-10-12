/* 字幕の色を反転（Android 版）ポップアップ。項目を絞り、指で押しやすくしたもの。
   ここで扱わない設定（文字の太さ・二重フチの色など）は保存済みの値をそのまま残す。 */
const MODES = ["invert", "stroke", "edge"];
const FONT_STEPS = [50, 75, 100, 150, 200, 300, 400];
const WIDTH_STEPS = [0, 1, 2, 3, 4, 6];
const modeInputs = Array.prototype.slice.call(document.querySelectorAll('input[name="mode"]'));
const enabled = document.getElementById("enabled");
const center = document.getElementById("center");
const fontPct = document.getElementById("fontPct");
const capPos = document.getElementById("capPos");
const strokeWidth = document.getElementById("strokeWidth");

function normMode(value) {
  return MODES.indexOf(value) >= 0 ? value : "invert";
}

function normPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return FONT_STEPS.reduce((best, step) => (Math.abs(step - n) < Math.abs(best - n) ? step : best), 100);
}

function normPos(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : 1;
}

function normWidth(value) {
  const n = Number(value);
  if (value === "" || value === null || !Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(16, Math.round(n)));
}

// content.js の migrate と同じ規則（Android 版の初期値: 中央寄せ ON・輪郭 1px・字幕の高さ 2）。
function read(data) {
  const androidFresh = data.androidRev !== 1;
  let on = true;
  let mode = "invert";
  if (MODES.indexOf(data.mode) >= 0 && typeof data.enabled === "boolean") {
    on = data.enabled;
    mode = data.mode;
  } else if (data.phase === "off" || data.enabled === false) on = false;
  else if (data.phase === "edge" || data.mode === "rim") mode = "edge";
  return {
    enabled: on,
    mode: normMode(mode),
    center: androidFresh ? true : data.center === true,
    strokeWidth: androidFresh ? 1 : normWidth(data.strokeWidth),
    fontPct: normPct(data.fontPct),
    capPos: androidFresh ? 2 : normPos(data.capPos),
  };
}

function syncModeLabels() {
  modeInputs.forEach((input) => {
    input.parentElement.classList.toggle("is-checked", input.checked);
  });
}

function paint(data) {
  const next = read(data || {});
  enabled.checked = next.enabled;
  modeInputs.forEach((input) => {
    input.checked = input.value === next.mode;
  });
  center.checked = next.center;
  fontPct.value = String(next.fontPct);
  capPos.value = String(next.capPos);
  // 一覧にない太さ（デスクトップ版で 5px など）は近い値を表示する
  const w = next.strokeWidth;
  strokeWidth.value = String(WIDTH_STEPS.reduce((best, s) => (Math.abs(s - w) < Math.abs(best - w) ? s : best), 1));
  syncModeLabels();
}

function save() {
  const found = modeInputs.find((input) => input.checked);
  chrome.storage.local.set(
    {
      enabled: enabled.checked,
      mode: normMode(found && found.value),
      center: center.checked,
      fontPct: normPct(fontPct.value),
      capPos: normPos(capPos.value),
      strokeWidth: normWidth(strokeWidth.value),
      settingsRev: 1,
      androidRev: 1,
    },
    () => {
      if (chrome.runtime.lastError) console.error("字幕の色を反転: 保存に失敗しました", chrome.runtime.lastError);
    },
  );
}

chrome.storage.local.get(null, (data) => paint(data || {}));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") chrome.storage.local.get(null, (data) => paint(data || {}));
});

[enabled, center, fontPct, capPos, strokeWidth].forEach((el) => el.addEventListener("change", () => save()));
modeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    syncModeLabels();
    if (input.checked) save();
  });
});
