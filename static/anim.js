// RobotAnim: animate one experiment from the real device-action log returned by /api/run.
// The scene is a simplified top view of the OT-2 deck; every pipette move, transfer, mix,
// droplet, camera move and capture in the log is replayed in order.
"use strict";
const RobotAnim = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, a = {}, p) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (p) p.appendChild(e); return e; };
  const txt = (p, x, y, t, a = {}) => { const e = el("text", { x, y, "font-size": 11, fill: "#55524c", ...a }, p); e.textContent = t; return e; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const LIQ = { water: "#7cc0ea", sds: "#f0a64a", tween: "#a98be0" };
  const NAMES = { water: "water", sds: "SDS stock", tween: "Tween stock" };

  function layout() {
    return {
      bottles: { water: [50, 70], sds: [50, 140], tween: [50, 210] },
      tips: { p300: [140, 270], p20: [210, 270] },
      trash: [50, 300],
      plate: { x0: 120, y0: 40, dx: 16, dy: 16 },            // 12 x 8 wells
      stage: { x0: 345, y0: 40, dx: 15, dy: 22, gap: 130 },  // per stage: 5 levels x 9 positions
      camBase: [290, 300],
      photos: { x0: 330, y0: 262, w: 98, h: 88 },
    };
  }

  function wellXY(L, i) { const r = Math.floor(i / 12), c = i % 12; return [L.plate.x0 + c * L.plate.dx, L.plate.y0 + r * L.plate.dy]; }
  function spotXY(L, st, lv, pos) { return [L.stage.x0 + st * L.stage.gap + pos * L.stage.dx + lv * 2, L.stage.y0 + lv * L.stage.dy]; }

  function drawScene(svg, L, spotsUsedBefore) {
    svg.innerHTML = "";
    el("rect", { x: 0, y: 0, width: 640, height: 380, fill: "#fbfaf7", rx: 10 }, svg);
    // bottles
    for (const [k, [x, y]] of Object.entries(L.bottles)) {
      el("rect", { x: x - 18, y: y - 22, width: 36, height: 44, rx: 8, fill: LIQ[k], opacity: .85, stroke: "#55524c" }, svg);
      txt(svg, x, y + 36, NAMES[k], { "text-anchor": "middle" });
    }
    // tip racks
    for (const [k, [x, y]] of Object.entries(L.tips)) {
      el("rect", { x: x - 28, y: y - 18, width: 56, height: 36, rx: 5, fill: "#efede8", stroke: "#c9c5bc" }, svg);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) el("circle", { cx: x - 20 + i * 8, cy: y - 9 + j * 9, r: 2.4, fill: "#d9d4c9" }, svg);
      txt(svg, x, y + 30, k.toUpperCase() + " tips", { "text-anchor": "middle" });
    }
    el("rect", { x: L.trash[0] - 20, y: L.trash[1] - 16, width: 40, height: 32, rx: 4, fill: "#e8e4dc", stroke: "#c9c5bc" }, svg);
    txt(svg, L.trash[0], L.trash[1] + 28, "trash", { "text-anchor": "middle" });
    // plate
    el("rect", { x: L.plate.x0 - 12, y: L.plate.y0 - 12, width: 12 * L.plate.dx + 8, height: 8 * L.plate.dy + 8, rx: 8, fill: "#f3f1ec", stroke: "#c9c5bc" }, svg);
    txt(svg, L.plate.x0 - 12, L.plate.y0 - 18, "96-well mixing plate");
    const wells = [];
    for (let i = 0; i < 96; i++) { const [x, y] = wellXY(L, i); wells.push(el("circle", { cx: x, cy: y, r: 6, fill: "#fff", stroke: "#c9c5bc" }, svg)); }
    // stage
    for (let st = 0; st < 2; st++) {
      const x0 = L.stage.x0 + st * L.stage.gap - 10;
      txt(svg, x0, L.stage.y0 - 18, `imaging stage ${st + 1}`);
      for (let lv = 0; lv < 5; lv++) {
        el("rect", { x: x0 + lv * 2, y: L.stage.y0 + lv * L.stage.dy - 9, width: 9 * L.stage.dx + 6, height: 18, rx: 4, fill: "#ecebe6", stroke: "#d6d2c8" }, svg);
      }
    }
    const spots = {};
    for (let st = 0; st < 2; st++) for (let lv = 0; lv < 5; lv++) for (let p = 0; p < 9; p++) {
      const [x, y] = spotXY(L, st, lv, p);
      const idx = st * 45 + lv * 9 + p;
      spots[`${st},${lv},${p}`] = el("circle", { cx: x, cy: y, r: 4.5, fill: idx < spotsUsedBefore ? "#c9c5bc" : "#fff", stroke: "#c9c5bc" }, svg);
    }
    // camera base
    el("rect", { x: L.camBase[0] - 24, y: L.camBase[1] - 16, width: 48, height: 32, rx: 6, fill: "#e9e6df", stroke: "#c9c5bc" }, svg);
    txt(svg, L.camBase[0], L.camBase[1] + 28, "camera holder", { "text-anchor": "middle" });
    const camIcon = el("g", {}, svg);
    el("rect", { x: L.camBase[0] - 12, y: L.camBase[1] - 8, width: 24, height: 16, rx: 3, fill: "#2b2b2b" }, camIcon);
    el("circle", { cx: L.camBase[0], cy: L.camBase[1], r: 5, fill: "#7fb3ff" }, camIcon);
    // photo strip
    txt(svg, L.photos.x0, L.photos.y0 - 6, "camera images (side view)");
    const photos = [];
    for (let k = 0; k < 3; k++) {
      const g = el("g", { transform: `translate(${L.photos.x0 + k * (L.photos.w + 6)},${L.photos.y0})` }, svg);
      el("rect", { x: 0, y: 0, width: L.photos.w, height: L.photos.h, rx: 6, fill: "#151515" }, g);
      photos.push(g);
    }
    // pipette head (drawn last = on top)
    const head = el("g", { transform: "translate(300,200)" }, svg);
    el("rect", { x: -13, y: -30, width: 26, height: 20, rx: 5, fill: "#141414" }, head);
    el("rect", { x: -3, y: -12, width: 6, height: 8, fill: "#141414" }, head);
    const tip = el("path", { d: "M -3 -4 L 3 -4 L 1 10 L -1 10 Z", fill: "#e2ddd2", stroke: "#8a8780", "stroke-width": .8, opacity: 0 }, head);
    const tipLiquid = el("path", { d: "M -2.2 1 L 2.2 1 L 1 9 L -1 9 Z", fill: "#7cc0ea", opacity: 0 }, head);
    const headCam = el("g", { opacity: 0 }, head);
    el("rect", { x: -12, y: -4, width: 24, height: 16, rx: 3, fill: "#2b2b2b" }, headCam);
    el("circle", { cx: 0, cy: 4, r: 5, fill: "#7fb3ff" }, headCam);
    const flash = el("circle", { cx: 0, cy: 0, r: 0, fill: "#fff", opacity: 0 }, svg);
    const clock = txt(svg, 626, 372, "", { "text-anchor": "end", "font-size": 12, fill: "#141414", "font-weight": 600 });
    return { wells, spots, camIcon, photos, head, tip, tipLiquid, headCam, flash, clock, pos: [300, 200] };
  }

  async function move(S, to, ms) {
    const [x0, y0] = S.pos, [x1, y1] = to, t0 = performance.now();
    await new Promise(res => {
      const step = (now) => {
        const u = Math.min(1, (now - t0) / ms), e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        S.head.setAttribute("transform", `translate(${x0 + (x1 - x0) * e},${y0 + (y1 - y0) * e})`);
        u < 1 ? requestAnimationFrame(step) : res();
      };
      requestAnimationFrame(step);
    });
    S.pos = [x1, y1];
  }

  function mixColor(vol) {
    const tot = Object.values(vol).reduce((a, b) => a + b, 0) || 1;
    const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const c = [0, 0, 0];
    for (const [k, v] of Object.entries(vol)) { const q = rgb(LIQ[k]); for (let i = 0; i < 3; i++) c[i] += q[i] * v / tot; }
    return `rgb(${c.map(Math.round).join(",")})`;
  }

  function drawPhoto(g, angle, L) {
    const W = L.photos.w, H = L.photos.h, base = H - 26, a = 26;
    el("rect", { x: 8, y: base, width: W - 16, height: 5, fill: "#4b5563" }, g);
    if (angle === null || angle === undefined) { txt(g, W / 2, base - 16, "no contour", { "text-anchor": "middle", fill: "#f87171" }); return; }
    const th = angle * Math.PI / 180, R = a / Math.sin(th);
    el("path", { d: `M ${W / 2 - a} ${base} A ${R} ${R} 0 ${angle > 90 ? 1 : 0} 1 ${W / 2 + a} ${base} Z`, fill: "rgba(147,197,253,.55)", stroke: "#93c5fd", "stroke-width": 1.5 }, g);
    const x = W / 2 + a, Lt = 18;
    el("line", { x1: x, y1: base, x2: x - Lt * Math.cos(th), y2: base - Lt * Math.sin(th), stroke: "#fbbf24", "stroke-width": 1.5 }, g);
    txt(g, W / 2, H - 8, angle.toFixed(1) + "°", { "text-anchor": "middle", fill: "#f9fafb", "font-size": 13, "font-weight": 700 });
  }

  async function play(svg, steps, record, opts = {}) {
    const L = layout(), sp = opts.speed || 1, cap = opts.caption;
    const D = (ms) => ms / sp;
    const firstSpot = record.droplets && record.droplets.length ? (record.droplets[0].stage * 45 + record.droplets[0].level * 9 + record.droplets[0].position) : 0;
    const S = drawScene(svg, L, firstSpot);
    const say = (t) => { if (cap) cap.textContent = t; };
    const wellVol = {};
    let photoIdx = 0, tipOn = null, camOn = false, lastT = 0;
    const setClock = (t) => { S.clock.textContent = `robot clock +${((t - steps[0].t) / 60 + 0).toFixed(1)} min`; };
    for (const s of steps) {
      if (s.device === "env" || s.device === "deck") continue;
      setClock(s.t); lastT = s.t;
      const a = s.args || {};
      if (s.action.startsWith("pick_tip_")) {
        const p = s.action.slice(-3) === "p20" ? "p20" : "p300";
        say(`pick up a fresh ${p.toUpperCase()} tip`);
        await move(S, L.tips[p], D(420)); S.tip.setAttribute("opacity", 1); tipOn = p; await sleep(D(120));
      } else if (s.action.startsWith("drop_tip_")) {
        say("discard the used tip");
        await move(S, L.trash, D(380)); S.tip.setAttribute("opacity", 0); S.tipLiquid.setAttribute("opacity", 0); tipOn = null; await sleep(D(80));
      } else if (s.action.startsWith("transfer_")) {
        const src = a.source, w = +a.dest_well;
        say(`aspirate ${a.volume_uL} µL ${NAMES[src] || src}`);
        await move(S, L.bottles[src], D(420));
        S.tipLiquid.setAttribute("fill", LIQ[src]); S.tipLiquid.setAttribute("opacity", 1); await sleep(D(250));
        say(`dispense ${a.volume_uL} µL into well ${w + 1}`);
        await move(S, wellXY(L, w), D(420));
        S.tipLiquid.setAttribute("opacity", 0);
        wellVol[src] = (wellVol[src] || 0) + (+a.volume_uL || 0);
        S.wells[w].setAttribute("fill", mixColor(wellVol)); S.wells[w].setAttribute("stroke", "#55524c");
        await sleep(D(200));
      } else if (s.action === "mix_p300") {
        const w = +a.well;
        say(`mix ${a.cycles}× by pipetting ${a.volume_uL} µL up and down`);
        await move(S, wellXY(L, w), D(300));
        const [x, y] = wellXY(L, w);
        for (let k = 0; k < 4; k++) { await move(S, [x, y - 6], D(110)); await move(S, [x, y], D(110)); }
      } else if (s.action === "deposit_droplet_p20") {
        const key = `${a.stage},${a.level},${a.position}`;
        say(`place a ${a.volume_uL} µL droplet on stage ${+a.stage + 1}, level ${"ABCDE"[a.level]}, spot ${+a.position + 1}`);
        if (S.tipLiquid.getAttribute("opacity") === "0") { await move(S, wellXY(L, +a.well), D(320)); S.tipLiquid.setAttribute("fill", mixColor(wellVol)); S.tipLiquid.setAttribute("opacity", 1); }
        await move(S, spotXY(L, +a.stage, +a.level, +a.position), D(380));
        S.spots[key].setAttribute("fill", mixColor(wellVol)); S.spots[key].setAttribute("stroke", "#55524c"); await sleep(D(160));
      } else if (s.action === "pick_camera") {
        say("pick up the camera with the pipette mount");
        await move(S, L.camBase, D(420)); S.camIcon.setAttribute("opacity", 0); S.headCam.setAttribute("opacity", 1); camOn = true; await sleep(D(150));
      } else if (s.action === "move_camera") {
        say(`move the camera beside droplet on stage ${+a.stage + 1}, level ${"ABCDE"[a.level]}`);
        await move(S, spotXY(L, +a.stage, +a.level, +a.position), D(380));
      } else if (s.action === "wait") {
        say(+s.args > 6 ? `wait ${s.args} s for the droplet to settle` : `detection failed: wait ${s.args} s and retry`);
        await sleep(D(+s.args > 6 ? 600 : 400));
      } else if (s.device === "camera-1" && s.action === "capture") {
        const d = (record.droplets || [])[photoIdx];
        say("capture an image and fit the droplet contour");
        const [x, y] = S.pos;
        S.flash.setAttribute("cx", x); S.flash.setAttribute("cy", y); S.flash.setAttribute("r", 22); S.flash.setAttribute("opacity", .9);
        await sleep(D(120)); S.flash.setAttribute("opacity", 0);
        // a failed detection is followed by a retry; draw the photo only on the last capture for this droplet
        const next = steps[steps.indexOf(s) + 1];
        const retrying = next && next.action === "wait" && +next.args < 6;
        if (!retrying && d) { drawPhoto(S.photos[photoIdx], d.angle_deg, L); photoIdx++; }
        await sleep(D(220));
      } else if (s.action === "return_camera") {
        say("return the camera to its holder");
        await move(S, L.camBase, D(420)); S.headCam.setAttribute("opacity", 0); S.camIcon.setAttribute("opacity", 1); camOn = false;
      }
    }
    const m = record.contact_angle_mean;
    say(m === null || m === undefined ? `done · no valid measurement (${record.status})` :
      `done · mean ${m.toFixed(2)}° ± ${record.contact_angle_sd ?? "–"}° · ${(record.duration_s / 60).toFixed(1)} min of robot time`);
    await move(S, [300, 200], D(400));
  }

  return { play };
})();
