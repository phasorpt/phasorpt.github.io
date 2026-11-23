// 3D result viewer: one point cloud, rendered twice with a scissor split (left / right view mode), shaded sprites.
// Scenes: assets/scenes/<dataset>/<scene>.bin, written by website/tools/export_scenes.py (format there).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const root = document.getElementById("viewer");
const stage = document.getElementById("v-stage");
const MODES = [["input", "Input"], ["pred", "PhasorPT"], ["gt", "Ground truth"], ["err", "Errors"]];
const MODE_ID = { input: 0, pred: 1, gt: 2, err: 3 };
const st = { ds: "scannet", scene: null, left: "input", right: "pred", split: 0.5, size: 1, dist: [0.3, 50], index: null, cache: new Map(), token: 0 };
let renderer, scene, camera, controls, points, material, palTex, dirty = true, running = false, visible = false;
let cur = null;                                    // the shown scene's data (geometry with pred / gt attributes)
const pin = { i: -1, p: null };                    // the clicked point (index, world position), or none
const raycaster = new THREE.Raycaster();

const VERT = `
  attribute vec3 rgb; attribute float pred; attribute float gt;
  uniform int uMode; uniform sampler2D uPal; uniform float uSize; uniform float uScale;
  varying vec3 vCol;
  vec3 pal(float c) { return texture2D(uPal, vec2((c + 0.5) / 256.0, 0.5)).rgb; }
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * uScale / -mv.z, 1.6, 18.0);
    bool unl = gt > 254.5;
    if (uMode == 0) vCol = rgb;
    else if (uMode == 1) vCol = pal(pred);
    else if (uMode == 2) vCol = unl ? vec3(0.86) : pal(gt);
    else vCol = unl ? vec3(0.9, 0.91, 0.93) : (abs(pred - gt) < 0.5 ? vec3(0.7, 0.73, 0.78) : vec3(0.88, 0.27, 0.18));
  }`;
const FRAG = `
  varying vec3 vCol;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    float nz = sqrt(1.0 - r2);
    float light = 0.5 + 0.5 * clamp(dot(normalize(vec3(-c.x, c.y, nz)), normalize(vec3(-0.4, 0.5, 0.75))), 0.0, 1.0);
    gl_FragColor = vec4(vCol * (0.35 + 0.75 * light), 1.0);
  }`;

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  stage.prepend(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
  camera.up.set(0, 0, 1);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.12; controls.screenSpacePanning = true;
  // own wheel zoom: OrbitControls zooms a fixed step per wheel event, which races on trackpads / smooth wheels;
  // here the step follows deltaY, capped per event, and the distance stays within the scene's limits
  controls.enableZoom = false;
  renderer.domElement.addEventListener("wheel", e => {
    e.preventDefault();
    const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    const f = Math.exp(Math.max(-60, Math.min(60, px)) * 0.0025);
    const off = camera.position.clone().sub(controls.target);
    off.setLength(Math.max(st.dist[0], Math.min(st.dist[1], off.length() * f)));
    camera.position.copy(controls.target).add(off); dirty = true;
  }, { passive: false });
  controls.addEventListener("change", () => { dirty = true; });
  palTex = new THREE.DataTexture(new Uint8Array(256 * 4), 256, 1, THREE.RGBAFormat);
  palTex.magFilter = palTex.minFilter = THREE.NearestFilter;
  material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { uMode: { value: 0 }, uPal: { value: palTex }, uSize: { value: 0.02 }, uScale: { value: 1 } } });
  new ResizeObserver(resize).observe(stage);
  resize();
  new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) loop(); }).observe(stage);
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  material.uniforms.uScale.value = h * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  placeSplit(); dirty = true;
}

function loop() {
  if (running) return; running = true;
  const tick = () => {
    if (!visible) { running = false; return; }
    controls.update();
    if (dirty && points) draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function draw() {
  dirty = false; placePin();
  const w = stage.clientWidth, h = stage.clientHeight, sx = Math.round(st.split * w);
  renderer.setScissorTest(true);
  for (const [mode, x0, x1] of [[st.left, 0, sx], [st.right, sx, w]]) {
    if (x1 - x0 <= 0) continue;
    renderer.setScissor(x0, 0, x1 - x0, h); renderer.setViewport(0, 0, w, h);
    material.uniforms.uMode.value = MODE_ID[mode];
    renderer.render(scene, camera);
  }
  renderer.setScissorTest(false);
}

// ---- click a point: a label pinned to it in 3D (follows the camera) with its PhasorPT and ground-truth class;
// a click on empty space or a right click closes it
function pickAt(x, y) {
  const w = stage.clientWidth, h = stage.clientHeight;
  raycaster.setFromCamera(new THREE.Vector2(x / w * 2 - 1, -(y / h) * 2 + 1), camera);
  // the threshold is in world units: about the point spacing (2-3 cm indoors, a few cm-dm outdoors)
  raycaster.params.Points.threshold = st.index[st.ds].outdoor ? 0.12 : 0.025;
  return raycaster.intersectObject(points, false)[0] || null;
}
function setPin(hit) {
  if (!hit) { pin.i = -1; pin.p = null; } else { pin.i = hit.index; pin.p = hit.point.clone(); }
  placePin();
}
function placePin() {
  const tip = document.getElementById("v-hover"), dot = document.getElementById("v-hover-dot");
  if (!tip) return;
  if (pin.i < 0 || !cur) { tip.style.display = dot.style.display = "none"; return; }
  const w = stage.clientWidth, h = stage.clientHeight, p = pin.p.clone().project(camera);
  const x = (p.x + 1) / 2 * w, y = (1 - p.y) / 2 * h;
  if (p.z > 1 || x < 0 || x > w || y < 0 || y > h) { tip.style.display = dot.style.display = "none"; return; }
  const D = st.index[st.ds], pred = cur.geo.attributes.pred.array[pin.i], gt = cur.geo.attributes.gt.array[pin.i];
  const sw = c => `<i style="background:${c < D.names.length ? `rgb(${D.palette[c].join(",")})` : "#dcdfe4"}"></i>`;
  const nm = c => c < D.names.length ? D.names[c] : "unlabeled";
  // always both, whatever the view on that side of the divider: prediction above, ground truth below
  const html = `<small>PhasorPT</small>${sw(pred)}<b>${nm(pred)}</b>` +
    (gt < 255 ? `<em class="${gt === pred ? "ok" : "bad"}">${gt === pred ? "✓" : "✗"}</em>` : "") +
    `<small>ground truth</small>${sw(gt)}<b>${nm(gt)}</b>`;
  tip.innerHTML = html;
  tip.style.display = "grid"; dot.style.display = "block";
  dot.style.left = x + "px"; dot.style.top = y + "px";
  // the label above right of the point, kept inside the stage
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = Math.max(8, Math.min(w - tw - 8, x + 12)) + "px";
  tip.style.top = Math.max(8, Math.min(h - th - 8, y - th - 12)) + "px";
}

function setPalette(ds) {
  const d = palTex.image.data, P = st.index[ds].palette;
  for (let i = 0; i < 256; i++) { const c = P[i] || [200, 200, 200]; d.set([c[0], c[1], c[2], 255], 4 * i); }
  palTex.needsUpdate = true;
}

async function fetchScene(ds, s) {
  const key = ds + "/" + s.id;
  if (st.cache.has(key)) return st.cache.get(key);
  const res = await fetch(`assets/scenes/${ds}/${s.id}.bin`);
  if (!res.ok) throw new Error(res.status + " " + res.statusText);
  const total = +res.headers.get("content-length") || 11 * s.n, reader = res.body.getReader(), chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length;
    document.getElementById("v-loading").textContent = `loading ${Math.min(100, Math.round(100 * got / total))}%`; }
  const buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
  const n = s.n, q = new Uint16Array(buf.buffer, 0, 3 * n);
  const outdoor = st.index[ds].outdoor, pos = new Float32Array(3 * n);
  const cx = outdoor ? 0 : s.min[0] + s.extent[0] / 2, cy = outdoor ? 0 : s.min[1] + s.extent[1] / 2, cz = outdoor ? 0 : s.min[2];
  for (let i = 0; i < n; i++) {
    pos[3 * i] = s.min[0] + q[3 * i] / 65535 * s.extent[0] - cx;
    pos[3 * i + 1] = s.min[1] + q[3 * i + 1] / 65535 * s.extent[1] - cy;
    pos[3 * i + 2] = s.min[2] + q[3 * i + 2] / 65535 * s.extent[2] - cz;
  }
  const rgb = new Uint8Array(buf.buffer, 6 * n, 3 * n), pred = new Float32Array(n), gt = new Float32Array(n);
  const pr = new Uint8Array(buf.buffer, 9 * n, n), g = new Uint8Array(buf.buffer, 10 * n, n);
  const count = new Map(), err = [0, 0];
  for (let i = 0; i < n; i++) {
    pred[i] = pr[i]; gt[i] = g[i];
    count.set(pr[i], (count.get(pr[i]) || 0) + 1); if (g[i] !== 255) { count.set(g[i], (count.get(g[i]) || 0) + 1); err[0]++; if (g[i] !== pr[i]) err[1]++; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("rgb", new THREE.BufferAttribute(rgb, 3, true));
  geo.setAttribute("pred", new THREE.BufferAttribute(pred, 1));
  geo.setAttribute("gt", new THREE.BufferAttribute(gt, 1));
  geo.computeBoundingSphere();
  const out = { geo, count, acc: 1 - err[1] / Math.max(1, err[0]) };
  st.cache.set(key, out);
  return out;
}

function frame(ds, s) {
  if (st.index[ds].outdoor) { camera.position.set(-26, -12, 24); controls.target.set(4, 0, 0); st.dist = [3, 140]; }
  else {
    const e = Math.max(s.extent[0], s.extent[1]); st.dist = [0.4, 4 * e + 4];
    const a = THREE.MathUtils.degToRad(-55), el = THREE.MathUtils.degToRad(52), d = 1.25 * e + 1.5;
    controls.target.set(0, 0, s.extent[2] * 0.2);
    camera.position.set(d * Math.cos(el) * Math.cos(a), d * Math.cos(el) * Math.sin(a), s.extent[2] * 0.2 + d * Math.sin(el));
  }
  controls.update(); dirty = true;
}

async function show(ds, s) {
  const token = ++st.token;
  st.ds = ds; st.scene = s;
  const L = document.getElementById("v-loading"); L.textContent = "loading…"; L.style.display = "grid";
  renderUI();
  let data;
  try { data = await fetchScene(ds, s); }
  catch (e) { if (token === st.token) L.textContent = "could not load scene (" + e.message + ")"; return; }
  if (token !== st.token) return;
  if (points) scene.remove(points);
  points = new THREE.Points(data.geo, material); cur = data; setPin(null);
  scene.add(points);
  setPalette(ds);
  material.uniforms.uSize.value = (st.index[ds].outdoor ? 0.12 : 0.028) * st.size;
  L.style.display = "none";
  frame(ds, s);
  document.getElementById("v-chip").textContent = `${s.id} · ${s.n.toLocaleString("en")} points · scene mIoU ${s.miou.toFixed(1)} · accuracy ${(100 * data.acc).toFixed(1)}%`;
  legend(ds, data.count);
}

function legend(ds, count) {
  const D = st.index[ds], el = document.getElementById("v-legend");
  const classes = [...count.entries()].filter(([c]) => c < D.names.length).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  el.innerHTML = classes.map(c => `<span><i style="background:rgb(${D.palette[c].join(",")})"></i>${D.names[c]}</span>`).join("") +
    `<span><i style="background:#dcdfe4"></i>unlabeled</span><span><i style="background:#e0452e"></i>error</span>`;
}

function renderUI() {
  const D = st.index;
  document.getElementById("v-ds").innerHTML = Object.keys(D).map(k =>
    `<button type="button" data-ds="${k}" aria-pressed="${k === st.ds}">${D[k].title}</button>`).join("");
  document.getElementById("v-scenes").innerHTML = D[st.ds].scenes.map((s, i) =>
    `<button type="button" data-i="${i}" aria-pressed="${st.scene && s.id === st.scene.id}">${s.id} · ${s.miou.toFixed(1)}</button>`).join("");
  const name = m => m === "input" ? D[st.ds].input : MODES.find(x => x[0] === m)[1];
  document.getElementById("v-lbl-l").textContent = name(st.left);
  document.getElementById("v-lbl-r").textContent = name(st.right);
  for (const id of ["v-left", "v-right"]) {
    const sel = document.getElementById(id), cur = id === "v-left" ? st.left : st.right;
    sel.innerHTML = MODES.map(([k]) => `<option value="${k}"${k === cur ? " selected" : ""}>${name(k)}</option>`).join("");
  }
}

function placeSplit() {
  const w = stage.clientWidth, x = st.split * w;
  document.getElementById("v-split").style.left = x + "px";
  const h = document.getElementById("v-handle"); h.style.left = x + "px"; h.setAttribute("aria-valuenow", Math.round(st.split * 100));
}

function wire() {
  root.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.ds) show(b.dataset.ds, st.index[b.dataset.ds].scenes[0]);
    else if (b.dataset.i !== undefined) show(st.ds, st.index[st.ds].scenes[+b.dataset.i]);
  });
  document.getElementById("v-left").addEventListener("change", e => { st.left = e.target.value; renderUI(); dirty = true; });
  document.getElementById("v-right").addEventListener("change", e => { st.right = e.target.value; renderUI(); dirty = true; });
  document.getElementById("v-reset").addEventListener("click", () => { if (st.scene) frame(st.ds, st.scene); });
  const cvs = renderer.domElement;
  // a click (no drag) picks: on a point it pins the label there; on empty space, or a right click, removes it
  let down = null;
  cvs.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  cvs.addEventListener("pointerup", e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (moved > 5 || dt > 500 || !points) return;           // a drag (orbit / pan), not a click
    if (e.button === 2) return setPin(null);                // right click: close
    if (e.button !== 0) return;
    const r = stage.getBoundingClientRect(); setPin(pickAt(e.clientX - r.left, e.clientY - r.top));
  });
  const h = document.getElementById("v-handle");
  let drag = false;
  const move = e => { const r = stage.getBoundingClientRect(); st.split = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); placeSplit(); dirty = true; };
  h.addEventListener("pointerdown", e => { drag = true; h.setPointerCapture(e.pointerId); e.stopPropagation(); });
  h.addEventListener("pointermove", e => { if (drag) move(e); });
  h.addEventListener("pointerup", () => { drag = false; });
  h.addEventListener("keydown", e => {
    const d = { ArrowLeft: -0.05, ArrowRight: 0.05 }[e.key]; if (d === undefined) return;
    e.preventDefault(); st.split = Math.min(1, Math.max(0, st.split + d)); placeSplit(); dirty = true;
  });
}

async function start() {
  try { st.index = await (await fetch("assets/scenes/index.json")).json(); }
  catch (e) { document.getElementById("v-loading").textContent = "scenes unavailable (serve the page over http)"; return; }
  init(); wire(); loop();
  const q = new URLSearchParams(location.search).get("ds"), ds = st.index[q] ? q : "scannet";
  show(ds, st.index[ds].scenes[0]);
}

if (root) {
  const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: "400px 0px" });
  io.observe(root);
}
