// Performance budget for the launchers (#6) and Videolytics (#7): page cost with them on vs off, on a synthetic
// YouTube watch page with the real built extension. Usage:
//   npm run build && node tests/e2e/launchers-perf.mjs [runs=5]
// Per condition it loads the page `runs` times and reports medians of: main-thread scripting time and task time
// (CDP Performance metrics, includes content scripts), long tasks (>50 ms) and their total, DOM nodes (CDP count,
// which includes shadow roots), nodes inside TubeX shadow roots, JS heap; then, with the drawer available,
// the cost of opening it (task time for click → drawer painted, first open mounts its content).
// Headless Chromium on a dev box: compare conditions with each other, not with real-world numbers.
import { start, watchPage } from './launchers-lib.mjs';

const runs = Number(process.argv[2] ?? 5);
const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const LAUNCHERS_OFF = { launcherEdge: false, masthead: false, videolytics: false };
const CONDITIONS = [
  { name: 'TubeX in-page off (baseline)', inpage: { all: false } },
  { name: 'Launchers + Videolytics off', inpage: LAUNCHERS_OFF },
  { name: 'Edge tab only', inpage: { ...LAUNCHERS_OFF, launcherEdge: true } },
  { name: 'Top-bar button only', inpage: { ...LAUNCHERS_OFF, masthead: true } },
  { name: 'Both launchers (no Videolytics)', inpage: { videolytics: false } },
  { name: 'Everything on (both + Videolytics)', inpage: {} },
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const INIT = () => {
  window.__lt = [];
  try {
    new PerformanceObserver((l) => window.__lt.push(...l.getEntries().map((e) => e.duration))).observe({ type: 'longtask', buffered: true });
  } catch {}
};

async function metrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
}

const shadowNodes = () => {
  let n = 0;
  for (const host of document.querySelectorAll('[data-wxt-shadow-root], tubex-launcher, tubex-videolytics, tubex-masthead, tubex-watch')) {
    const sr = host.shadowRoot;
    if (sr) n += sr.querySelectorAll('*').length;
  }
  return n;
};

const results = [];
for (const c of CONDITIONS) {
  const { ctx, setPage } = await start({ lang: 'fa', width: 1440, inpage: c.inpage });
  setPage(watchPage());
  const rows = [];
  for (let i = 0; i < runs + 1; i++) {
    const p = await ctx.newPage();
    await p.addInitScript(INIT);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Performance.enable', { timeDomain: 'threadTicks' });
    await p.goto(URL, { waitUntil: 'load' });
    await p.waitForTimeout(3500); // islands mount, mocked API answers, page settles
    const m = await metrics(cdp);
    const lt = await p.evaluate(() => window.__lt ?? []);
    const dom = await p.evaluate(shadowNodes);
    const row = { script: m.ScriptDuration * 1000, task: m.TaskDuration * 1000, layout: (m.LayoutDuration + m.RecalcStyleDuration) * 1000, nodes: m.Nodes, tubexNodes: dom, heap: m.JSHeapUsedSize / 1048576, longTasks: lt.length, longTotal: lt.reduce((a, b) => a + b, 0) };
    // Interaction: open the drawer from the edge tab when present (first open mounts the drawer content).
    const tab = p.locator('tubex-launcher').first().locator('.tx-ln-edge');
    if (await tab.count()) {
      const before = await metrics(cdp);
      await tab.click();
      await p.locator('tubex-launcher').first().locator('.tx-ln-drawer:not([hidden]) .tx-ln-title').waitFor({ timeout: 4000 });
      await p.waitForTimeout(800);
      const after = await metrics(cdp);
      row.openTask = (after.TaskDuration - before.TaskDuration) * 1000;
      row.openScript = (after.ScriptDuration - before.ScriptDuration) * 1000;
      row.nodesOpen = after.Nodes;
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
    }
    await p.close();
    if (i > 0) rows.push(row); // first load warms caches (extension, mocked API cache)
  }
  await ctx.close();
  const keys = Object.keys(rows[0]);
  const med = Object.fromEntries(keys.map((k) => [k, median(rows.map((r) => r[k]).filter((x) => x !== undefined))]));
  results.push({ name: c.name, ...med });
  console.error(`done: ${c.name}`);
}

const f = (n, d = 1) => (n === undefined || Number.isNaN(n) ? '—' : n.toFixed(d));
console.log(`\nMedians of ${runs} loads (after one warm-up), mock watch page, headless Chromium, 1440×900:\n`);
console.log('| Condition | Scripting ms | Main-thread tasks ms | Style+layout ms | Long tasks (count / ms) | DOM nodes | TubeX shadow nodes | JS heap MB | Open drawer: task ms / script ms / nodes after |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of results)
  console.log(`| ${r.name} | ${f(r.script)} | ${f(r.task)} | ${f(r.layout)} | ${f(r.longTasks, 0)} / ${f(r.longTotal, 0)} | ${f(r.nodes, 0)} | ${f(r.tubexNodes, 0)} | ${f(r.heap)} | ${r.openTask === undefined ? '—' : `${f(r.openTask)} / ${f(r.openScript)} / ${f(r.nodesOpen, 0)}`} |`);
