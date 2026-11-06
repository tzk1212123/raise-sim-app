"use strict";
const $ = (s) => document.querySelector(s);
const NS = "http://www.w3.org/2000/svg";
function S(tag, a = {}, p) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (p) p.appendChild(e); return e; }
function T(p, x, y, t, a = {}) { const e = S("text", { x, y, "font-size": 12, fill: "#8a8780", ...a }, p); e.textContent = t; return e; }
const STOPS = [[0, [0, 34, 78]], [0.25, [62, 74, 107]], [0.5, [124, 123, 120]], [0.75, [190, 175, 111]], [1, [254, 232, 56]]];
function caColor(a) {
  let x = Math.max(0, Math.min(1, (a - 58) / 22));
  for (let i = 1; i < STOPS.length; i++) if (x <= STOPS[i][0]) {
    const [x0, c0] = STOPS[i - 1], [x1, c1] = STOPS[i], f = (x - x0) / (x1 - x0);
    return `rgb(${c0.map((c, k) => Math.round(c + f * (c1[k] - c))).join(",")})`;
  }
  return "rgb(254,232,56)";
}

// drop illustrations
document.querySelectorAll(".dropcard svg").forEach(svg => {
  const ang = +svg.dataset.angle, W = 220, base = 96, a = 58, th = ang * Math.PI / 180, R = a / Math.sin(th);
  S("rect", { x: 14, y: base, width: W - 28, height: 8, rx: 2, fill: "#c9ced8" }, svg);
  S("path", { d: `M ${W / 2 - a} ${base} A ${R} ${R} 0 ${ang > 90 ? 1 : 0} 1 ${W / 2 + a} ${base} Z`, fill: "rgba(47,111,222,.22)", stroke: "#2f6fde", "stroke-width": 2.5 }, svg);
  const x = W / 2 + a, L = 40;
  S("line", { x1: x, y1: base, x2: x - L * Math.cos(th), y2: base - L * Math.sin(th), stroke: "#e5862a", "stroke-width": 2.5 }, svg);
  S("line", { x1: x, y1: base, x2: x - L, y2: base, stroke: "#e5862a", "stroke-width": 2.5 }, svg);
});

// recipe pickers
const sv = [], tv = [];
for (let i = 1; i <= 15; i++) sv.push((0.04 * i).toFixed(2));
for (let i = 1; i <= 30; i++) tv.push((0.04 * i).toFixed(2));
$("#a-sds").innerHTML = sv.map(v => `<option ${v === "0.08" ? "selected" : ""}>${v}</option>`).join("");
$("#a-tween").innerHTML = tv.map(v => `<option ${v === "0.04" ? "selected" : ""}>${v}</option>`).join("");
$("#a-run").onclick = async () => {
  const b = $("#a-run"); b.disabled = true;
  try {
    const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sds: +$("#a-sds").value, tween: +$("#a-tween").value }) });
    const out = await r.json();
    if (!r.ok) throw new Error(out.detail || r.statusText);
    await RobotAnim.play($("#a-anim"), out.steps, out.record, { caption: $("#a-cap"), speed: 1 });
  } catch (e) { $("#a-cap").textContent = "could not run: " + e.message; }
  b.disabled = false;
};

// hidden true surface
(async () => {
  const TR = await (await fetch("/api/truth")).json();
  const svg = $("#a-truth"), box = { x0: 40, x1: 510, y0: 8, y1: 262 };
  const cw = (box.x1 - box.x0) / 30, ch = (box.y1 - box.y0) / 15;
  const cell = (s, t) => ({ x: box.x0 + (Math.round(t / .04) - 1) * cw, y: box.y1 - Math.round(s / .04) * ch });
  TR.cells.forEach(c => { const g = cell(c.sds, c.tween);
    S("rect", { x: g.x + .5, y: g.y + .5, width: cw - 1, height: ch - 1, fill: caColor(c.theta), stroke: c.good ? "#fff" : "none", "stroke-width": 1.6 }, svg); });
  const b = cell(TR.best[0], TR.best[1]); T(svg, b.x + cw / 2, b.y + ch / 2 + 5, "★", { "text-anchor": "middle", fill: "#c2384f", "font-size": 14 });
  T(svg, (box.x0 + box.x1) / 2, 290, "Tween 20 (% w/v) → 1.20", { "text-anchor": "middle", fill: "#141414" });
  const y = T(svg, 14, (box.y0 + box.y1) / 2, "SDS 94% (% w/v) → 0.60", { "text-anchor": "middle", fill: "#141414" });
  y.setAttribute("transform", `rotate(-90 14 ${(box.y0 + box.y1) / 2})`);
  [60, 66, 72, 78].forEach((v, k) => { S("rect", { x: 330 + k * 46, y: 270, width: 12, height: 10, fill: caColor(v) }, svg); T(svg, 345 + k * 46, 279, v + "°", { "font-size": 11 }); });
})();
