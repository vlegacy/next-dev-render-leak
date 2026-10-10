// Measures heap RETAINED per page render in `next dev` (forced full GC before and
// after each batch). Start the app with `npm run dev` (it passes --inspect), then
// run `npm run probe`. Env: BASE (default http://localhost:3000), N (default 50).
const BASE = process.env.BASE ?? "http://localhost:3000";
const N = Number(process.env.N ?? 50);
const PATHS = (process.env.PATHS ?? "/,/dynamic").split(",");

const targets = await (await fetch("http://127.0.0.1:9229/json/list")).json();
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
};
await new Promise((r) => (ws.onopen = r));

const sample = async () => {
  await send("HeapProfiler.collectGarbage");
  const { result } = await send("Runtime.evaluate", {
    expression: `JSON.stringify({
      heap: process.memoryUsage().heapUsed,
      contexts: process.mainModule?.require("v8").getHeapStatistics().number_of_native_contexts ?? -1,
    })`,
    returnByValue: true,
  });
  return JSON.parse(result.value);
};
const hit = async (path) => {
  const res = await fetch(BASE + path);
  await res.text();
  if (res.status !== 200) throw new Error(`${path} -> ${res.status}`);
};

console.log(`next dev at ${BASE}, ${N} renders per page, forced GC before and after\n`);
console.log("page        heap retained   per render   native contexts");
for (const path of PATHS) {
  for (let i = 0; i < 5; i++) await hit(path); // compile + warm caches
  const before = await sample();
  for (let i = 0; i < N; i++) await hit(path);
  const after = await sample();
  const mb = (after.heap - before.heap) / 1e6;
  console.log(
    `${path.padEnd(11)} ${(mb >= 0 ? "+" : "") + mb.toFixed(1)} MB`.padEnd(27) +
      `${((mb * 1000) / N).toFixed(0)} KB`.padStart(9) +
      `   ${before.contexts} -> ${after.contexts}`,
  );
}
ws.close();
