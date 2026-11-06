// Guided tour: five screens that tell the story for non-specialists.
"use strict";
const $ = (s) => document.querySelector(s);
const api = {
  get: (u) => fetch(u).then(r => r.json()),
  post: (u, b) => fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) })
    .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || r.statusText); return j; }),
};
const NS = "http://www.w3.org/2000/svg";
function S(tag, a = {}, p) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (p) p.appendChild(e); return e; }
function T(p, x, y, t, a = {}) { const e = S("text", { x, y, "font-size": 13, fill: "#6b7385", ...a }, p); e.textContent = t; return e; }
const WIN = [70.39, 73.61];
const NICE = { random: "Random guessing", ofat: "Human-style (one knob at a time)", bo_ts: "Bayesian optimisation (RAISE)",
  bo_angle: "Bayesian optimisation (smarter)", deepseek: "AI scientist (DeepSeek Flash)", deepseek_pro: "AI scientist (DeepSeek Pro)", deepseek_blind: "AI scientist, no chemistry hints",
  deepseek_permuted: "AI with scrambled feedback", llm: "AI scientist (Claude)" };
const ICON = { random: "🎲", ofat: "🧑‍🔬", bo_ts: "📈", bo_angle: "📈", deepseek: "🤖", deepseek_pro: "🧠", deepseek_blind: "🤖", deepseek_permuted: "🙈", llm: "🤖" };
const STOPS = [[0, [0, 34, 78]], [0.25, [62, 74, 107]], [0.5, [124, 123, 120]], [0.75, [190, 175, 111]], [1, [254, 232, 56]]];
function caColor(a) {
  if (a === null || a === undefined) return "#ccd1da";
  let x = Math.max(0, Math.min(1, (a - 58) / (80 - 58)));
  for (let i = 1; i < STOPS.length; i++) if (x <= STOPS[i][0]) {
    const [x0, c0] = STOPS[i - 1], [x1, c1] = STOPS[i], f = (x - x0) / (x1 - x0);
    return `rgb(${c0.map((c, k) => Math.round(c + f * (c1[k] - c))).join(",")})`;
  }
  return "rgb(254,232,56)";
}
const tip = $("#tooltip");
const showTip = (ev, t) => { tip.style.display = "block"; tip.textContent = t; tip.style.left = ev.clientX + 14 + "px"; tip.style.top = ev.clientY + 12 + "px"; };
const hideTip = () => tip.style.display = "none";
const score = (D) => D === null || D === undefined ? "—" : Math.round(D * 100);
const desir = (th, s, t) => Math.sqrt(Math.max(0, 1 - Math.abs(th - 72) / 50) * Math.max(0, 1 - (s + t) / 2));

let TRUTH = null, META = null, LOOK = {};
let step = 0;
const steps = [...document.querySelectorAll(".step")];

// ---------------------------------------------------------------- navigation
function go(i) {
  step = Math.max(0, Math.min(steps.length - 1, i));
  steps.forEach((s, k) => s.classList.toggle("on", k === step));
  document.querySelectorAll("#dots button").forEach((b, k) => b.classList.toggle("on", k === step));
  $("#step-name").textContent = `${step + 1} / ${steps.length} · ${steps[step].dataset.title}`;
  $("#prev").disabled = step === 0; $("#next").disabled = step === steps.length - 1;
  if (step === 2) drawSpace(false);
  if (step === 4) drawBoard();
  window.scrollTo(0, 0);
}
$("#dots").innerHTML = steps.map((s, k) => `<button>${k + 1}. ${s.dataset.title}</button>`).join("");
document.querySelectorAll("#dots button").forEach((b, k) => b.onclick = () => go(k));
$("#prev").onclick = () => go(step - 1); $("#next").onclick = () => go(step + 1);
document.addEventListener("keydown", (e) => { if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (e.key === "ArrowRight") go(step + 1); if (e.key === "ArrowLeft") go(step - 1); });

// ---------------------------------------------------------------- 1. one droplet
function drawDrop(svg, angle, opts = {}) {
  svg.innerHTML = "";
  const W = +svg.viewBox.baseVal.width, H = +svg.viewBox.baseVal.height, base = H - 40, a = W * 0.27;
  S("rect", { x: 20, y: base, width: W - 40, height: 14, rx: 3, fill: opts.dark ? "#374151" : "#c9ced8" }, svg);
  if (angle === null || angle === undefined) { T(svg, W / 2, base - 40, "no droplet found", { "text-anchor": "middle", fill: "#d1435b", "font-size": 18 }); return; }
  const th = angle * Math.PI / 180, R = a / Math.sin(th);
  S("path", { d: `M ${W / 2 - a} ${base} A ${R} ${R} 0 ${angle > 90 ? 1 : 0} 1 ${W / 2 + a} ${base} Z`,
    fill: opts.dark ? "rgba(147,197,253,.55)" : "rgba(47,111,222,.22)", stroke: opts.dark ? "#93c5fd" : "#2f6fde", "stroke-width": 3 }, svg);
  if (opts.target) {  // ghost outline of the 72° target drop
    const t2 = 72 * Math.PI / 180, R2 = a / Math.sin(t2);
    S("path", { d: `M ${W / 2 - a} ${base} A ${R2} ${R2} 0 0 1 ${W / 2 + a} ${base}`, fill: "none", stroke: "#1f9d6b", "stroke-width": 2, "stroke-dasharray": "7 6" }, svg);
    T(svg, W / 2 + a + 8, base - a * 0.9, "target 72°", { fill: "#1f9d6b", "font-size": 14 });
  }
  const L = a * 0.75, x = W / 2 + a;
  S("line", { x1: x, y1: base, x2: x - L * Math.cos(th), y2: base - L * Math.sin(th), stroke: "#e5862a", "stroke-width": 3 }, svg);
  S("line", { x1: x, y1: base, x2: x - L, y2: base, stroke: "#e5862a", "stroke-width": 3 }, svg);
  const r = 34; S("path", { d: `M ${x - r} ${base} A ${r} ${r} 0 0 1 ${x - r * Math.cos(th)} ${base - r * Math.sin(th)}`, fill: "none", stroke: "#e5862a", "stroke-width": 2 }, svg);
}
function updateDrop() {
  const s = +(0.04 * $("#s-sds").value).toFixed(2), t = +(0.04 * $("#s-tween").value).toFixed(2);
  $("#v-sds").textContent = s.toFixed(2) + " %"; $("#v-tween").textContent = t.toFixed(2) + " %";
  const th = LOOK[`${s.toFixed(2)},${t.toFixed(2)}`];
  drawDrop($("#big-drop"), th, { target: true });
  $("#d-angle").textContent = th.toFixed(1) + "°";
  const v = $("#d-verdict");
  if (th >= WIN[0] && th <= WIN[1]) { v.textContent = "✓ on target"; v.className = "verdict ok"; }
  else if (th < WIN[0]) { v.textContent = "too flat → less SDS / more Tween"; v.className = "verdict flat"; }
  else { v.textContent = "too round → more SDS"; v.className = "verdict round"; }
  $("#m-cost").style.width = ((s + t) / 1.8 * 100) + "%";
  const D = th >= WIN[0] && th <= WIN[1] ? desir(th, s, t) : desir(th, s, t) * 0.6;
  $("#m-score").style.width = (D * 100) + "%"; $("#v-score").textContent = Math.round(D * 100);
  $("#exp-recipe").textContent = `Recipe from step 1: SDS ${s.toFixed(2)} % + Tween ${t.toFixed(2)} %`;
}
["#s-sds", "#s-tween"].forEach(id => $(id).oninput = updateDrop);
document.querySelectorAll(".presets button").forEach(b => b.onclick = () => {
  const [s, t] = b.dataset.p.split(",").map(Number);
  $("#s-sds").value = Math.round(s / 0.04); $("#s-tween").value = Math.round(t / 0.04); updateDrop();
});

// ---------------------------------------------------------------- 2. one experiment
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
$("#exp-run").onclick = async () => {
  const btn = $("#exp-run"); btn.disabled = true;
  const s = +(0.04 * $("#s-sds").value).toFixed(2), t = +(0.04 * $("#s-tween").value).toFixed(2);
  const items = [...document.querySelectorAll("#pipe li")];
  items.forEach(li => li.className = "");
  $("#photos").innerHTML = ""; $("#exp-summary").innerHTML = "";
  let out;
  try { out = await api.post("/api/run", { sds: s, tween: t }); } catch (e) { alert(e.message); btn.disabled = false; return; }
  const r = out.record;
  for (let k = 0; k < items.length; k++) {
    items.forEach((li, j) => li.className = j < k ? "done" : (j === k ? "now" : ""));
    if (items[k].dataset.k === "photo") {
      r.droplets.forEach((d, j) => {
        const div = document.createElement("div"); div.className = "photo";
        const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 260 150"); div.appendChild(svg);
        drawDrop(svg, d.angle_deg, { dark: true });
        div.insertAdjacentHTML("beforeend", `<div class="a">${d.angle_deg === null ? "failed" : d.angle_deg.toFixed(1) + "°"}</div><div class="muted">droplet ${j + 1}</div>`);
        $("#photos").appendChild(div);
      });
    }
    await sleep(650);
  }
  items.forEach(li => li.className = "done");
  const inw = r.contact_angle_mean !== null && r.contact_angle_mean >= WIN[0] && r.contact_angle_mean <= WIN[1];
  $("#exp-summary").innerHTML = `Average <b>${r.contact_angle_mean === null ? "—" : r.contact_angle_mean.toFixed(1) + "°"}</b>
    (the three drops differ a little: that is measurement noise) · ${inw ? '<span class="ok" style="color:var(--good)">on target ✓</span>' : "not on target"}<br>
    This test took <b>${(r.duration_s / 60).toFixed(1)} minutes</b> of robot time, ${Object.values(r.volumes_uL).reduce((a, b) => a + b, 0).toFixed(0)} µL of liquid,
    3 of the 90 droplet spots on the stage, and several pipette tips.`;
  btn.disabled = false;
};

// ---------------------------------------------------------------- 3. the space
function cell(s, t, box) {
  const cw = (box.x1 - box.x0) / 30, ch = (box.y1 - box.y0) / 15;
  const i = Math.round(t / 0.04) - 1, j = Math.round(s / 0.04) - 1;
  return { x: box.x0 + i * cw, y: box.y1 - (j + 1) * ch, w: cw, h: ch, cx: box.x0 + (i + .5) * cw, cy: box.y1 - (j + .5) * ch };
}
function drawGrid(svg, box, { reveal, points = [], labels = true, onCell }) {
  svg.innerHTML = "";
  TRUTH.cells.forEach(c => {
    const g = cell(c.sds, c.tween, box);
    const r = S("rect", { x: g.x + .5, y: g.y + .5, width: g.w - 1.5, height: g.h - 1.5, rx: 2,
      fill: reveal ? caColor(c.theta) : "#e4e8ef", stroke: reveal && c.good ? "#fff" : "none", "stroke-width": 2 }, svg);
    if (onCell) { r.onmousemove = (ev) => onCell(ev, c); r.onmouseleave = hideTip; }
  });
  if (reveal) { const b = cell(TRUTH.best[0], TRUTH.best[1], box); T(svg, b.cx, b.cy + 5, "★", { "text-anchor": "middle", "font-size": 15, fill: "#d1435b" }); }
  if (labels) {
    T(svg, (box.x0 + box.x1) / 2, box.y1 + 22, "more Tween →", { "text-anchor": "middle", fill: "#1d2433", "font-size": 14 });
    const y = T(svg, box.x0 - 14, (box.y0 + box.y1) / 2, "more SDS →", { "text-anchor": "middle", fill: "#1d2433", "font-size": 14 });
    y.setAttribute("transform", `rotate(-90 ${box.x0 - 14} ${(box.y0 + box.y1) / 2})`);
  }
  points.forEach((p, k) => {
    const g = cell(p.sds, p.tween, box);
    S("circle", { cx: g.cx, cy: g.cy, r: Math.min(g.w, g.h) * 0.42, fill: p.angle === null ? "#fff" : caColor(p.angle),
      stroke: (p.tag || "").includes("init") ? "#9aa3b5" : "#111827", "stroke-width": 1.5 }, svg);
  });
}
let revealed = false;
function drawSpace(rev) {
  revealed = rev;
  drawGrid($("#space"), { x0: 40, x1: 800, y0: 10, y1: 262 }, { reveal: rev, onCell: (ev, c) =>
    showTip(ev, `SDS ${c.sds.toFixed(2)} %  Tween ${c.tween.toFixed(2)} %` + (rev ? `\nangle ${c.theta.toFixed(1)}°   score ${score(c.D)}` : "\n(unknown until tested)")) });
  $("#reveal-btn").textContent = rev ? "Hide it again" : "Reveal the hidden answer";
  $("#space-legend").innerHTML = rev ? [60, 64, 68, 72, 76, 80].map(v => `<span><span class="swatch" style="background:${caColor(v)}"></span>${v}°</span>`).join("") +
    `<span>· white outline: good recipes (on target and thrifty) · ★ the best one</span>` : `<span>Grey = unknown. A strategy has to discover the colours by testing.</span>`;
}
$("#reveal-btn").onclick = () => drawSpace(!revealed);

// ---------------------------------------------------------------- 4. race
let racePoll = null, RACE = null;
function lanePicker() {
  const order = ["random", "ofat", "bo_ts", "bo_angle", "deepseek", "deepseek_pro", "deepseek_blind", "deepseek_permuted", "llm"];
  const on = new Set(["random", "ofat", "bo_angle"]);
  if (META.available.deepseek) ["deepseek", "deepseek_pro"].forEach(p => on.add(p));
  $("#lane-pick").innerHTML = order.filter(p => META.planners[p]).map(p =>
    `<label title="${META.planners[p]}"><input type="checkbox" value="${p}" ${on.has(p) && META.available[p] ? "checked" : ""} ${META.available[p] ? "" : "disabled"}>
     ${ICON[p]} ${NICE[p]}${META.available[p] ? "" : " (needs API key)"}</label>`).join("");
}
$("#r-start").onclick = async () => {
  const planners = [...document.querySelectorAll("#lane-pick input:checked")].map(i => i.value);
  if (!planners.length) return alert("Pick at least one contestant.");
  try { await api.post("/api/race", { planners, budget: +$("#r-budget").value, n_init: 3, seed: Math.floor(Math.random() * 1000), delay_s: +$("#r-delay").value }); }
  catch (e) { return alert(e.message); }
  if (racePoll) clearInterval(racePoll);
  racePoll = setInterval(async () => { RACE = await api.get("/api/race"); drawLanes(); if (!RACE.running) { clearInterval(racePoll); racePoll = null; drawLanes(); } }, 500);
};
$("#r-stop").onclick = () => api.post("/api/race/stop");
function bestInWindow(h) {
  let b = null; h.forEach(x => { if (x.angle !== null && x.angle >= WIN[0] && x.angle <= WIN[1] && (!b || x.D > b.D)) b = x; }); return b;
}
function drawLanes() {
  if (!RACE || !RACE.lanes) return;
  const el = $("#lanes");
  if (el.children.length !== RACE.lanes.length) el.innerHTML = RACE.lanes.map((_, k) => `<div class="lane" id="lane${k}"></div>`).join("");
  RACE.lanes.forEach((ln, k) => {
    const h = ln.history, b = bestInWindow(h), budget = RACE.meta.budget;
    const status = ln.state === "running" ? `testing… ${h.length}/${budget}` : ln.state === "validating" ? "re-testing its answer…" :
      ln.state === "done" ? `finished after ${h.length} tests` : ln.state;
    const thought = (ln.thoughts && ln.thoughts.length) ? `<div class="bubble">💭 ${escapeHTML(ln.thoughts[ln.thoughts.length - 1]).slice(0, 420)}</div>` : "";
    const box = document.getElementById("lane" + k);
    box.innerHTML = `<h3>${ICON[ln.planner] || ""} ${NICE[ln.planner] || ln.planner}</h3><div class="sub">${status}${ln.error ? " · " + ln.error : ""}</div>
      <svg viewBox="0 0 300 150" id="lm${k}"></svg>
      <div class="nums"><div class="num"><div class="l">tests used</div><div class="v">${h.length} / ${budget}</div></div>
      <div class="num"><div class="l">best on-target so far</div><div class="v">${b ? b.angle.toFixed(1) + "° · " + score(b.D) : "none yet"}</div></div></div>${thought}`;
    drawGrid(document.getElementById("lm" + k), { x0: 6, x1: 294, y0: 4, y1: 146 }, { reveal: false, points: h, labels: false });
    if (ln.recommendation) { const g = cell(ln.recommendation[0], ln.recommendation[1], { x0: 6, x1: 294, y0: 4, y1: 146 });
      S("rect", { x: g.x - 1, y: g.y - 1, width: g.w + 2, height: g.h + 2, fill: "none", stroke: "#d1435b", "stroke-width": 2.5 }, document.getElementById("lm" + k)); }
  });
}
function escapeHTML(s) { return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

// ---------------------------------------------------------------- 5. scoreboard
function drawBoard() {
  if (!RACE || !RACE.lanes || !RACE.lanes.length) return;
  const rows = RACE.lanes.map(ln => {
    const v = ln.validation || {};
    return { ...ln, ok: !!v.val_in_window, sc: v.true_D !== undefined && v.true_in_window ? v.true_D : 0, v };
  });
  // rank by the hidden truth: on target first, then score, then fewer tests
  rows.sort((a, b) => ((b.v.true_in_window ? 1 : 0) - (a.v.true_in_window ? 1 : 0)) || (b.sc - a.sc) || (a.history.length - b.history.length));
  const medal = ["🥇", "🥈", "🥉"];
  const star = RACE.meta.D_star;
  let place = 0;
  $("#board").innerHTML = rows.map((r) => {
    const rec = r.recommendation, v = r.v, done = !!r.validation;
    const truthOk = !!v.true_in_window;
    const m = done ? (truthOk ? (medal[place++] || "✓") : "✗") : "⏳";
    return `<div class="score-card"><div class="rank">${m}</div>
      <h3>${ICON[r.planner] || ""} ${NICE[r.planner] || r.planner}</h3>
      <div class="muted">its answer</div><div style="font-size:18px;font-weight:700">${rec ? `SDS ${rec[0]} % + Tween ${rec[1]} %` : "—"}</div>
      <div class="line"><span>true angle of that recipe</span><span class="${truthOk ? "ok" : "bad"}">${done ? v.true_theta.toFixed(1) + "° " + (truthOk ? "on target ✓" : "off target ✗") : "…"}</span></div>
      <div class="line"><span>score (best possible ${score(star)})</span><span><b>${done ? score(r.sc) : "…"}</b></span></div>
      <div class="line"><span>average of 5 re-tests</span><span>${done && v.val_angle_mean !== null ? v.val_angle_mean.toFixed(1) + "°" : "…"}</span></div>
      <div class="line"><span>tests used</span><span>${r.history.length}</span></div>
      <div class="line"><span>robot time</span><span>${r.sim_minutes} min</span></div></div>`;
  }).join("") + `<div class="card" style="grid-column:1/-1"><b>How to read this:</b> the simulator knows each recipe's true angle, so we can check whether
    the named recipe is really on target (70.4–73.6°). The score (0–100) rewards being on target <i>and</i> using little ingredient; 0 means off target.
    The best recipe in this world scores ${score(star)}. The 5 re-tests show what a lab would see: real measurements scatter by about ±1°, which is
    why a recipe close to the edge of the target can look good once and fail later.</div>`;
}

// ---------------------------------------------------------------- init
(async function init() {
  [META, TRUTH] = await Promise.all([api.get("/api/meta"), api.get("/api/truth")]);
  TRUTH.cells.forEach(c => LOOK[`${c.sds.toFixed(2)},${c.tween.toFixed(2)}`] = c.theta);
  lanePicker(); updateDrop();
  RACE = await api.get("/api/race"); drawLanes();
  if (RACE.running) racePoll = setInterval(async () => { RACE = await api.get("/api/race"); drawLanes(); if (!RACE.running) { clearInterval(racePoll); racePoll = null; } }, 500);
  go(0);
})();
