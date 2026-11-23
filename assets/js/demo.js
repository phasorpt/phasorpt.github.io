// Live demo: PhasorPT (Rust + Burn, WebAssembly + WebGPU) in a worker, on ScanNet val scenes or a user's .ply.
// Click a point: its predicted class and, for the ScanNet scenes, the ground truth.
// Nothing is downloaded before the visitor clicks "Start the demo": then the worker loads the wasm module and the
// weights (demo/, copied from rust/phasorpt-web by tools/sync_demo.sh) while the page loads and shows the scene.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const DEMO = new URL("../../demo/", import.meta.url);
// ScanNet val scenes (demo/scenes/<id>.ply with the ground truth as a per-point label, tools/export_demo_scene.py)
const SCENES = [["scene0011_00", "kitchen"], ["scene0207_00", "apartment"], ["scene0353_00", "bedroom"], ["scene0608_00", "lounge"]];
const MAX_POINTS = 4000000;                  // larger clouds: random subsample (browser buffer limits)
const PALETTE = [[174, 199, 232], [152, 223, 138], [31, 119, 180], [255, 187, 120], [188, 189, 34], [140, 86, 75],
  [255, 152, 150], [214, 39, 40], [197, 176, 213], [148, 103, 189], [196, 156, 148], [23, 190, 207], [247, 182, 210],
  [219, 219, 141], [255, 127, 14], [158, 218, 229], [44, 160, 44], [112, 128, 144], [227, 119, 194], [82, 84, 163]];
const UNLABELED = [220, 223, 228];
const $ = id => document.getElementById(id);
const stage = $("demo-stage");

let worker, ready = false, busy = false, started = false, info = {}, cloud = null, labels = null, runs = 0, mode = "input";
let renderer, scene, camera, controls, points, material, dirty = true, visible = true;
const results = new Map();                   // scene id -> {labels, text}: switching back shows the result again
const pin = { i: -1, p: null };
let raycaster = null;

function status(text) { const el = $("demo-status"); el.textContent = text; el.style.display = text ? "" : "none"; }
function fail(text) {
  const s = $("demo-start"); s.classList.add("err"); s.style.display = "";
  s.innerHTML = `<p class="demo-lead">${text}</p>`; status("");
}

function sceneButtons(cur) {
  $("demo-scenes").innerHTML = SCENES.map(([id, name]) =>
    `<button type="button" data-scene="${id}" aria-pressed="${id === cur}">${id} · ${name}</button>`).join("");
}

async function start(id = SCENES[0][0]) {
  if (started) return; started = true;
  const firefox = /firefox/i.test(navigator.userAgent);
  if (!navigator.gpu) return fail("WebGPU is not available in this browser. Please try a recent Chrome or Edge.");
  if (firefox) return fail("Firefox cannot compile the model's GPU kernels yet. Please use Chrome or Edge.");
  $("demo-start").style.display = "none"; $("demo-help").style.display = "";
  initViewer();
  worker = new Worker(new URL("worker.js", DEMO), { type: "module" });
  worker.onmessage = onMessage;
  worker.onerror = e => fail(`The demo stopped: ${e.message || "worker error"}`);
  worker.postMessage({ type: "init", pkg: "pkg", tune: "minimal", f16: false });
  status("Loading the model…");
  await openScene(id);
}

let sceneToken = 0;
async function openScene(id) {
  const token = ++sceneToken;
  sceneButtons(id);
  if (ready) status(`Loading ${id}…`);
  try {
    const r = await fetch(new URL(`scenes/${id}.ply`, DEMO));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = await r.arrayBuffer();
    if (token !== sceneToken) return;
    await loadPly(buf, `ScanNet val ${id}`, id);
  } catch (e) { if (token === sceneToken) status(`Could not load ${id} (${e.message}).`); }
}

function onMessage(e) {
  const m = e.data;
  if (m.type === "status") { if (!ready || (busy && running === cloud)) status(m.text); }
  else if (m.type === "ready") { ready = true; info = m.info; maybeRun(); }
  else if (m.type === "result") onResult(m.labels, m.stats);
  else if (m.type === "error") { busy = false; status(`Error: ${m.text}`); $("demo-run").disabled = false; }
}

// ---------------------------------------------------------------- point clouds
async function loadPly(buffer, name, id = null) {
  const { parsePly } = await import(new URL("ply.js", DEMO));
  let c = parsePly(buffer);
  if (c.count > MAX_POINTS) c = subsample(c, MAX_POINTS);
  cloud = { ...c, label: c.label || new Uint8Array(0), name, id }; labels = null; setPin(null);
  if (!id) sceneButtons(null);
  show();
  const done = id && results.get(id);
  if (done) { labels = done.labels; showResult(done.text); return; }
  if (!c.color.length || !c.normal.length) status(`${name} has no ${!c.color.length ? "colours" : "normals"}; the model expects both, as in ScanNet.`);
  maybeRun();
}
function subsample(c, k) {
  let seed = 12345; const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const idx = new Uint32Array(c.count).map((_, i) => i);
  for (let i = 0; i < k; i++) { const j = i + Math.floor(rand() * (c.count - i)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
  const keep = idx.subarray(0, k).sort();
  const pick = a => { if (!a.length) return a; const o = new Float32Array(k * 3); keep.forEach((s, i) => { o.set(a.subarray(3 * s, 3 * s + 3), 3 * i); }); return o; };
  const lab = c.label && c.label.length ? Uint8Array.from(keep, s => c.label[s]) : new Uint8Array(0);
  return { count: k, coord: pick(c.coord), color: pick(c.color), normal: pick(c.normal), label: lab };
}
let running = null;                          // the cloud the worker is segmenting
function maybeRun() {
  if (!ready || !cloud || busy) return;
  busy = true; running = cloud; $("demo-run").disabled = true;
  status(runs ? "Segmenting…" : "Segmenting… the first run also compiles the GPU kernels.");
  worker.postMessage({ type: "run", coord: cloud.coord.slice(), color: cloud.color.slice(), normal: cloud.normal.slice(), profile: false, patch: 0 });
}
function onResult(lab, s) {
  busy = false; runs++;
  const of = running; running = null;
  let text = `${s.points.toLocaleString("en")} points in ${(s.wall_ms / 1000).toFixed(1)} s` + (runs === 1 ? " · first run, incl. compiling" : "");
  if (of.label.length) {                     // against the ground truth: accuracy and the scene's mIoU
    const C = 20, inter = new Float64Array(C), uni = new Float64Array(C); let ok = 0, n = 0;
    for (let i = 0; i < lab.length; i++) {
      const g = of.label[i], p = lab[i]; if (g === 255) continue;
      n++; if (g === p) { ok++; inter[g]++; uni[g]++; } else { if (g < C) uni[g]++; if (p < C) uni[p]++; }
    }
    let sum = 0, k = 0; for (let c = 0; c < C; c++) if (uni[c] > 0) { sum += inter[c] / uni[c]; k++; }
    text += ` · mIoU ${(100 * sum / Math.max(1, k)).toFixed(1)} · accuracy ${(100 * ok / Math.max(1, n)).toFixed(1)}%`;
  }
  if (of.id) results.set(of.id, { labels: lab, text });
  if (of !== cloud) { if (!labels) maybeRun(); return; }   // the visitor switched scenes meanwhile: run the new one
  labels = lab; showResult(text);
}
function showResult(text) {
  const names = info.class_names || SCANNET20, counts = new Map();
  labels.forEach(k => counts.set(k, (counts.get(k) || 0) + 1));
  const hasGt = cloud.label.length > 0;
  $("demo-legend").innerHTML = [...counts.entries()].sort((a, b) => b[1] - a[1])
    .map(([k]) => `<span><i style="background:rgb(${PALETTE[k % PALETTE.length].join(",")})"></i>${names[k] || "class " + k}</span>`).join("") +
    (hasGt ? `<span><i style="background:rgb(${UNLABELED.join(",")})"></i>unlabeled</span>` : "");
  document.querySelector('[data-dmode="pred"]').disabled = false;
  document.querySelector('[data-dmode="gt"]').disabled = !hasGt;
  setMode(mode === "input" || (mode === "gt" && !hasGt) ? "pred" : mode);
  $("demo-run").disabled = false; $("demo-file").disabled = false;
  status(text);
}

// ---------------------------------------------------------------- click a point: its PhasorPT class (and ground truth)
const SCANNET20 = ["wall", "floor", "cabinet", "bed", "chair", "sofa", "table", "door", "window", "bookshelf", "picture",
  "counter", "desk", "curtain", "refrigerator", "shower curtain", "toilet", "sink", "bathtub", "other furniture"];
const className = k => k === 255 ? "unlabeled" : ((info.class_names || SCANNET20)[k] || "class " + k);
const swatch = k => `<i style="background:rgb(${(k === 255 ? UNLABELED : PALETTE[k % PALETTE.length]).join(",")})"></i>`;
function setPin(hit) {
  if (!hit || !(labels || cloud.label.length)) { pin.i = -1; pin.p = null; } else { pin.i = hit.index; pin.p = hit.point.clone(); }
  placePin();
}
function placePin() {
  const tip = $("d-hover"), dot = $("d-hover-dot");
  if (pin.i < 0 || !camera) { tip.style.display = dot.style.display = "none"; return; }
  const w = stage.clientWidth, h = stage.clientHeight, p = pin.p.clone().project(camera);
  const x = (p.x + 1) / 2 * w, y = (1 - p.y) / 2 * h;
  if (p.z > 1 || x < 0 || x > w || y < 0 || y > h) { tip.style.display = dot.style.display = "none"; return; }
  const pr = labels ? labels[pin.i] : -1, gt = cloud.label.length ? cloud.label[pin.i] : -1;
  tip.innerHTML = (pr < 0 ? "" : `<small>PhasorPT</small>${swatch(pr)}<b>${className(pr)}</b>`) +
    (pr >= 0 && gt >= 0 && gt < 255 ? `<em class="${gt === pr ? "ok" : "bad"}">${gt === pr ? "✓" : "✗"}</em>` : "") +
    (gt < 0 ? "" : `<small>ground truth</small>${swatch(gt)}<b>${className(gt)}</b>`);
  tip.style.display = "grid"; dot.style.display = "block";
  dot.style.left = x + "px"; dot.style.top = y + "px";
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = Math.max(8, Math.min(w - tw - 8, x + 12)) + "px";
  tip.style.top = Math.max(8, Math.min(h - th - 8, y - th - 12)) + "px";
}
function pickAt(x, y) {
  raycaster.setFromCamera(new THREE.Vector2(x / stage.clientWidth * 2 - 1, -(y / stage.clientHeight) * 2 + 1), camera);
  // about the point spacing: 2-3 cm in ScanNet; for other clouds a fraction of their size
  raycaster.params.Points.threshold = cloud.id ? 0.025 : Math.max(0.01, 0.006 * points.geometry.boundingSphere.radius);
  return raycaster.intersectObject(points, false)[0] || null;
}

// ---------------------------------------------------------------- viewer (shaded point sprites, as the result viewer)
function initViewer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  stage.prepend(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500); camera.up.set(0, 0, 1);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.12; controls.screenSpacePanning = true; controls.enableZoom = false;
  controls.addEventListener("change", () => { dirty = true; });
  renderer.domElement.addEventListener("wheel", e => {
    e.preventDefault();
    const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1), f = Math.exp(Math.max(-60, Math.min(60, px)) * 0.0025);
    const off = camera.position.clone().sub(controls.target), r = points ? points.geometry.boundingSphere.radius : 5;
    off.setLength(Math.max(0.05 * r, Math.min(6 * r, off.length() * f)));
    camera.position.copy(controls.target).add(off); dirty = true;
  }, { passive: false });
  material = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 0.028 }, uScale: { value: 1 } },
    vertexShader: `attribute vec3 col; uniform float uSize; uniform float uScale; varying vec3 vCol;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uSize * uScale / -mv.z, 1.6, 24.0); vCol = col; }`,
    fragmentShader: `varying vec3 vCol;
      void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c); if (r2 > 1.0) discard;
        float nz = sqrt(1.0 - r2);
        float light = 0.5 + 0.5 * clamp(dot(normalize(vec3(-c.x, c.y, nz)), normalize(vec3(-0.4, 0.5, 0.75))), 0.0, 1.0);
        gl_FragColor = vec4(vCol * (0.35 + 0.75 * light), 1.0); }` });
  new ResizeObserver(resize).observe(stage); resize();
  new IntersectionObserver(e => { visible = e[0].isIntersecting; }).observe(stage);
  const tick = () => { if (visible) { controls.update(); if (dirty && points) { dirty = false; renderer.render(scene, camera); placePin(); } } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  document.querySelectorAll("[data-dmode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.dmode)));
  $("demo-run").addEventListener("click", () => { if (cloud && cloud.id) results.delete(cloud.id); maybeRun(); });
  raycaster = new THREE.Raycaster();
  const cvs = renderer.domElement;
  // a click (no drag) on a point pins its label there; on empty space, or a right click, removes it
  let down = null;
  cvs.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  cvs.addEventListener("pointerup", e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (moved > 5 || dt > 500 || !points) return;
    if (e.button === 2) return setPin(null);
    if (e.button !== 0) return;
    const r = stage.getBoundingClientRect(); setPin(pickAt(e.clientX - r.left, e.clientY - r.top));
  });
  $("demo-file").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await loadPly(await f.arrayBuffer(), f.name); } catch (err) { status(`Could not read ${f.name}: ${err.message}`); }
  });
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  material.uniforms.uScale.value = h * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  dirty = true;
}
function show() {
  if (points) { scene.remove(points); points.geometry.dispose(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(cloud.coord, 3));
  g.setAttribute("col", new THREE.BufferAttribute(inputColors(), 3));
  g.computeBoundingSphere(); g.computeBoundingBox();
  points = new THREE.Points(g, material); scene.add(points);
  const b = g.boundingBox, c = b.getCenter(new THREE.Vector3()), ext = Math.max(b.max.x - b.min.x, b.max.y - b.min.y);
  const a = THREE.MathUtils.degToRad(-55), el = THREE.MathUtils.degToRad(52), d = 1.25 * ext + 1.5;
  controls.target.set(c.x, c.y, b.min.z + 0.2 * (b.max.z - b.min.z));
  camera.position.set(c.x + d * Math.cos(el) * Math.cos(a), c.y + d * Math.cos(el) * Math.sin(a), controls.target.z + d * Math.sin(el));
  camera.far = 20 * d; camera.updateProjectionMatrix();
  setMode("input"); $("demo-legend").innerHTML = "";
  document.querySelector('[data-dmode="pred"]').disabled = true;
  document.querySelector('[data-dmode="gt"]').disabled = !cloud.label.length;        // the ground truth: right away
  dirty = true;
}
function inputColors() {
  const o = new Float32Array(cloud.count * 3);
  if (cloud.color.length) for (let i = 0; i < o.length; i++) o[i] = cloud.color[i] / 255; else o.fill(0.7);
  return o;
}
function labelColors(lab, gray) {
  const col = new Float32Array(lab.length * 3);
  lab.forEach((k, i) => { const p = k === 255 ? gray : PALETTE[k % PALETTE.length]; col[3 * i] = p[0] / 255; col[3 * i + 1] = p[1] / 255; col[3 * i + 2] = p[2] / 255; });
  return col;
}
function setMode(m) {
  mode = m;
  document.querySelectorAll("[data-dmode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.dmode === m)));
  if (!points) return;
  let col;
  if (m === "pred" && labels) col = labelColors(labels, UNLABELED);
  else if (m === "gt" && cloud.label.length) col = labelColors(cloud.label, UNLABELED);
  else col = inputColors();
  points.geometry.setAttribute("col", new THREE.BufferAttribute(col, 3)); dirty = true;
}

if (stage) {
  sceneButtons(null);
  $("demo-go").addEventListener("click", () => start());
  $("demo-scenes").addEventListener("click", e => {
    const b = e.target.closest("[data-scene]"); if (!b) return;
    if (!started) start(b.dataset.scene);
    else if (!cloud || cloud.id !== b.dataset.scene) openScene(b.dataset.scene);
  });
  if (new URLSearchParams(location.search).get("demo") === "start") start();   // direct link: index.html?demo=start#demo
}
