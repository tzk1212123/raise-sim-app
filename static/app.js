// RAISE simulator dashboard — vanilla JS, no external libraries.
"use strict";

const $ = (s) => document.querySelector(s);
const api = {
  get: (u) => fetch(u).then(r => r.json()),
  post: (u, b) => fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) })
    .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || r.statusText); return j; }),
};
const NS = "http://www.w3.org/2000/svg";
function S(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function T(parent, x, y, text, attrs = {}) { const t = S("text", { x, y, "font-size": 12, fill: "#6b7385", ...attrs }, parent); t.textContent = text; return t; }
const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v)) ? "—" : Number(v).toFixed(d);

// cividis-like colour map over the contact-angle range of the task
const CA_MIN = 57, CA_MAX = 81;
const STOPS = [[0, [0, 34, 78]], [0.25, [62, 74, 107]], [0.5, [124, 123, 120]], [0.75, [190, 175, 111]], [1, [254, 232, 56]]];
function caColor(a) {
  if (a === null || a === undefined) return "#ccd1da";
  let x = Math.max(0, Math.min(1, (a - CA_MIN) / (CA_MAX - CA_MIN)));
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [x0, c0] = STOPS[i - 1], [x1, c1] = STOPS[i], f = (x - x0) / (x1 - x0);
      return `rgb(${c0.map((c, k) => Math.round(c + f * (c1[k] - c))).join(",")})`;
    }
  }
  return "rgb(254,232,56)";
}
const tip = $("#tooltip");
function showTip(ev, text) { tip.style.display = "block"; tip.textContent = text; tip.style.left = (ev.clientX + 14) + "px"; tip.style.top = (ev.clientY + 12) + "px"; }
function hideTip() { tip.style.display = "none"; }

let META = null, TRUTH = null, STATE = null, CAMP = null;
const WINDOW = [70.39, 73.61];

// ---------------------------------------------------------------- tabs
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("active", x === b));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.id === "tab-" + b.dataset.tab));
  if (b.dataset.tab === "surface") drawSurfaceTab();
  if (b.dataset.tab === "bench") loadBench();
});

// ---------------------------------------------------------------- init
async function init() {
  META = await api.get("/api/meta");
  const sv = []; for (let i = 1; i <= 15; i++) sv.push((0.04 * i).toFixed(2));
  const tv = []; for (let i = 1; i <= 30; i++) tv.push((0.04 * i).toFixed(2));
  $("#in-sds").innerHTML = sv.map(v => `<option ${v === "0.08" ? "selected" : ""}>${v}</option>`).join("");
  $("#in-tween").innerHTML = tv.map(v => `<option ${v === "0.20" ? "selected" : ""}>${v}</option>`).join("");
  $("#rig-surface").innerHTML = META.surfaces.map(s => `<option>${s}</option>`).join("");
  $("#c-planner").innerHTML = Object.keys(META.planners).map(p =>
    `<option value="${p}" ${META.available[p] ? "" : "disabled"}>${p}${META.available[p] ? "" : " (no API key)"}</option>`).join("");
  $("#c-planner").value = "bo_angle";
  $("#c-planner").onchange = () => $("#c-desc").textContent = META.planners[$("#c-planner").value];
  $("#c-desc").textContent = META.planners["bo_angle"];
  $("#devices").innerHTML = META.devices.map(d => `<div class="dev"><b>${d.name}</b> <span class="muted">${d.device_class}</span><br>${d.description}
    <div class="muted">${d.tags.map(t => "• " + t).join("<br>")}</div>
    <div>${d.channels.map(c => `<code>${c.name}${c.limits ? ` [${c.limits.min}–${c.limits.max} ${c.unit}]` : ""}</code>`).join(" ")}</div></div>`).join("");
  await refresh();
  TRUTH = await api.get("/api/truth");
  drawSurfaceTab();
  CAMP = await api.get("/api/campaign");          // survive page reloads mid-presentation
  if (CAMP.history) renderCampaign(CAMP);
  if (CAMP.state === "running") startPoll();
  setInterval(refresh, 1500);
}

async function refresh() {
  STATE = await api.get("/api/state");
  drawDeck(STATE.deck);
  if (document.querySelector("#tab-surface").classList.contains("active")) drawSurfaceTab();
}

// ---------------------------------------------------------------- rig controls
$("#rig-reset").onclick = async () => {
  try {
    await api.post("/api/reset", { surface: $("#rig-surface").value, seed: +$("#rig-seed").value, noise_scale: +$("#rig-noise").value });
    TRUTH = await api.get("/api/truth");
    $("#run-result").className = "result empty"; $("#run-result").textContent = "New rig ready.";
    $("#steps").innerHTML = "";
    await refresh(); drawSurfaceTab();
  } catch (e) { alert(e.message); }
};

// ---------------------------------------------------------------- deck drawing
function drawDeck(d) {
  const svg = $("#deck"); svg.innerHTML = "";
  $("#deck-clock").textContent = `sim clock ${(d.clock_s / 60).toFixed(1)} min · manual resets ${d.manual_resets} · ${d.env.temperature_C.toFixed(1)} °C, ${d.env.humidity_pct.toFixed(0)} % RH`;
  // stages: stepped levels
  for (let st = 0; st < d.stages; st++) {
    const x0 = 20 + st * 250, y0 = 30;
    T(svg, x0, y0 - 10, `Imaging stage ${st + 1}`, { "font-weight": 600, fill: "#1d2433" });
    for (let lv = 0; lv < d.levels; lv++) {
      const y = y0 + lv * 34, indent = lv * 6;
      S("rect", { x: x0 + indent, y, width: 230 - indent, height: 28, rx: 5, fill: "#eef1f6", stroke: "#dde2ea" }, svg);
      T(svg, x0 + indent + 4, y + 18, "L" + "ABCDE"[lv], { "font-size": 10 });
      for (let p = 0; p < d.positions; p++) {
        const sp = d.spots.find(s => s.stage === st && s.level === lv && s.pos === p);
        const cx = x0 + indent + 30 + p * ((200 - indent) / d.positions), cy = y + 14;
        const c = S("circle", { cx, cy, r: 8, fill: sp.used ? (sp.angle === null ? "#f4c0c8" : caColor(sp.angle)) : "#fff",
          stroke: sp.used ? "#5b6477" : "#c5cbd6", "stroke-width": 1 }, svg);
        if (sp.used) {
          c.onmousemove = (ev) => showTip(ev, sp.angle === null ? "detection failed" : `measured ${sp.angle.toFixed(2)}°`);
          c.onmouseleave = hideTip;
        }
      }
    }
  }
  // plate
  const px = 20, py = 230;
  T(svg, px, py - 8, "96-well mixing plate", { "font-weight": 600, fill: "#1d2433" });
  S("rect", { x: px, y: py, width: 300, height: 205, rx: 10, fill: "#f7f8fb", stroke: "#dde2ea" }, svg);
  d.wells.forEach((w, i) => {
    const r = Math.floor(i / 12), c = i % 12;
    const cx = px + 22 + c * 23.5, cy = py + 20 + r * 23.5;
    const e = S("circle", { cx, cy, r: 9, fill: w ? (w.mixed ? "#9cc0f5" : "#cfe0fb") : "#fff", stroke: "#b9c2d2" }, svg);
    if (w) { e.onmousemove = (ev) => showTip(ev, `well ${i}\nSDS ${w.sds}%  Tween ${w.tween}%\n${w.total} µL left`); e.onmouseleave = hideTip; }
  });
  // gauges
  const gx = 360, gy = 230;
  T(svg, gx, gy - 8, "Consumables & stocks", { "font-weight": 600, fill: "#1d2433" });
  const gauges = [
    ["P20 tips", d.tips.p20, d.tips_total.p20, "#7b4fd6"], ["P300 tips", d.tips.p300, d.tips_total.p300, "#7b4fd6"],
    ["free droplet spots", d.spots.filter(s => !s.used).length, d.spots.length, "#2f6fde"],
    ["SDS stock (µL)", d.stocks.sds, d.stocks_total.sds, "#e5862a"], ["Tween stock (µL)", d.stocks.tween, d.stocks_total.tween, "#e5862a"],
    ["water (µL)", d.stocks.water, d.stocks_total.water, "#3aa6c9"],
  ];
  gauges.forEach(([name, v, tot, col], k) => {
    const y = gy + 6 + k * 33;
    T(svg, gx, y + 10, name, { "font-size": 12 });
    S("rect", { x: gx + 140, y, width: 220, height: 14, rx: 7, fill: "#eef1f6" }, svg);
    S("rect", { x: gx + 140, y, width: Math.max(0, 220 * v / tot), height: 14, rx: 7, fill: col }, svg);
    T(svg, gx + 368, y + 11, `${Math.round(v)}`, { "font-size": 11 });
  });
  T(svg, 520, 30, d.camera_attached ? "📷 camera on gantry" : "📷 camera in base holder", { "font-size": 12, "text-anchor": "start", x: 545 });
  $("#deck-legend").innerHTML = `<span><span class="swatch" style="background:#fff;border:1px solid #c5cbd6"></span>free spot</span>
    <span><span class="swatch" style="background:${caColor(60)}"></span>~60°</span><span><span class="swatch" style="background:${caColor(72)}"></span>~72°</span>
    <span><span class="swatch" style="background:${caColor(78)}"></span>~78°</span><span><span class="swatch" style="background:#f4c0c8"></span>failed detection</span>
    <span>· a batch holds 90 droplets = 30 formulations, then a <b>manual</b> reset</span>`;
}

// ---------------------------------------------------------------- droplet sketch
function dropletSVG(angle) {
  const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 120 60");
  S("line", { x1: 4, y1: 52, x2: 116, y2: 52, stroke: "#8a93a6", "stroke-width": 2 }, svg);
  if (angle === null) { T(svg, 60, 36, "no contour", { "text-anchor": "middle", fill: "#d1435b" }); return svg; }
  const th = angle * Math.PI / 180, a = 34, R = a / Math.sin(th);
  const large = angle > 90 ? 1 : 0;
  S("path", { d: `M ${60 - a} 52 A ${R} ${R} 0 ${large} 1 ${60 + a} 52 Z`, fill: "rgba(47,111,222,.25)", stroke: "#2f6fde", "stroke-width": 1.5 }, svg);
  // tangent line at the right contact point
  const L = 22;
  S("line", { x1: 60 + a, y1: 52, x2: 60 + a - L * Math.cos(th), y2: 52 - L * Math.sin(th), stroke: "#e5862a", "stroke-width": 1.5 }, svg);
  return svg;
}

// ---------------------------------------------------------------- run one formulation
$("#btn-run").onclick = async () => {
  const b = $("#btn-run"); b.disabled = true;
  try {
    const out = await api.post("/api/run", { sds: +$("#in-sds").value, tween: +$("#in-tween").value });
    renderRun(out.record); renderSteps(out.steps); await refresh();
  } catch (e) { alert(e.message); }
  b.disabled = false;
};
function renderRun(r) {
  const box = $("#run-result"); box.className = "result";
  if (r.contact_angle_mean === null && !r.droplets) { box.innerHTML = `<span class="badge out">${r.status}</span> ${r.error || ""}`; return; }
  const inw = r.contact_angle_mean !== null && r.contact_angle_mean >= WINDOW[0] && r.contact_angle_mean <= WINDOW[1];
  box.innerHTML = `<div class="row" style="align-items:center"><div class="big">${fmt(r.contact_angle_mean)}°</div>
      <div class="muted">± ${fmt(r.contact_angle_sd)}° (n=${r.n_valid})<br>run #${r.run_id} · ${r.status}</div>
      <span class="badge ${inw ? "in" : "out"}">${inw ? "inside 72 ± 1.6° window" : "outside window"}</span></div>
    <div class="droplets" id="drops"></div>
    <div class="kv"><b>desirability D</b><span>${fmt(r.desirability, 3)}</span>
      <b>total surfactant</b><span>${fmt(r.total_wv_pct)} % w/v</span>
      <b>delivered (pipetting error)</b><span>SDS ${fmt(r.actual_wv_pct.sds, 4)} %, Tween ${fmt(r.actual_wv_pct.tween, 4)} %</span>
      <b>volumes</b><span>water ${r.volumes_uL.water} µL · SDS stock ${r.volumes_uL.sds} µL · Tween stock ${r.volumes_uL.tween} µL</span>
      <b>duration</b><span>${fmt(r.duration_s / 60, 1)} min simulated</span></div>`;
  const dr = $("#drops");
  r.droplets.forEach(d => {
    const div = document.createElement("div"); div.className = "droplet";
    div.appendChild(dropletSVG(d.angle_deg));
    div.insertAdjacentHTML("beforeend", `<div class="a">${d.angle_deg === null ? "failed" : d.angle_deg.toFixed(2) + "°"}</div>
      <div class="muted">stage ${d.stage + 1} · L${"ABCDE"[d.level]} · pos ${d.position + 1}${d.retries ? " · retried" : ""}</div>`);
    dr.appendChild(div);
  });
}
function renderSteps(steps) {
  $("#steps").innerHTML = steps.map(s => {
    let a = s.args; if (a && typeof a === "object") a = Object.entries(a).map(([k, v]) => `${k}=${v}`).join(" "); else if (a === null || a === undefined) a = "";
    return `<div><span class="t">${(s.t / 60).toFixed(2)} min</span><span class="d">${s.device}</span><span>${s.action} ${a}${s.result !== null && s.result !== undefined ? " → " + (typeof s.result === "number" ? s.result.toFixed ? s.result.toFixed(2) : s.result : s.result) : ""}</span></div>`;
  }).join("");
}

// ---------------------------------------------------------------- formulation map (shared)
const MAP = { x0: 70, x1: 790, y0: 20, y1: 410 };
function cellXY(s, t) {
  const cw = (MAP.x1 - MAP.x0) / 30, ch = (MAP.y1 - MAP.y0) / 15;
  const i = Math.round(t / 0.04) - 1, j = Math.round(s / 0.04) - 1;
  return { x: MAP.x0 + i * cw, y: MAP.y1 - (j + 1) * ch, w: cw, h: ch, cx: MAP.x0 + (i + .5) * cw, cy: MAP.y1 - (j + .5) * ch };
}
function drawMap(svg, { reveal, points = [], path = false, onHover }) {
  svg.innerHTML = "";
  if (!TRUTH) return;
  TRUTH.cells.forEach(c => {
    const g = cellXY(c.sds, c.tween);
    const r = S("rect", { x: g.x, y: g.y, width: g.w - 1, height: g.h - 1, fill: reveal ? caColor(c.theta) : "#eef1f6",
      stroke: reveal && c.good ? "#ffffff" : "none", "stroke-width": reveal && c.good ? 2 : 0 }, svg);
    r.onmousemove = (ev) => { showTip(ev, `SDS ${c.sds.toFixed(2)}  Tween ${c.tween.toFixed(2)}  (total ${(c.sds + c.tween).toFixed(2)})` + (reveal ? `\ntrue angle ${c.theta.toFixed(2)}°   D ${c.D.toFixed(3)}` : "")); if (onHover) onHover(c); };
    r.onmouseleave = hideTip;
  });
  if (reveal) { const b = cellXY(TRUTH.best[0], TRUTH.best[1]); T(svg, b.cx, b.cy + 5, "★", { "text-anchor": "middle", "font-size": 16, fill: "#d1435b" }); }
  // axes
  for (let i = 0; i <= 30; i += 5) { const t = i === 0 ? 0.04 : 0.04 * i; const g = cellXY(0.04, t); T(svg, g.cx, MAP.y1 + 16, t.toFixed(2), { "text-anchor": "middle" }); }
  for (let j = 1; j <= 15; j += 2) { const s = 0.04 * j; const g = cellXY(s, 0.04); T(svg, MAP.x0 - 8, g.cy + 4, s.toFixed(2), { "text-anchor": "end" }); }
  T(svg, (MAP.x0 + MAP.x1) / 2, MAP.y1 + 38, "Tween 20 (% w/v)", { "text-anchor": "middle", fill: "#1d2433" });
  const yl = T(svg, 18, (MAP.y0 + MAP.y1) / 2, "SDS 94% (% w/v)", { "text-anchor": "middle", fill: "#1d2433" });
  yl.setAttribute("transform", `rotate(-90 18 ${(MAP.y0 + MAP.y1) / 2})`);
  // path + points
  const pts = points.filter(p => p.sds && p.tween);
  if (path && pts.length > 1) {
    const d = pts.map((p, k) => { const g = cellXY(p.sds, p.tween); return (k ? "L" : "M") + g.cx + " " + g.cy; }).join(" ");
    S("path", { d, fill: "none", stroke: "rgba(29,36,51,.35)", "stroke-width": 1.4, "stroke-dasharray": "4 3" }, svg);
  }
  pts.forEach((p, k) => {
    const g = cellXY(p.sds, p.tween);
    const isInit = (p.tag || "").includes("init");
    const c = S("circle", { cx: g.cx, cy: g.cy, r: path ? 9 : 7, fill: p.angle === null ? "#fff" : caColor(p.angle),
      stroke: p.angle === null ? "#d1435b" : (isInit ? "#8a93a6" : "#1d2433"), "stroke-width": 1.6 }, svg);
    c.onmousemove = (ev) => showTip(ev, `run ${p.run_id} (${p.tag || ""})\nSDS ${p.sds}  Tween ${p.tween}\nmeasured ${p.angle === null ? "— (failed)" : p.angle.toFixed(2) + "° ± " + fmt(p.sd)}\nD ${fmt(p.D, 3)}`);
    c.onmouseleave = hideTip;
    if (path) T(svg, g.cx, g.cy + 3.5, String(k + 1), { "text-anchor": "middle", "font-size": 9, fill: p.angle !== null && p.angle > 70 ? "#1d2433" : "#fff", "pointer-events": "none" });
  });
}
function colorLegend(el) {
  const vals = [57, 60, 63, 66, 69, 72, 75, 78, 81];
  el.innerHTML = vals.map(v => `<span><span class="swatch" style="background:${caColor(v)}"></span>${v}°</span>`).join("") +
    `<span>· white outline = truly "good" cell (in window and D ≥ 0.90) · ★ best in-window cell · ○ grey ring = shared initial random run</span>`;
}

function drawSurfaceTab() {
  if (!TRUTH || !STATE) return;
  const reveal = $("#reveal").checked;
  drawMap($("#surface"), { reveal, points: STATE.history, onHover: (c) => {
    const inw = c.theta >= WINDOW[0] && c.theta <= WINDOW[1];
    $("#inspect").innerHTML = `<div class="kv"><b>SDS / Tween</b><span>${c.sds.toFixed(2)} / ${c.tween.toFixed(2)} % w/v (total ${(c.sds + c.tween).toFixed(2)})</span>` +
      (reveal ? `<b>true angle</b><span>${c.theta.toFixed(2)}° <span class="badge ${inw ? "in" : "out"}">${inw ? "in window" : "out"}</span></span><b>true D</b><span>${c.D.toFixed(3)}</span>`
              : `<b>true angle</b><span class="muted">hidden — tick “reveal”</span>`) + `</div>`;
  } });
  colorLegend($("#surface-legend"));
}
$("#reveal").onchange = drawSurfaceTab;

// ---------------------------------------------------------------- charts
function axes(svg, { xmax, ymin, ymax, xlabel, ylabel, yticks }) {
  const P = { l: 46, r: 12, t: 12, b: 36, w: 520, h: 260 };
  const X = (x) => P.l + (x - 0.5) / Math.max(1, xmax) * (P.w - P.l - P.r);
  const Y = (y) => P.h - P.b - (y - ymin) / (ymax - ymin) * (P.h - P.t - P.b);
  S("line", { x1: P.l, y1: P.h - P.b, x2: P.w - P.r, y2: P.h - P.b, stroke: "#c5cbd6" }, svg);
  S("line", { x1: P.l, y1: P.t, x2: P.l, y2: P.h - P.b, stroke: "#c5cbd6" }, svg);
  (yticks || []).forEach(v => { S("line", { x1: P.l, x2: P.w - P.r, y1: Y(v), y2: Y(v), stroke: "#f0f2f6" }, svg); T(svg, P.l - 6, Y(v) + 4, String(v), { "text-anchor": "end", "font-size": 11 }); });
  const step = xmax > 30 ? 10 : (xmax > 12 ? 5 : 1);
  for (let i = step; i <= xmax; i += step) T(svg, X(i), P.h - P.b + 16, String(i), { "text-anchor": "middle", "font-size": 11 });
  T(svg, (P.l + P.w) / 2, P.h - 4, xlabel, { "text-anchor": "middle", "font-size": 12 });
  const yl = T(svg, 12, (P.t + P.h - P.b) / 2, ylabel, { "text-anchor": "middle", "font-size": 12 });
  yl.setAttribute("transform", `rotate(-90 12 ${(P.t + P.h - P.b) / 2})`);
  return { X, Y, P };
}
function drawAngleChart(hist, budget) {
  const svg = $("#c-angle"); svg.innerHTML = "";
  const vals = hist.map(h => h.angle).filter(v => v !== null);
  const ymin = Math.min(58, ...vals) - 1, ymax = Math.max(80, ...vals) + 1;
  const { X, Y, P } = axes(svg, { xmax: budget, ymin, ymax, xlabel: "experiment #", ylabel: "contact angle (°)", yticks: [60, 65, 70, 75, 80].filter(v => v > ymin && v < ymax) });
  S("rect", { x: P.l, y: Y(WINDOW[1]), width: P.w - P.l - P.r, height: Y(WINDOW[0]) - Y(WINDOW[1]), fill: "rgba(31,157,107,.12)" }, svg);
  S("line", { x1: P.l, x2: P.w - P.r, y1: Y(72), y2: Y(72), stroke: "#1f9d6b", "stroke-dasharray": "4 3" }, svg);
  hist.forEach((h, k) => {
    if (h.angle === null) { T(svg, X(k + 1), Y(ymin + 1), "×", { "text-anchor": "middle", fill: "#d1435b", "font-size": 14 }); return; }
    if (h.sd) S("line", { x1: X(k + 1), x2: X(k + 1), y1: Y(h.angle - h.sd), y2: Y(h.angle + h.sd), stroke: "#8a93a6" }, svg);
    const init = (h.tag || "").includes("init");
    S("circle", { cx: X(k + 1), cy: Y(h.angle), r: 5, fill: init ? "#fff" : caColor(h.angle), stroke: init ? "#8a93a6" : "#1d2433" }, svg);
  });
}
function drawBestChart(hist, budget) {
  const svg = $("#c-best"); svg.innerHTML = "";
  const { X, Y } = axes(svg, { xmax: budget, ymin: 0.5, ymax: 1.0, xlabel: "experiment #", ylabel: "best D (in window)", yticks: [0.6, 0.7, 0.8, 0.9, 1.0] });
  let best = null, d = "";
  hist.forEach((h, k) => {
    if (h.angle !== null && h.angle >= WINDOW[0] && h.angle <= WINDOW[1] && (best === null || h.D > best)) best = h.D;
    if (best !== null) d += (d ? " L" : "M") + X(k + 1) + " " + Y(Math.max(0.5, best));
  });
  if (d) S("path", { d, fill: "none", stroke: "#2f6fde", "stroke-width": 2.5 }, svg);
  if (TRUTH) { S("line", { x1: X(0.5), x2: X(budget + 0.5), y1: Y(TRUTH.D_star), y2: Y(TRUTH.D_star), stroke: "#d1435b", "stroke-dasharray": "5 4" }, svg); T(svg, X(budget) , Y(TRUTH.D_star) - 6, "D* (true best)", { "text-anchor": "end", fill: "#d1435b", "font-size": 11 }); }
}

// ---------------------------------------------------------------- campaign
let poll = null;
$("#c-start").onclick = async () => {
  try {
    await api.post("/api/campaign", { planner: $("#c-planner").value, budget: +$("#c-budget").value, n_init: +$("#c-init").value,
      seed: +$("#c-seed").value, delay_s: +$("#c-delay").value, fresh_rig: true });
    TRUTH = await api.get("/api/truth");
    startPoll();
  } catch (e) { alert(e.message); }
};
$("#c-stop").onclick = () => api.post("/api/campaign/stop");
$("#c-reveal").onchange = () => CAMP && renderCampaign(CAMP);
function startPoll() { if (poll) clearInterval(poll); poll = setInterval(async () => { CAMP = await api.get("/api/campaign"); renderCampaign(CAMP); if (CAMP.state !== "running") { clearInterval(poll); poll = null; refresh(); } }, 500); }

function renderCampaign(c) {
  const st = $("#c-state"); st.textContent = c.state + (c.error ? ": " + c.error : ""); st.className = "pill " + c.state;
  const hist = c.history || [], budget = c.budget || hist.length || 10;
  drawMap($("#c-map"), { reveal: $("#c-reveal").checked, points: hist, path: true });
  if (c.recommendation) { const g = cellXY(c.recommendation[0], c.recommendation[1]); S("rect", { x: g.x - 2, y: g.y - 2, width: g.w + 3, height: g.h + 3, fill: "none", stroke: "#d1435b", "stroke-width": 3, rx: 3 }, $("#c-map")); }
  drawAngleChart(hist, budget); drawBestChart(hist, budget);
  // table
  let bestIdx = -1, bestD = -1;
  hist.forEach((h, k) => { if (h.angle !== null && h.angle >= WINDOW[0] && h.angle <= WINDOW[1] && h.D > bestD) { bestD = h.D; bestIdx = k; } });
  $("#c-table tbody").innerHTML = hist.map((h, k) => `<tr class="${(h.tag || "").includes("init") ? "init" : ""} ${k === bestIdx ? "best" : ""}"><td>${k + 1}</td><td>${h.tag}</td><td>${h.sds}</td><td>${h.tween}</td><td>${fmt(h.total)}</td>
    <td>${(h.droplets || []).map(v => v === null ? "×" : v.toFixed(1)).join(", ")}</td><td>${fmt(h.angle)} ± ${fmt(h.sd)}</td><td>${fmt(h.D, 3)}</td><td>${h.status}</td></tr>`).join("");
  // thoughts
  if (c.thoughts && c.thoughts.length) $("#c-thoughts").innerHTML = c.thoughts.slice().reverse().map(t => `<div class="t">${escapeHTML(t)}</div>`).join("") +
    (c.usage ? `<div class="muted">tokens: in ${c.usage.input_tokens} (cached ${c.usage.cache_read_input_tokens || 0}) · out ${c.usage.output_tokens} · turns ${c.usage.turns}</div>` : "");
  else if (!(c.planner || "").match(/llm|deepseek/)) $("#c-thoughts").innerHTML = `<span class="muted">${c.planner || "This planner"} does not write explanations.</span>`;
  // outcome
  const v = c.validation;
  if (c.recommendation) {
    const r = c.recommendation;
    $("#c-outcome").innerHTML = `<div class="muted">recommended formulation</div><div class="big">SDS ${r[0]} · Tween ${r[1]}</div>
      <div class="muted">total ${(r[0] + r[1]).toFixed(2)} % w/v · experiments used ${hist.length}/${budget}</div>` +
      (v ? `<div class="outcome-grid" style="margin-top:10px">
        <div class="stat"><div class="l">validated (5 fresh runs)</div><div class="v">${fmt(v.val_angle_mean)}°</div><span class="badge ${v.val_in_window ? "in" : "out"}">${v.val_in_window ? "in window" : "missed"}</span></div>
        <div class="stat"><div class="l">hidden true angle</div><div class="v">${fmt(v.true_theta)}°</div><span class="badge ${v.true_in_window ? "in" : "out"}">${v.true_in_window ? "in window" : "missed"}</span></div>
        <div class="stat"><div class="l">true D vs best possible D*</div><div class="v">${fmt(v.true_D, 3)}</div><span class="muted">D* = ${fmt(v.D_star, 3)} at ${v.best_in_window.join(" / ")}</span></div>
        <div class="stat"><div class="l">regret</div><div class="v">${fmt(v.regret, 3)}</div><span class="muted">first truly good point at #${v.first_truly_good_at ?? "—"}</span></div></div>` : `<p class="muted">validating…</p>`) +
      (c.notes && c.notes.final && c.notes.final.reasoning ? `<p class="muted" style="margin-top:10px"><b>agent's justification:</b> ${escapeHTML(c.notes.final.reasoning)}</p>` : "");
  } else if (c.state === "running") $("#c-outcome").innerHTML = `<span class="muted">running… ${hist.length}/${budget} experiments</span>`;
}
function escapeHTML(s) { return String(s).replace(/[&<>]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch])); }

// ---------------------------------------------------------------- benchmark
let BENCH = [];
async function loadBench() {
  BENCH = await api.get("/api/benchmarks");
  const sel = $("#b-select");
  if (!sel.options.length) { sel.innerHTML = BENCH.map((b, i) => `<option value="${i}">${b.name}</option>`).join(""); sel.onchange = drawBench; }
  drawBench();
}
function barChart(svg, rows, key, seKey, title, max, fmtD) {
  svg.innerHTML = "";
  T(svg, 10, 18, title, { fill: "#1d2433", "font-weight": 600, "font-size": 13 });
  const l = 150, w = 350, top = 32, bh = Math.min(26, (270 - top) / Math.max(1, rows.length) - 6);
  rows.forEach((r, k) => {
    const y = top + k * (bh + 6), v = r[key] ?? 0, se = r[seKey] ?? 0;
    T(svg, l - 8, y + bh * .7, `${r.planner} · ${r.budget}`, { "text-anchor": "end", "font-size": 12, fill: "#1d2433" });
    S("rect", { x: l, y, width: w, height: bh, fill: "#f3f5f9", rx: 4 }, svg);
    S("rect", { x: l, y, width: w * v / max, height: bh, fill: r.planner.match(/llm|deepseek/) ? "#7b4fd6" : "#2f6fde", rx: 4 }, svg);
    S("line", { x1: l + w * Math.max(0, v - se) / max, x2: l + w * Math.min(max, v + se) / max, y1: y + bh / 2, y2: y + bh / 2, stroke: "#1d2433" }, svg);
    T(svg, l + w + 6, y + bh * .7, fmtD(v), { "font-size": 11 });
  });
}
function drawBench() {
  const b = BENCH[+$("#b-select").value]; if (!b) return;
  const rows = b.summary.slice().sort((x, y) => x.budget - y.budget || (y.val_hit_rate - x.val_hit_rate));
  barChart($("#b-hit"), rows, "val_hit_rate", "val_hit_se", "Validated hit-rate (higher is better)", 1, v => v.toFixed(2));
  barChart($("#b-regret"), rows, "regret_mean", "regret_se", "Regret in true desirability (lower is better)", Math.max(0.5, ...rows.map(r => r.regret_mean + (r.regret_se || 0))), v => v.toFixed(3));
  const cols = [["planner", "planner"], ["budget", "budget"], ["n_campaigns", "n"], ["true_hit_rate", "true hit"], ["val_hit_rate", "validated hit"],
    ["regret_mean", "regret"], ["val_D_mean", "validated D"], ["found_good_frac", "found good pt"], ["median_first_good", "median 1st good"], ["sim_minutes_mean", "sim min"]];
  $("#b-table").innerHTML = `<thead><tr>${cols.map(c => `<th>${c[1]}</th>`).join("")}</tr></thead><tbody>` +
    rows.map(r => `<tr>${cols.map(([k]) => `<td>${typeof r[k] === "number" ? (Number.isInteger(r[k]) ? r[k] : r[k].toFixed(3)) : (r[k] ?? "—")}</td>`).join("")}</tr>`).join("") + "</tbody>";
}

init();
