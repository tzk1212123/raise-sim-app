// Module Web Worker for the GitHub Pages build: runs the Python simulator (raise_sim) in Pyodide.
// Messages in: {id, method, path, body}; out: {id, out: JSON string {status, body}} or {progress: text}.
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

let handle = null;
const ready = (async () => {
  postMessage({ progress: "Starting Python…" });
  let mod;
  try { mod = await import(PYODIDE + "pyodide.mjs"); }
  catch (_) {   // some embedded browsers block cross-origin module loads: fetch the code and import it as a blob
    const code = await (await fetch(PYODIDE + "pyodide.mjs")).text();
    mod = await import(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
  }
  const py = await mod.loadPyodide({ indexURL: PYODIDE });
  postMessage({ progress: "Loading numpy, scipy, scikit-learn…" });
  await py.loadPackage(["numpy", "scipy", "scikit-learn"]);
  postMessage({ progress: "Loading the simulator…" });
  const buf = await (await fetch(new URL("pybundle.zip", self.location.href))).arrayBuffer();
  py.unpackArchive(buf, "zip", { extractDir: "/home/pyodide" });
  py.runPython("import sys; sys.path.insert(0, '/home/pyodide')");
  postMessage({ progress: "Building the simulated rig…" });
  handle = py.pyimport("raise_sim.webapi").handle;
  postMessage({ progress: "ready" });
})();
ready.catch(e => postMessage({ progress: "error: " + e }));

onmessage = async (e) => {
  const { id, method, path, body } = e.data;
  try {
    await ready;
    postMessage({ id, out: handle(method, path, body || "") });
  } catch (err) {
    postMessage({ id, out: JSON.stringify({ status: 500, body: { detail: String(err) } }) });
  }
};
