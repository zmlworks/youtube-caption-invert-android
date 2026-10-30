// 2.6.1: タップで切り替えた状態は、メニューで「オン/オフ」「動作」「高さ」が実際に変わったときだけ解除する。
// `playwright` が使える場所で `node test261.mjs`（SRC で場所を変更可）。page.html はデスクトップ版のテストページと同じ。
import { firefox } from "playwright";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
const dir = process.env.SRC || "../src";
const browser = await firefox.launch({ headless: true });
let ok = true;
const R = {};
const check = (n, c, info) => { R[n] = { pass: !!c, info }; if (!c) ok = false; };
const page = await browser.newPage({ viewport: { width: 854, height: 480 } });
const all = { settingsRev: 1, androidRev: 1, enabled: true, mode: "invert", center: true, strokeWidth: 1, fontPct: 100, capPos: 1 };
await page.addInitScript({ content: "window.__initialStore=" + JSON.stringify(all) + ";" + fs.readFileSync("stub.js", "utf8") });
await page.goto(pathToFileURL(path.resolve("page.html")).href);
await page.addStyleTag({ content: fs.readFileSync(dir + "/invert.css", "utf8") });
await page.addScriptTag({ content: fs.readFileSync(dir + "/content.js", "utf8") });
await page.waitForTimeout(200);
await page.evaluate(() => ytShow("Tap this caption", 20));
await page.waitForTimeout(100);
const cls = () => page.evaluate(() => ["ytic-invert", "ytic-stroke", "ytic-mode-edge"].filter((c) => document.documentElement.classList.contains(c)).join(",") || "off");
const tap = async () => { const b = await page.locator(".ytp-caption-segment").boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(900); };
check("1 initial invert", (await cls()) === "ytic-invert", await cls());
await tap();
check("2 tap -> stroke", (await cls()) === "ytic-stroke", await cls());
// メニューで別の項目（文字サイズ）だけ変えた: メニューは全項目を保存する
await page.evaluate((all) => chrome.storage.local.set(Object.assign({}, all, { fontPct: 150 })), all); await page.waitForTimeout(150);
check("3 saving all keys with same mode keeps tap state", (await cls()) === "ytic-stroke", await cls());
await page.evaluate((all) => chrome.storage.local.set(Object.assign({}, all, { fontPct: 150, mode: "edge" })), all); await page.waitForTimeout(150);
check("4 real mode change resets tap state", (await cls()) === "ytic-mode-edge", await cls());
console.log(JSON.stringify(R, null, 1));
console.log(ok ? "ALL PASS" : "SOME FAILED");
await browser.close();
process.exit(ok ? 0 : 1);
