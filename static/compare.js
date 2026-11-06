// Comparison dashboard: one screen, contestants side by side, no narration.
"use strict";
const $ = (s) => document.querySelector(s);
const api = {
  get: (u) => fetch(u).then(r => r.json()),
  post: (u, b) => fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) })
    .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || r.statusText); return j; }),
};
const NS = "http://www.w3.org/2000/svg";
function S(tag, a = {}, p) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (p) p.appendChild(e); return e; }
function T(p, x, y, t, a = {}) { const e = S("text", { x, y, "font-size": 12, fill: "#8a8780", ...a }, p); e.textContent = t; return e; }
const WIN = [70.39, 73.61];
const NAME = { random: "Random", ofat: "OFAT (manual-style)", bo_ts: "BO · RAISE-like", bo_angle: "BO · angle model",
  deepseek: "DeepSeek Flash", deepseek_pro: "DeepSeek Pro", deepseek_blind: "DeepSeek · blind", deepseek_permuted: "DeepSeek · scrambled", llm: "Claude" };
const COLOR = { random: "#9a968e", ofat: "#c58a2b", bo_ts: "#2f6fde", bo_angle: "#1f4fa8", deepseek: "#7b4fd6", deepseek_pro: "#b0359b",
  deepseek_blind: "#4f9d8a", deepseek_permuted: "#c2384f", llm: "#d4733a" };
const ORDER = ["random", "ofat", "bo_ts", "bo_angle", "deepseek", "deepseek_pro", "deepseek_blind", "deepseek_permuted", "llm"];
const STOPS = [[0, [0, 34, 78]], [0.25, [62, 74, 107]], [0.5, [124, 123, 120]], [0.75, [190, 175, 111]], [1, [254, 232, 56]]];
function caColor(a) {
  if (a === null || a === undefined) return "#d9d6cf";
  let x = Math.max(0, Math.min(1, (a - 58) / 22));
  for (let i = 1; i < STOPS.length; i++) if (x <= STOPS[i][0]) {
    const [x0, c0] = STOPS[i - 1], [x1, c1] = STOPS[i], f = (x - x0) / (x1 - x0);
    return `rgb(${c0.map((c, k) => Math.round(c + f * (c1[k] - c))).join(",")})`;
  }
  return "rgb(254,232,56)";
}
const tip = $("#tooltip");
const showTip = (ev, t) => { tip.style.display = "block"; tip.textContent = t; tip.style.left = ev.clientX + 12 + "px"; tip.style.top = ev.clientY + 12 + "px"; };
const hideTip = () => tip.style.display = "none";
const sc = (D) => (D === null || D === undefined) ? "–" : Math.round(D * 100);
const esc = (s) => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const now = () => new Date().toLocaleTimeString([], { hour12: false });

let META, TRUTH, RACE = null, poll = null;
const seen = {};   // planner -> number of logged records

function log(msg) {
  const el = $("#log");
  el.insertAdjacentHTML("afterbegin", `<div><span class="tm">${now()}</span>${msg}</div>`);
  while (el.children.length > 300) el.lastChild.remove();
}

// ---------------------------------------------------------------- setup
async function init() {
  [META, TRUTH] = await Promise.all([api.get("/api/meta"), api.get("/api/truth")]);
  const def = new Set(["random", "ofat", "bo_angle"]);
  if (META.available.deepseek) def.add("deepseek");
  setupContestants(META, $("#contestants"), def);
  const sv = [], tv = [];
  for (let i = 1; i <= 15; i++) sv.push((0.04 * i).toFixed(2));
  for (let i = 1; i <= 30; i++) tv.push((0.04 * i).toFixed(2));
  $("#m-sds").innerHTML = sv.map(v => `<option ${v === "0.08" ? "selected" : ""}>${v}</option>`).join("");
  $("#m-tween").innerHTML = tv.map(v => `<option ${v === "0.20" ? "selected" : ""}>${v}</option>`).join("");
  $("#devices").innerHTML = META.devices.map(d => `<div><code>${d.name}</code><span class="muted">${d.device_class} · ${d.channels.length} ch</span></div>`).join("");
  $("#rig-info").textContent = `world: ${META.config.noise_scale === 0 ? "noise off" : "realistic noise"}`;
  $("#k-star").textContent = sc(TRUTH.D_star);
  $("#k-star-s").textContent = `at SDS ${TRUTH.best[0]} / Tween ${TRUTH.best[1]}`;
  log("dashboard ready (simulation)");
  RACE = await api.get("/api/race");
  if (RACE.lanes && RACE.lanes.length) { render(); if (RACE.running) startPoll(); }
  else drawChart();
}

$("#start").onclick = async () => {
  const planners = chosenContestants($("#contestants"));
  if (!planners.length) return alert("Pick at least one contestant.");
  if ($("#seed-random").checked) $("#seed").value = Math.floor(Math.random() * 100000);   // new world each time
  try {
    await api.post("/api/race", { planners, budget: +$("#budget").value, n_init: +$("#ninit").value,
      seed: +$("#seed").value, delay_s: +$("#speed").value });
  } catch (e) { return alert(e.message); }
  Object.keys(seen).forEach(k => delete seen[k]);
  $("#lanes").innerHTML = "";
  log(`comparison started: ${planners.map(p => NAME[p]).join(", ")} · budget ${$("#budget").value} · seed ${$("#seed").value}`);
  startPoll();
};
$("#stop").onclick = () => { api.post("/api/race/stop"); log("stop requested"); };
$("#seed-random").onchange = () => { $("#seed").disabled = $("#seed-random").checked; };
$("#reveal").onchange = () => RACE && render();

function startPoll() {
  if (poll) clearInterval(poll);
  $("#start").disabled = true;
  poll = setInterval(async () => {
    RACE = await api.get("/api/race"); render();
    if (!RACE.running) { clearInterval(poll); poll = null; $("#start").disabled = false; log("comparison finished"); }
  }, 450);
}

// ---------------------------------------------------------------- manual run
$("#m-anim-close").onclick = () => { $("#m-anim-wrap").style.display = "none"; };
$("#m-run").onclick = async () => {
  const b = $("#m-run"); b.disabled = true;
  try {
    const out = await api.post("/api/run", { sds: +$("#m-sds").value, tween: +$("#m-tween").value });
    const r = out.record;
    if ($("#m-anim-on").checked && r.droplets) {
      $("#m-anim-wrap").style.display = "flex";
      $("#m-out").innerHTML = `<span class="muted">robot working…</span>`;
      await RobotAnim.play($("#m-anim"), out.steps, r, { caption: $("#m-anim-cap"), speed: 1 });
    }
    const inw = r.contact_angle_mean !== null && r.contact_angle_mean >= WIN[0] && r.contact_angle_mean <= WIN[1];
    $("#m-out").innerHTML = r.contact_angle_mean === null ? `<b>${r.status}</b> ${r.error || ""}` :
      `<span class="big">${r.contact_angle_mean.toFixed(2)}°</span> ± ${r.contact_angle_sd ?? "–"}° · score ${sc(r.desirability)} · ${inw ? "on target" : "off target"}<br>
       droplets ${r.droplets.map(d => d.angle_deg === null ? "×" : d.angle_deg.toFixed(1)).join(" / ")} · ${(r.duration_s / 60).toFixed(1)} min`;
    log(`manual: SDS ${r.set.sds_wv_pct} / Tween ${r.set.tween_wv_pct} → ${r.contact_angle_mean === null ? r.status : r.contact_angle_mean.toFixed(2) + "°"}`);
  } catch (e) { alert(e.message); }
  b.disabled = false;
};

// ---------------------------------------------------------------- rendering
function bestCurve(h) {
  let b = null; return h.map(x => { if (x.angle !== null && x.angle >= WIN[0] && x.angle <= WIN[1] && (b === null || x.D > b)) b = x.D; return b; });
}
function render() {
  if (!RACE || !RACE.lanes) return;
  // log new records
  RACE.lanes.forEach(ln => {
    const n0 = seen[ln.planner] || 0;
    ln.history.slice(n0).forEach((r, k) => {
      log(`<b style="color:${COLOR[ln.planner]}">${NAME[ln.planner]}</b> #${n0 + k + 1}${(r.tag || "").includes("init") ? " (starter)" : ""}: SDS ${r.sds} / Tween ${r.tween} → ${r.angle === null ? r.status : r.angle.toFixed(2) + "°"} · score ${sc(r.D)}`);
    });
    seen[ln.planner] = ln.history.length;
    if (ln.state === "done" && !seen[ln.planner + ":done"]) {
      seen[ln.planner + ":done"] = 1;
      const v = ln.validation || {};
      log(`<b style="color:${COLOR[ln.planner]}">${NAME[ln.planner]}</b> answers SDS ${ln.recommendation?.[0]} / Tween ${ln.recommendation?.[1]} → true ${v.true_theta?.toFixed?.(1)}° ${v.true_in_window ? "✓" : "✗"}`);
    }
  });
  drawKPIs(); drawChart(); drawFindings(); drawLanes(); drawBoard(); drawThinking();
}

function drawKPIs() {
  let best = null, who = "";
  let tests = 0, time = 0;
  RACE.lanes.forEach(ln => {
    const c = bestCurve(ln.history), b = c.length ? c[c.length - 1] : null;
    if (b !== null && (best === null || b > best)) { best = b; who = NAME[ln.planner]; }
    tests += ln.history.length; time += ln.sim_minutes;
  });
  $("#k-best").textContent = sc(best); $("#k-best-who").textContent = who ? "observed, by " + who : "";
  $("#k-tests").textContent = tests; $("#k-tests-s").textContent = RACE.meta ? `${RACE.lanes.length} contestants × up to ${RACE.meta.budget}` : "";
  $("#k-time").innerHTML = `${time.toFixed(0)}<small> min</small>`;
  if (RACE.meta) $("#k-star").textContent = sc(RACE.meta.D_star);
}

const GOOD = 0.90;   // score >= 90 and on target = "good recipe"

function drawChart() {
  const svg = $("#chart"); svg.innerHTML = "";
  const W = 1000, H = 330, L = 46, R = 230, Tm = 16, B = 40;
  const budget = RACE?.meta?.budget || +$("#budget").value;
  const ymin = 0.6, ymax = 1.0;
  const X = (i) => L + (i - 0.5) / budget * (W - L - R);
  const Y = (v) => H - B - 22 - (Math.max(ymin, v) - ymin) / (ymax - ymin) * (H - Tm - B - 22);
  const yNone = H - B - 6;                       // row for "nothing on target yet"
  const nInit = RACE?.meta?.n_init ?? +$("#ninit").value;
  if (nInit > 0) { S("rect", { x: L, y: Tm, width: X(nInit + 0.5) - L, height: H - Tm - B, fill: "rgba(0,0,0,.04)" }, svg);
    T(svg, L + 4, Tm + 12, "shared random starters", { "font-size": 11 }); }
  [0.6, 0.7, 0.8, 0.9, 1.0].forEach(v => { S("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: v === GOOD ? "#b8b4ab" : "#efede8", "stroke-dasharray": v === GOOD ? "4 4" : "" }, svg);
    T(svg, L - 8, Y(v) + 4, String(Math.round(v * 100)), { "text-anchor": "end" }); });
  T(svg, L - 8, yNone + 4, "none", { "text-anchor": "end", "font-size": 10.5 });
  const tick = budget <= 20 ? 1 : 5;
  for (let i = tick; i <= budget; i += tick) T(svg, X(i), H - B + 18, String(i), { "text-anchor": "middle", "font-size": 11 });
  T(svg, (L + W - R) / 2, H - 4, "test number", { "text-anchor": "middle" });
  const star = RACE?.meta?.D_star ?? TRUTH?.D_star;
  if (star) S("line", { x1: L, x2: W - R, y1: Y(star), y2: Y(star), stroke: "#c2384f", "stroke-dasharray": "2 4" }, svg);
  const labels = [{ y: Y(GOOD), text: "good recipe (90)", col: "#8a8780", fixed: true }];
  if (star) labels.push({ y: Y(star), text: `best possible (${sc(star)})`, col: "#c2384f", fixed: true });
  if (RACE && RACE.lanes && RACE.lanes.length) {
    const n = RACE.lanes.length;
    RACE.lanes.forEach((ln, k) => {
      const col = COLOR[ln.planner], off = (k - (n - 1) / 2) * 2.4;   // small offset so equal lines stay visible
      const c = bestCurve(ln.history);
      let d = "";
      c.forEach((v, i) => { const x = X(i + 1), y = (v === null ? yNone : Y(v)) + off; d += d ? ` H${x} V${y}` : `M${x} ${y}`; });
      if (d) S("path", { d, fill: "none", stroke: col, "stroke-width": 2.2, opacity: .9 }, svg);
      c.forEach((v, i) => {
        const x = X(i + 1), y = (v === null ? yNone : Y(v)) + off, h = ln.history[i];
        const improved = v !== null && (i === 0 || c[i - 1] === null || v > c[i - 1]);
        const dot = S("circle", { cx: x, cy: y, r: improved ? 5 : 3, fill: improved ? col : "#fff", stroke: col, "stroke-width": 1.6 }, svg);
        const off_t = h.angle !== null && (h.angle < WIN[0] || h.angle > WIN[1]);
        dot.onmousemove = (ev) => showTip(ev, `${NAME[ln.planner]} · test ${i + 1}${(h.tag || "").includes("init") ? " (starter)" : ""}\nSDS ${h.sds} / Tween ${h.tween} -> ${h.angle === null ? h.status : h.angle.toFixed(2) + "°"}\nthis test: score ${sc(h.D)}${off_t ? " (off target, not counted)" : ""}\nbest so far: ${v === null ? "none on target" : sc(v)}`);
        dot.onmouseleave = hideTip;
      });
      const last = c.length - 1;
      if (last >= 0) labels.push({ y: (c[last] === null ? yNone : Y(c[last])) + off, x: X(last + 1), col,
        text: `${NAME[ln.planner]} ${c[last] === null ? "-" : sc(c[last])}${ln.state === "done" && ln.history.length < RACE.meta.budget ? ` · stopped at ${ln.history.length}` : ""}` });
    });
  }
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 16) labels[i].y = labels[i - 1].y + 16;
  labels.forEach(l => {
    T(svg, W - R + 8, l.y + 4, l.text, { fill: l.col, "font-size": 13, "font-weight": l.fixed ? 400 : 600 });
    if (l.x) S("line", { x1: l.x + 6, x2: W - R + 4, y1: l.y, y2: l.y, stroke: l.col, "stroke-width": .8, "stroke-dasharray": "1 3" }, svg);
  });
}

function firstGood(ln) {
  const i = ln.history.findIndex(h => h.angle !== null && h.angle >= WIN[0] && h.angle <= WIN[1] && h.D >= GOOD);
  return i < 0 ? null : i + 1;
}
function drawFindings() {
  const lanes = RACE.lanes, budget = RACE.meta.budget, done = lanes.every(l => l.state === "done");
  const fg = lanes.map(l => ({ l, n: firstGood(l) }));
  const reached = fg.filter(x => x.n !== null).sort((a, b) => a.n - b.n);
  const never = fg.filter(x => x.n === null).map(x => NAME[x.l.planner]);
  const items = [];
  if (reached.length) {
    const f = reached[0];
    items.push(`<b>Fastest to a good recipe:</b> ${NAME[f.l.planner]} at test ${f.n}` +
      (reached.length > 1 ? `, then ${reached.slice(1).map(x => `${NAME[x.l.planner]} (${x.n})`).join(", ")}` : "") + ".");
  } else items.push("<b>No contestant</b> has measured a good recipe (on target, score at least 90) yet.");
  if (never.length && reached.length) items.push(`<b>Never found one</b> within ${budget} tests: ${never.join(", ")}.`);
  if (done) {
    const ok = lanes.filter(l => l.validation && l.validation.true_in_window);
    const top = Math.max(...lanes.map(l => l.validation && l.validation.true_in_window ? l.validation.true_D : 0));
    const best = lanes.filter(l => l.validation && l.validation.true_in_window && l.validation.true_D === top).map(l => NAME[l.planner]);
    items.push(`<b>Final answers:</b> ${ok.length} of ${lanes.length} are truly on target. Best answer scores ${sc(top)} (best possible ${sc(RACE.meta.D_star)}): ${best.join(", ")}.`);
    const early = lanes.filter(l => l.history.length < budget);
    if (early.length) items.push(`<b>Stopped early:</b> ${early.map(l => `${NAME[l.planner]} after ${l.history.length} tests (${l.sim_minutes} robot-min)`).join("; ")}; the others used all ${budget}.`);
    const miss = lanes.filter(l => l.validation && !l.validation.true_in_window);
    if (miss.length) items.push(`<b>Missed the target:</b> ${miss.map(l => `${NAME[l.planner]} (${l.validation.true_theta.toFixed(1)}°)`).join(", ")}. A lucky reading near the edge of the window can mislead.`);
  } else items.push(`<span class="muted">running... final answers appear when every contestant has finished.</span>`);
  if ((RACE.meta.n_init ?? 0) === 0) items.push(`No shared random starters: every contestant chose its very first test itself.`);
  items.push(`<li class="caveat">One comparison = one roll of the dice (seed ${RACE.meta.seed}). Change the seed and repeat before drawing a general conclusion.</li>`);
  $("#findings").innerHTML = items.map(t => t.startsWith("<li") ? t : `<li>${t}</li>`).join("");
  const svg = $("#bars"); svg.innerHTML = "";
  const L = 140, Wb = 250, bh = 20, gap = 8, rows = fg.slice().sort((a, b) => (a.n ?? 999) - (b.n ?? 999));
  svg.setAttribute("viewBox", `0 0 420 ${rows.length * (bh + gap) + 24}`);
  rows.forEach((x, k) => {
    const y = k * (bh + gap), col = COLOR[x.l.planner];
    T(svg, L - 8, y + bh * .72, NAME[x.l.planner], { "text-anchor": "end", fill: "#141414", "font-size": 12 });
    S("rect", { x: L, y, width: Wb, height: bh, rx: 4, fill: "#f2f0eb" }, svg);
    if (x.n !== null) { S("rect", { x: L, y, width: Wb * x.n / budget, height: bh, rx: 4, fill: col }, svg);
      T(svg, L + Wb * x.n / budget + 6, y + bh * .72, `${x.n} test${x.n > 1 ? "s" : ""}`, { fill: "#141414", "font-size": 12, "font-weight": 600 }); }
    else T(svg, L + 8, y + bh * .72, x.l.state === "done" ? `not within ${budget}` : "not yet", { "font-size": 12 });
  });
  T(svg, L, rows.length * (bh + gap) + 14, `shorter bar = fewer experiments (budget ${budget})`, { "font-size": 11 });
}

function cell(s, t, b) {
  const cw = (b.x1 - b.x0) / 30, ch = (b.y1 - b.y0) / 15, i = Math.round(t / 0.04) - 1, j = Math.round(s / 0.04) - 1;
  return { x: b.x0 + i * cw, y: b.y1 - (j + 1) * ch, w: cw, h: ch, cx: b.x0 + (i + .5) * cw, cy: b.y1 - (j + .5) * ch };
}
function drawLanes() {
  const wrap = $("#lanes");
  if (wrap.children.length !== RACE.lanes.length || !wrap.querySelector(".lane")) wrap.innerHTML = RACE.lanes.map((_, k) => `<div class="lane" id="ln${k}"></div>`).join("");
  const reveal = $("#reveal").checked, box = { x0: 2, x1: 298, y0: 2, y1: 150 };
  RACE.lanes.forEach((ln, k) => {
    const el = document.getElementById("ln" + k), budget = RACE.meta.budget;
    const st = ln.state === "running" ? `${ln.history.length}/${budget} tests` : ln.state === "validating" ? "re-testing answer" : ln.state === "done" ? `done · ${ln.history.length} tests` : ln.state;
    const th = ln.thoughts && ln.thoughts.length ? `<div class="bubble">${esc(ln.thoughts[ln.thoughts.length - 1]).slice(0, 300)}</div>` : "";
    el.innerHTML = `<div class="t"><span style="color:${COLOR[ln.planner]}">● ${NAME[ln.planner]}</span><span class="st">${st}${ln.error ? " · " + esc(ln.error) : ""}</span></div><svg viewBox="0 0 300 152"></svg>${th}`;
    const svg = el.querySelector("svg");
    TRUTH.cells.forEach(c => { const g = cell(c.sds, c.tween, box);
      S("rect", { x: g.x + .4, y: g.y + .4, width: g.w - .8, height: g.h - .8, fill: reveal ? caColor(c.theta) : "#f0eee9", stroke: reveal && c.good ? "#fff" : "none", "stroke-width": 1.4 }, svg); });
    if (reveal) { const b = cell(TRUTH.best[0], TRUTH.best[1], box); T(svg, b.cx, b.cy + 4, "★", { "text-anchor": "middle", "font-size": 11, fill: "#c2384f" }); }
    ln.history.forEach(p => { const g = cell(p.sds, p.tween, box); const init = (p.tag || "").includes("init");
      const c = S("circle", { cx: g.cx, cy: g.cy, r: 3.8, fill: init ? "#fff" : (p.angle === null ? "#fff" : caColor(p.angle)), stroke: init ? "#9a968e" : COLOR[ln.planner], "stroke-width": 1.4 }, svg);
      c.onmousemove = (ev) => showTip(ev, `SDS ${p.sds} / Tween ${p.tween}\n${p.angle === null ? p.status : p.angle.toFixed(2) + "°"} · score ${sc(p.D)}`); c.onmouseleave = hideTip; });
    if (ln.recommendation) { const g = cell(ln.recommendation[0], ln.recommendation[1], box);
      S("rect", { x: g.x - 1, y: g.y - 1, width: g.w + 2, height: g.h + 2, fill: "none", stroke: "#c2384f", "stroke-width": 2 }, svg); }
  });
}

function drawBoard() {
  const rows = RACE.lanes.map(ln => ({ ln, v: ln.validation || {} }));
  rows.sort((a, b) => ((b.v.true_in_window ? 1 : 0) - (a.v.true_in_window ? 1 : 0)) ||
    (((b.v.true_in_window ? b.v.true_D : 0) || 0) - ((a.v.true_in_window ? a.v.true_D : 0) || 0)) || (a.ln.history.length - b.ln.history.length));
  $("#board tbody").innerHTML = rows.map(({ ln, v }, k) => {
    const done = !!ln.validation, ok = !!v.true_in_window, r = ln.recommendation;
    return `<tr><td>${done ? k + 1 : "…"}</td><td style="color:${COLOR[ln.planner]};font-weight:600">${NAME[ln.planner]}</td>
      <td>${r ? `${r[0]} / ${r[1]}` : "–"}</td>
      <td class="${done ? (ok ? "ok" : "bad") : ""}">${done ? v.true_theta.toFixed(1) + "° " + (ok ? "✓" : "✗") : "–"}</td>
      <td><b>${done ? (ok ? sc(v.true_D) : 0) : "–"}</b></td>
      <td>${done && v.val_angle_mean !== null ? v.val_angle_mean.toFixed(1) + "°" : "–"}</td>
      <td>${ln.history.length}</td><td>${ln.sim_minutes}</td></tr>`;
  }).join("");
}

init();

// ---------------------------------------------------------------- LLM thinking timeline
let THINK_SEL = null;
const thinkRendered = {};   // lane -> number of entries rendered (keeps open <details> stable)
function drawThinking() {
  const lanes = (RACE.lanes || []).filter(l => (l.thought_log && l.thought_log.length) || /deepseek|llm|gpt|gemini|qwen|kimi|glm|openrouter|:/.test(l.planner));
  const tabs = $("#think-tabs"), tl = $("#timeline");
  if (!lanes.length) { tabs.innerHTML = ""; tl.innerHTML = `<div class="muted">Add an LLM contestant to see how it reasons between tests.</div>`; return; }
  if (!THINK_SEL || !lanes.some(l => l.planner === THINK_SEL)) THINK_SEL = lanes[0].planner;
  tabs.innerHTML = lanes.map(l => `<button data-p="${esc(l.planner)}" class="${l.planner === THINK_SEL ? "on" : ""}"
      style="${l.planner === THINK_SEL ? `background:${COLOR[l.planner]};border-color:${COLOR[l.planner]}` : `color:${COLOR[l.planner]}`}">
      ${esc(NAME[l.planner] || l.label || l.planner)} · ${(l.thought_log || []).length} turns</button>`).join("");
  tabs.querySelectorAll("button").forEach(b => b.onclick = () => { THINK_SEL = b.dataset.p; thinkRendered[THINK_SEL] = -1; drawThinking(); });
  const ln = lanes.find(l => l.planner === THINK_SEL), log = ln.thought_log || [];
  if (thinkRendered[THINK_SEL] === log.length && tl.dataset.lane === THINK_SEL) return;
  thinkRendered[THINK_SEL] = log.length; tl.dataset.lane = THINK_SEL;
  const col = COLOR[ln.planner];
  const resultOf = (k) => { const h = ln.history[k - 1]; if (!h) return "";
    const on = h.angle !== null && h.angle >= WIN[0] && h.angle <= WIN[1];
    return `<span class="res ${on ? "" : "off"}">result #${k}: ${h.angle === null ? h.status : h.angle.toFixed(2) + "°"} · score ${sc(h.D)}</span>`; };
  const u = ln.usage || {};
  tl.innerHTML = `<div class="muted small" style="margin-bottom:8px">model <code>${esc(ln.model || "")}</code> · ${u.turns || 0} turns · ${Math.round((u.input_tokens || 0) / 1000)}k in / ${Math.round((u.output_tokens || 0) / 1000)}k out tokens</div>` +
    log.map((e, i) => {
      const testsAfter = (log[i + 1] ? log[i + 1].tests_done : ln.history.length);
      const results = []; for (let k = e.tests_done + 1; k <= testsAfter; k++) results.push(resultOf(k));
      const head = e.tests_done === 0 ? "start of campaign" : `after ${e.tests_done} test${e.tests_done > 1 ? "s" : ""}`;
      const acts = (e.actions || []).map(a => `<span class="act ${a.startsWith("final") ? "final" : ""}">${esc(a)}</span>`).join("");
      return `<div class="tstep" style="--c:${col}"><div class="th">turn ${e.turn} · ${head}</div>
        ${e.text ? `<div class="tt">${esc(e.text)}</div>` : (e.reasoning ? "" : `<div class="tt muted">(no explanation written)</div>`)}
        ${e.reasoning ? `<details ${!e.text && i === log.length - 1 ? "open" : ""}><summary>model reasoning (${e.reasoning.length} chars)</summary><pre>${esc(e.reasoning)}</pre></details>` : ""}
        <div>${acts}${results.join("")}</div></div>`;
    }).join("") + (ln.state === "running" ? `<div class="muted small">thinking…</div>` : "");
  tl.scrollTop = tl.scrollHeight;
}
