// chrome.* の最小スタブ（storage.local + onChanged。oldValue も渡す）
(() => {
  const store = window.__initialStore || {};
  const listeners = [];
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  window.chrome = { runtime: { lastError: undefined, id: "x" }, storage: { local: {
    get(k, cb) { setTimeout(() => cb(clone(store)), 0); },
    set(obj, cb) { const changes = {}; for (const k in obj) { changes[k] = { oldValue: clone(store[k]), newValue: clone(obj[k]) }; store[k] = clone(obj[k]); }
      setTimeout(() => { listeners.forEach((l) => l(changes, "local")); cb && cb(); }, 0); } },
    onChanged: { addListener(f) { listeners.push(f); } } } };
  window.__store = store;
})();
