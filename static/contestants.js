// Shared contestant picker (comparison + study pages).
// Fills the page-level NAME / COLOR / ORDER maps from /api/meta and renders
// grouped checkboxes plus an "add any model" row (provider + model id).
"use strict";

function _hashColor(s) {
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h},55%,45%)`;
}

function setupContestants(meta, el, defaults, onChange) {
  for (const c of meta.contestants || []) {
    NAME[c.id] = c.label; COLOR[c.id] = c.color;
    if (!ORDER.includes(c.id)) ORDER.push(c.id);
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const row = (c, checked) => `<label class="${c.available ? "" : "na"}" title="${esc(c.desc)}${c.model ? " · model " + esc(c.model) : ""}">
      <input type="checkbox" value="${esc(c.id)}" ${checked && c.available ? "checked" : ""} ${c.available ? "" : "disabled"}>
      <span class="dot" style="background:${c.color}"></span><span>${esc(c.label)}
      ${c.kind === "llm" ? `<small class="model">${c.available ? esc(c.model || "") : "set " + esc(c.key_env)}</small>` : ""}</span></label>`;
  const base = (meta.contestants || []).filter(c => c.kind === "baseline");
  const llms = (meta.contestants || []).filter(c => c.kind === "llm");
  const okLLM = llms.filter(c => c.available), noLLM = llms.filter(c => !c.available);
  const provs = Object.entries(meta.providers || {});
  el.innerHTML = `<div class="cg-h">Baselines</div>${base.map(c => row(c, defaults.has(c.id))).join("")}
    <div class="cg-h">LLM scientists</div>${okLLM.map(c => row(c, defaults.has(c.id))).join("") || `<div class="muted small">no LLM API key found</div>`}
    <div id="custom-rows"></div>
    <details class="more"><summary>more models (${noLLM.length} need an API key) · add any model</summary>
      ${noLLM.map(c => row(c, false)).join("")}
      <div class="custom">
        <select id="cm-prov">${provs.map(([k, v]) => `<option value="${k}" ${v.available ? "" : "disabled"}>${esc(v.label)}${v.available ? "" : " (no key)"}</option>`).join("")}</select>
        <input id="cm-model" placeholder="model id, e.g. ${esc(provs[0] ? provs[0][1].default_model : "")}">
        <button type="button" id="cm-add" class="light">Add</button>
      </div>
      <div class="muted small">Keys are read from environment variables (${provs.map(([, v]) => v.key_env).join(", ")}). Default model ids can be overridden with ${provs.map(([, v]) => v.model_env).join(", ")}.</div>
    </details>`;
  const add = el.querySelector("#cm-add");
  if (add) add.onclick = () => {
    const prov = el.querySelector("#cm-prov").value, model = el.querySelector("#cm-model").value.trim();
    if (!model) return;
    const id = `${prov}:${model}`;
    if (!NAME[id]) { NAME[id] = `${(meta.providers[prov] || {}).label || prov} · ${model}`; COLOR[id] = _hashColor(id); ORDER.push(id); }
    el.querySelector("#custom-rows").insertAdjacentHTML("beforeend",
      row({ id, label: NAME[id], color: COLOR[id], kind: "llm", available: true, model, desc: "custom model" }, true));
    el.querySelector("#cm-model").value = "";
    if (onChange) onChange();
  };
  el.querySelectorAll("input[type=checkbox]").forEach(i => i.addEventListener("change", () => onChange && onChange()));
}

function chosenContestants(el) {
  return [...el.querySelectorAll("input[type=checkbox]:checked")].map(i => i.value);
}
