// GitHub Pages build only: answers the dashboard's fetch("/api/...") calls in the browser.
// The Python simulator runs in a Web Worker (pyworker.js, Pyodide). Campaigns and races are
// computed in one go there and replayed here step by step, so the pages animate as with the
// local server. LLM contestants need API keys and run only in the local version.
"use strict";
(() => {
  const BASE = document.currentScript.src.replace(/[^/]*$/, "");
  const worker = new Worker(BASE + "pyworker.js", { type: "module" });
  const pending = new Map();
  let nextId = 1, isReady = false;

  // ---------------------------------------------------------------- status banner
  const bar = document.createElement("div");
  bar.style.cssText = "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99999;background:#173b36;" +
    "color:#fff;font:13px/1.4 system-ui,Arial,sans-serif;padding:8px 14px;border-radius:8px;box-shadow:0 4px 14px #0003;" +
    "display:none;max-width:90vw";
  const note = document.createElement("div");
  note.style.cssText = "position:fixed;right:10px;bottom:8px;z-index:99998;font:11px system-ui,Arial,sans-serif;color:#8a8780;" +
    "background:#fffc;padding:2px 6px;border-radius:4px";
  note.textContent = "Browser demo · simulator runs locally in your browser · LLM contestants need the local version";
  const mount = () => { document.body.appendChild(bar); document.body.appendChild(note); };
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
  let busy = 0, busyTimer = null, loadText = "Loading the simulator in your browser…";
  function show(t) { bar.textContent = t; bar.style.display = "block"; }
  function refreshBar() {
    if (!isReady) return show(loadText + " (first visit can take 20–60 s)");
    if (busy > 0) { if (!busyTimer) busyTimer = setTimeout(() => { if (busy > 0) show("Simulating in your browser…"); }, 400); }
    else { clearTimeout(busyTimer); busyTimer = null; bar.style.display = "none"; }
  }
  refreshBar();

  worker.onmessage = (e) => {
    const d = e.data;
    if (d.progress) {
      if (d.progress === "ready") { isReady = true; }
      else loadText = d.progress.startsWith("error") ? "Could not start the simulator: " + d.progress : d.progress;
      return refreshBar();
    }
    const p = pending.get(d.id);
    if (p) { pending.delete(d.id); p(JSON.parse(d.out)); }
  };
  function call(method, path, body) {
    busy++; refreshBar();
    return new Promise(res => {
      const id = nextId++;
      pending.set(id, (o) => { busy--; refreshBar(); res(o); });
      worker.postMessage({ id, method, path, body: body || "" });
    });
  }
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  // ---------------------------------------------------------------- replay of campaigns and races
  let camp = null, race = null;   // {view, t0, delay, stopAt}
  const now = () => performance.now() / 1000;
  function stepOf(pb, n) {
    if (pb.stopAt != null) return pb.stopAt;
    if (!(pb.delay > 0)) return n;
    return Math.min(n, Math.floor((now() - pb.t0) / pb.delay) + 1);
  }
  function campView() {
    const F = camp.view, n = (F.history || []).length, k = stepOf(camp, n);
    if (k >= n) return F;
    return { ...F, state: camp.stopAt != null ? "stopped" : "running", history: F.history.slice(0, k),
             recommendation: null, validation: null, thoughts: [] };
  }
  function raceView() {
    const F = race.view, n = Math.max(0, ...F.lanes.map(l => l.history.length)), k = stepOf(race, n);
    const lanes = F.lanes.map(l => {
      if (k >= l.history.length) return l;
      const h = l.history.slice(0, k);
      const dur = a => a.reduce((s, r) => s + (r.duration_s || 0), 0);
      const tot = dur(l.history) || 1;
      return { ...l, state: race.stopAt != null ? "stopped" : "running", history: h, recommendation: null, validation: null,
               sim_minutes: Math.round(10 * l.sim_minutes * dur(h) / tot) / 10,
               material_pct: Math.round(100 * h.reduce((s, r) => s + r.sds + r.tween, 0)) / 100,
               thoughts: [], thought_log: [] };
    });
    return { meta: F.meta, lanes, running: race.stopAt == null && k < n };
  }

  // ---------------------------------------------------------------- repeated study, one campaign per call
  let study = null, studyStop = false;
  async function driveStudy() {
    for (;;) {
      const o = await call("POST", "/api/study/step", JSON.stringify({ stop: studyStop }));
      study = o.body;
      if (!study.meta || study.meta.state !== "running") break;
    }
  }

  // ---------------------------------------------------------------- fetch override
  const realFetch = window.fetch.bind(window);
  async function api(path, method, body) {
    const b = body ? JSON.parse(body) : {};
    if (method === "GET") {
      if (path === "/api/campaign" && camp) return json(200, campView());
      if (path === "/api/race") return json(200, race ? raceView() : { meta: null, lanes: [], running: false });
      if (path === "/api/study" && study) return json(200, study);
    } else {
      if (path === "/api/campaign/stop") { if (camp) camp.stopAt = stepOf(camp, camp.view.history.length); return json(200, { ok: true }); }
      if (path === "/api/race/stop") { if (race) race.stopAt = stepOf(race, Math.max(0, ...race.view.lanes.map(l => l.history.length))); return json(200, { ok: true }); }
      if (path === "/api/study/stop") { studyStop = true; return json(200, { ok: true }); }
      if (path === "/api/race" && race && raceView().running) return json(409, { detail: "a race is already running" });
    }
    const o = await call(method, path, body);
    if (o.status !== 200) return json(o.status, o.body);
    if (method === "POST" && path === "/api/campaign") {
      camp = { view: o.body.view, t0: now(), delay: b.delay_s ?? 0.6, stopAt: null };
      return json(200, { ok: true });
    }
    if (method === "POST" && path === "/api/race") {
      race = { view: o.body.view, t0: now(), delay: b.delay_s ?? 0.5, stopAt: null };
      return json(200, { ok: true });
    }
    if (method === "POST" && path === "/api/reset") camp = null;
    if (method === "POST" && path === "/api/study") { studyStop = false; study = null; driveStudy(); }
    return json(200, o.body);
  }
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const u = new URL(url, location.href);
    if (u.origin === location.origin && u.pathname.startsWith("/api/") || url.startsWith("/api/")) {
      const path = url.startsWith("/api/") ? url.split("?")[0] : u.pathname;
      return api(path, ((init && init.method) || "GET").toUpperCase(), init && init.body);
    }
    return realFetch(input, init);
  };

  // CSV download link on the study page
  document.addEventListener("click", async (e) => {
    const a = e.target.closest && e.target.closest("a[href$='/api/study/csv']");
    if (!a) return;
    e.preventDefault();
    const o = await call("GET", "/api/study/csv");
    const url = URL.createObjectURL(new Blob([o.body.csv], { type: "text/csv" }));
    const t = document.createElement("a");
    t.href = url; t.download = "raise_study_runs.csv"; t.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, true);
})();
