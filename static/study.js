// Repeated study: many runs per contestant, aggregated with uncertainty.
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
const NAME = { random: "Random", ofat: "OFAT (manual-style)", bo_ts: "BO · RAISE-like", bo_angle: "BO · angle model",
  deepseek: "DeepSeek Flash", deepseek_pro: "DeepSeek Pro", deepseek_blind: "DeepSeek · blind", deepseek_permuted: "DeepSeek · scrambled", llm: "Claude" };
const COLOR = { random: "#9a968e", ofat: "#c58a2b", bo_ts: "#2f6fde", bo_angle: "#1f4fa8", deepseek: "#7b4fd6", deepseek_pro: "#b0359b",
  deepseek_blind: "#4f9d8a", deepseek_permuted: "#c2384f", llm: "#d4733a" };
const ORDER = ["random", "ofat", "bo_ts", "bo_angle", "deepseek", "deepseek_pro", "deepseek_blind", "deepseek_permuted", "llm"];
const isLLM = (p) => !["random", "ofat", "bo_ts", "bo_angle"].includes(p);
// median over ALL runs, counting "never found" as budget+1 (so rare successes cannot look fast)
function medAll(a, budget) {
  const v = a.tests_to_good_values.map(x => x === null ? budget + 1 : x).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return m;
}
const medTxt = (m, budget) => m === null ? "–" : (m > budget ? `not within ${budget}` : (Number.isInteger(m) ? String(m) : m.toFixed(1)));
const f = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v)) ? "–" : Number(v).toFixed(d);
const pct = (v) => v === null || v === undefined ? "–" : Math.round(v * 100) + "%";
const tip = $("#tooltip");
const showTip = (ev, t) => { tip.style.display = "block"; tip.textContent = t; tip.style.left = ev.clientX + 12 + "px"; tip.style.top = ev.clientY + 12 + "px"; };
const hideTip = () => tip.style.display = "none";
let META = null, poll = null, DATA = null;

async function init() {
  META = await api.get("/api/meta");
  const def = new Set(["random", "ofat", "bo_ts", "bo_angle"]);
  setupContestants(META, $("#contestants"), def, estimate);
  document.querySelectorAll("#repeats, #budget").forEach(e => e.addEventListener("input", estimate));
  $("#seed-random").onchange = () => $("#seed").disabled = $("#seed-random").checked;
  estimate();
  DATA = await api.get("/api/study");
  render();
  if (DATA.meta.state === "running") startPoll();
}

function chosen() { return chosenContestants($("#contestants")); }
function estimate() {
  const ps = chosen(), n = +$("#repeats").value, b = +$("#budget").value;
  const llm = ps.filter(isLLM).length;
  let s = `${ps.length} contestants × ${n} repeats = ${ps.length * n} campaigns.`;
  if (llm) s += ` LLM campaigns take ~1–3 min each and cost roughly $0.005–0.03 each (DeepSeek, budget ${b}).`;
  else s += " Non-LLM contestants finish in seconds.";
  $("#estimate").textContent = s;
}

$("#start").onclick = async () => {
  const planners = chosen();
  if (!planners.length) return alert("Pick at least one contestant.");
  if ($("#seed-random").checked) $("#seed").value = Math.floor(Math.random() * 1e6);
  try {
    await api.post("/api/study", { planners, repeats: +$("#repeats").value, budget: +$("#budget").value, n_init: +$("#ninit").value,
      worlds: $("#worlds").value, base_seed: +$("#seed").value, workers: +$("#workers").value });
  } catch (e) { return alert(e.message); }
  startPoll();
};
$("#stop").onclick = () => api.post("/api/study/stop");
function startPoll() {
  if (poll) clearInterval(poll);
  $("#start").disabled = true;
  poll = setInterval(async () => {
    DATA = await api.get("/api/study"); render();
    if (DATA.meta.state !== "running") { clearInterval(poll); poll = null; $("#start").disabled = false; }
  }, 1000);
}

// ---------------------------------------------------------------- rendering
function render() {
  const m = DATA.meta, runs = DATA.runs || [];
  const agg = (DATA.aggregate || []).slice().sort((a, b) => ORDER.indexOf(a.planner) - ORDER.indexOf(b.planner));
  if (m.state && m.state !== "idle") {
    const el = (Date.now() / 1000 - m.started) | 0, done = m.done || 0, tot = m.total || 1;
    $("#bar").style.width = (100 * done / tot) + "%";
    const eta = done ? Math.round(el / done * (tot - done)) : null;
    $("#prog").textContent = `${m.state} · ${done}/${tot} campaigns · ${m.state === "running" ? `${el}s elapsed${eta !== null ? `, ~${eta}s left` : ""}` : `took ${m.elapsed_s}s`} · base seed ${m.base_seed} · ${m.worlds === "mixed" ? "5 worlds" : "1 world"}`;
    $("#errors").innerHTML = (m.errors || []).map(e => `<div>${e}</div>`).join("");
    $("#saved").textContent = m.saved_to ? `saved to ${m.saved_to}` : "";
    $("#sum-sub").textContent = `${m.repeats} repeats × budget ${m.budget} · ${m.n_init} random starters`;
  }
  drawSummary(agg); drawCharts(agg, runs); drawTakeaways(agg, m); drawRuns(runs);
}

function drawSummary(agg) {
  if (!agg.length) { $("#summary").innerHTML = `<tr><td class="muted">No results yet.</td></tr>`; return; }
  const best = Math.max(...agg.map(a => a.score_mean ?? -1));
  $("#summary").innerHTML = `<thead><tr><th>contestant</th><th>runs</th><th>success<br><span class="sub">final answer on target</span></th>
    <th>mean score<br><span class="sub">± s.e.</span></th><th>found a good recipe</th><th>tests to good<br><span class="sub">median, all runs</span></th>
    <th>tests used<br><span class="sub">mean</span></th><th>robot time<br><span class="sub">min, mean</span></th><th>real time<br><span class="sub">s, mean</span></th>
    <th>tokens<br><span class="sub">in · out, mean</span></th><th>cost<br><span class="sub">per run · total</span></th></tr></thead><tbody>` +
    agg.map(a => `<tr class="${a.score_mean === best ? "best" : ""}"><td style="color:${COLOR[a.planner]};font-weight:700">${NAME[a.planner] || a.planner}</td><td>${a.n}</td>
      <td><b>${pct(a.success_rate)}</b> <span class="sub">[${pct(a.success_lo)}–${pct(a.success_hi)}]</span></td>
      <td><b>${f(a.score_mean)}</b> <span class="sub">± ${f(a.score_se)}</span></td>
      <td>${pct(a.found_rate)}</td>
      <td>${medTxt(medAll(a, DATA.meta.budget || 15), DATA.meta.budget || 15)}</td>
      <td>${f(a.tests_used_mean)}</td><td>${f(a.robot_min_mean)}</td><td>${f(a.wall_s_mean)}</td>
      <td>${a.tokens_in_mean ? Math.round(a.tokens_in_mean / 1000) + "k · " + Math.round(a.tokens_out_mean / 1000) + "k" : "–"}</td>
      <td>${a.cost_per_run_usd != null ? "$" + a.cost_per_run_usd.toFixed(3) + " · $" + a.cost_total_usd.toFixed(2) : "–"}</td></tr>`).join("") + "</tbody>";
}

function hbars(svg, rows, { value, lo, hi, max, fmt, note }) {
  svg.innerHTML = "";
  const L = 150, W = 300, top = 8, bh = Math.max(14, Math.min(26, 200 / Math.max(1, rows.length) - 8));
  svg.setAttribute("viewBox", `0 0 520 ${top + rows.length * (bh + 8) + 26}`);
  rows.forEach((r, k) => {
    const y = top + k * (bh + 8), v = value(r);
    T(svg, L - 8, y + bh * .7, NAME[r.planner] || r.planner, { "text-anchor": "end", fill: "#141414" });
    S("rect", { x: L, y, width: W, height: bh, rx: 4, fill: "#f2f0eb" }, svg);
    if (v !== null && v !== undefined) {
      S("rect", { x: L, y, width: W * Math.max(0, v) / max, height: bh, rx: 4, fill: COLOR[r.planner] }, svg);
      const a = lo(r), b = hi(r);
      if (a !== null && a !== undefined && b !== null && b !== undefined) {
        S("line", { x1: L + W * a / max, x2: L + W * b / max, y1: y + bh / 2, y2: y + bh / 2, stroke: "#141414", "stroke-width": 1.4 }, svg);
        [a, b].forEach(x => S("line", { x1: L + W * x / max, x2: L + W * x / max, y1: y + bh * .25, y2: y + bh * .75, stroke: "#141414", "stroke-width": 1.4 }, svg));
      }
      T(svg, L + W + 8, y + bh * .7, fmt(v), { fill: "#141414", "font-weight": 600 });
    } else T(svg, L + 8, y + bh * .7, "n/a");
  });
  if (note) T(svg, L, top + rows.length * (bh + 8) + 14, note, { "font-size": 11 });
}

function drawCharts(agg, runs) {
  if (!agg.length) { ["#c-success", "#c-score", "#c-ttg", "#c-cost"].forEach(id => $(id).innerHTML = ""); return; }
  hbars($("#c-success"), agg, { value: a => a.success_rate, lo: a => a.success_lo, hi: a => a.success_hi, max: 1, fmt: pct, note: "bar = share of runs whose answer is truly on target · whiskers = 95% interval" });
  hbars($("#c-score"), agg, { value: a => a.score_mean, lo: a => a.score_se != null ? a.score_mean - 1.96 * a.score_se : null, hi: a => a.score_se != null ? Math.min(100, a.score_mean + 1.96 * a.score_se) : null, max: 100, fmt: v => v.toFixed(1), note: "0 when the answer misses the target · whiskers = ±1.96 s.e." });
  hbars($("#c-cost"), agg, { value: a => a.robot_min_mean, lo: () => null, hi: () => null, max: Math.max(...agg.map(a => a.robot_min_mean || 0)) * 1.1 || 1, fmt: v => v.toFixed(0) + " robot-min", note: "simulated robot time per campaign (≈ experiments × 3.4 min)" });
  // dot strip for tests-to-good
  const svg = $("#c-ttg"); svg.innerHTML = "";
  const budget = DATA.meta.budget || 15, L = 150, W = 300, top = 8, bh = Math.max(16, Math.min(28, 200 / agg.length - 6));
  svg.setAttribute("viewBox", `0 0 520 ${top + agg.length * (bh + 6) + 34}`);
  const X = (v) => L + (v - 0.5) / (budget + 1) * W;
  for (let i = 1; i <= budget; i += budget > 20 ? 5 : 2) T(svg, X(i), top + agg.length * (bh + 6) + 12, String(i), { "text-anchor": "middle", "font-size": 10.5 });
  T(svg, X(budget + 1), top + agg.length * (bh + 6) + 12, "never", { "text-anchor": "middle", "font-size": 10.5 });
  agg.forEach((a, k) => {
    const y = top + k * (bh + 6), cy = y + bh / 2, col = COLOR[a.planner];
    T(svg, L - 8, cy + 4, NAME[a.planner] || a.planner, { "text-anchor": "end", fill: "#141414" });
    S("line", { x1: L, x2: L + W, y1: cy, y2: cy, stroke: "#efede8" }, svg);
    const counts = {};
    a.tests_to_good_values.forEach(v => {
      const key = v === null ? budget + 1 : v; counts[key] = (counts[key] || 0) + 1;
      const jitter = ((counts[key] - 1) % 5 - 2) * 3;
      const c = S("circle", { cx: X(key), cy: cy + jitter, r: 3.6, fill: v === null ? "#fff" : col, stroke: col, "stroke-width": 1.3, opacity: .85 }, svg);
      c.onmousemove = (ev) => showTip(ev, `${NAME[a.planner]}: ${v === null ? "never found a good recipe" : "first good recipe at test " + v}`); c.onmouseleave = hideTip;
    });
    const md = medAll(a, budget);
    if (md !== null) S("line", { x1: X(md), x2: X(md), y1: y, y2: y + bh, stroke: "#141414", "stroke-width": 2.2 }, svg);
  });
  T(svg, L, top + agg.length * (bh + 6) + 28, "dot = one repeat · black tick = median over all runs · hollow = never within budget", { "font-size": 11 });
}

function drawTakeaways(agg, m) {
  if (!agg.length) return;
  const items = [];
  const bySucc = [...agg].sort((a, b) => b.success_rate - a.success_rate);
  const byScore = [...agg].sort((a, b) => (b.score_mean ?? 0) - (a.score_mean ?? 0));
  const B = m.budget || 15;
  const fast = [...agg].map(a => ({ a, md: medAll(a, B) })).sort((x, y) => x.md - y.md);
  const n = Math.min(...agg.map(a => a.n));
  items.push(`<b>Most reliable answer:</b> ${NAME[bySucc[0].planner]} — ${pct(bySucc[0].success_rate)} of runs ended on target (95% interval ${pct(bySucc[0].success_lo)}–${pct(bySucc[0].success_hi)}).` +
    (bySucc.length > 1 ? ` Lowest: ${NAME[bySucc[bySucc.length - 1].planner]} at ${pct(bySucc[bySucc.length - 1].success_rate)}.` : ""));
  items.push(`<b>Best average score:</b> ${NAME[byScore[0].planner]} ${f(byScore[0].score_mean)} ± ${f(byScore[0].score_se)} (best possible ≈ 97).`);
  if (fast.length) items.push(`<b>Fastest to a good recipe (median over all runs; "not within" = most runs never found one):</b> ${fast.map(x => `${NAME[x.a.planner]} ${medTxt(x.md, B)}`).join(", ")}.` +
    (agg.some(a => a.found_rate < 1) ? ` Never found one in some runs: ${agg.filter(a => a.found_rate < 1).map(a => `${NAME[a.planner]} (${pct(1 - a.found_rate)} of runs)`).join(", ")}.` : ""));
  const early = agg.filter(a => a.tests_used_mean < (m.budget || 0) - 0.05);
  if (early.length) items.push(`<b>Uses fewer experiments:</b> ${early.map(a => `${NAME[a.planner]} ${f(a.tests_used_mean)} of ${m.budget} on average (${f(a.robot_min_mean, 0)} robot-min)`).join("; ")}.`);
  const llm = agg.filter(a => a.cost_total_usd != null);
  if (llm.length) items.push(`<b>LLM cost:</b> ${llm.map(a => `${NAME[a.planner]} ~$${a.cost_per_run_usd.toFixed(3)} per campaign, ${f(a.wall_s_mean, 0)} s real time`).join("; ")} (upper bound at peak prices).`);
  if (bySucc.length > 1) {
    const a = bySucc[0], b = bySucc[1];
    const overlap = a.success_lo <= b.success_hi;
    items.push(overlap ? `The top two success rates (${NAME[a.planner]} vs ${NAME[b.planner]}) have overlapping intervals: with ${n} repeats this gap could be luck. Add repeats to separate them.`
      : `${NAME[a.planner]}'s success rate is clearly above ${NAME[b.planner]}'s (intervals do not overlap).`);
  }
  $("#takeaways").innerHTML = items.map(t => `<li>${t}</li>`).join("") +
    `<li class="caveat">${m.worlds === "mixed" ? "Runs rotate over 5 plausible simulated worlds." : "All runs use one simulated world (physics model); try \"5 plausible worlds\" to check robustness."} Simulation results compare strategies; they are not predictions of real lab numbers.</li>`;
}

function drawRuns(runs) {
  if (!runs.length) { $("#runs").innerHTML = ""; return; }
  const rs = [...runs].sort((a, b) => a.repeat - b.repeat || ORDER.indexOf(a.planner) - ORDER.indexOf(b.planner));
  $("#runs").innerHTML = `<thead><tr><th>repeat</th><th>seed</th><th>world</th><th>contestant</th><th>answer</th><th>true angle</th><th>score</th><th>tests to good</th><th>tests used</th><th>robot min</th><th>real s</th><th>cost</th></tr></thead><tbody>` +
    rs.map(r => `<tr><td>${r.repeat}</td><td>${r.seed}</td><td>${r.world}</td><td style="color:${COLOR[r.planner]};font-weight:600">${NAME[r.planner] || r.planner}</td>
      <td>${r.answer_sds ?? "–"} / ${r.answer_tween ?? "–"}</td><td class="${r.success ? "ok" : "bad"}">${f(r.true_angle)}° ${r.success ? "✓" : "✗"}</td>
      <td>${f(r.score)}</td><td>${r.tests_to_good ?? "never"}</td><td>${r.tests_used}</td><td>${f(r.robot_min)}</td><td>${f(r.wall_s)}</td>
      <td>${r.cost_usd != null ? "$" + r.cost_usd.toFixed(4) : "–"}</td></tr>`).join("") + "</tbody>";
}

init();
