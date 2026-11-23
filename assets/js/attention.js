// Phasor attention demo (simplified from the 2D VO-RoPE prototype): a query at the centre of a 19 x 19 key grid aims
// its attention at an offset; empty space (Perlin-noise holes) removes keys, and the softmax renormalizes over the
// rest. With constant values, the output of each frequency band is the characteristic function of the attended
// offsets: with phasor values its phase and length reveal where the mass landed; with RoPE values it is constant.
(function () {
  const root = document.getElementById("attn-demo");
  if (!root) return;
  const cv = document.getElementById("attn-cv"), ctx = cv.getContext("2d");
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  // colours read once (getComputedStyle per draw call made every frame recompute styles)
  let P = {};
  const palette = () => { P = { ink: css("--ink"), muted: css("--muted"), faint: css("--faint"), rule: css("--rule"), acc: css("--accent"), amb: css("--amber") }; };
  palette();
  const R = 9, N = 2 * R + 1, GS = 400, OX = 8, OY = 8, cell = GS / N;
  const CW = OX + GS + 96, CH = OY + GS + 90;
  const Q = 4, bands = [...Array(Q)].map((_, k) => 1.2 * Math.pow(100, -k / Q));
  const st = { aim: [3.2, -1.6], sig: 1.4, drop: 0.55, nseed: 11, mode: "phasor", nsc: 4, cont: 0 };
  const keys = [];
  // every key also carries a random content value (a 2D feature, as a complex number), mixed in by "Value content"
  let vs = 7; const vr = () => { vs = (vs * 16807) % 2147483647; return vs / 2147483647; };
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) { const a = vr() * 2 * Math.PI, m = 0.4 + vr() * 1.2; keys.push({ x, y, on: true, ux: m * Math.cos(a), uy: m * Math.sin(a) }); }

  let perlin;
  function makeNoise(sd) {
    let t = sd * 7919 + 13; const r = () => { t = (t * 16807) % 2147483647; return t / 2147483647; };
    const P = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
    const G = P.map(() => { const a = r() * 2 * Math.PI; return [Math.cos(a), Math.sin(a)]; });
    const h = (i, j) => G[P[(P[i & 255] + j) & 255]], fade = u => u * u * u * (u * (u * 6 - 15) + 10);
    const ox = r() * 64, oy = r() * 64;
    perlin = (x, y) => { x += ox; y += oy; const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
      const d = (gi, gj, dx, dy) => { const g = h(gi, gj); return g[0] * dx + g[1] * dy; };
      const u = fade(fx), v = fade(fy);
      const a = d(i, j, fx, fy) + u * (d(i + 1, j, fx - 1, fy) - d(i, j, fx, fy)), b = d(i, j + 1, fx, fy - 1) + u * (d(i + 1, j + 1, fx - 1, fy - 1) - d(i, j + 1, fx, fy - 1));
      return a + v * (b - a); };
  }
  function computeMask() {
    makeNoise(st.nseed);
    keys.forEach(k => { k.n = perlin(k.x / st.nsc, k.y / st.nsc) + 0.4 * perlin(2.1 * k.x / st.nsc + 17.3, 2.1 * k.y / st.nsc - 5.1); k.on = true; });
    const m = Math.round(st.drop * keys.length);
    [...keys].filter(k => k.x || k.y).sort((a, b) => a.n - b.n).slice(0, m).forEach(k => { k.on = false; });
  }
  function weights() {
    const l = keys.map(k => k.on ? -((k.x - st.aim[0]) ** 2 + (k.y - st.aim[1]) ** 2) / (2 * st.sig * st.sig) : -Infinity);
    const lm = Math.max(...l), w = l.map(v => Math.exp(v - lm)), s = w.reduce((a, b) => a + b, 0) || 1;
    return w.map(v => v / s);
  }
  function phasors(w) {
    const out = [];
    for (const ax of [0, 1]) for (let b = 0; b < Q; b++) {
      const om = bands[b]; let re = 0, im = 0; const pts = [];
      keys.forEach((k, i) => {
        if (w[i] < 1e-9) return;
        const d = ax ? k.y : k.x, th = st.mode === "phasor" ? om * d : 0, c = Math.cos(th), s = Math.sin(th);
        const vr_ = (1 - st.cont) + st.cont * k.ux, vi = st.cont * k.uy;           // value: constant + content
        const zr = c * vr_ - s * vi, zi = s * vr_ + c * vi;
        re += w[i] * zr; im += w[i] * zi; if (w[i] > 2e-3) pts.push([zr, zi, w[i]]);
      });
      out.push({ ax, b, om, re, im, pts });
    }
    return out;
  }
  function decoded(ps) {
    const e = [0, 0];
    for (const ax of [0, 1]) {
      const p = ps.filter(q => q.ax === ax);
      let est = Math.atan2(p[Q - 1].im, p[Q - 1].re) / p[Q - 1].om;
      for (let b = Q - 2; b >= 0; b--) { if (Math.hypot(p[b].re, p[b].im) < 0.3) break; const q = p[b], ph = Math.atan2(q.im, q.re), n = Math.round((est * q.om - ph) / (2 * Math.PI)); est = (ph + 2 * Math.PI * n) / q.om; }
      e[ax] = est;
    }
    return e;
  }

  let scale = 1;
  function size() {
    const w = cv.clientWidth, dpr = window.devicePixelRatio || 1;
    scale = w / CW; cv.style.height = Math.round(CH * scale) + "px";
    cv.width = Math.round(w * dpr); cv.height = Math.round(CH * scale * dpr);
  }
  const px = v => OX + (v + R + 0.5) * cell, py = v => OY + (R + 0.5 - v) * cell;
  function cross(x, y, r, col, lw) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke(); }

  function dial(p, cx, cy, r, aim) {
    const ink = P.ink, muted = P.muted, acc = P.acc, amb = P.amb;
    ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
    if (st.mode === "phasor") {           // tick: phase of the intended offset
      const tr = p.om * aim;
      ctx.strokeStyle = amb; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + Math.cos(tr) * (r + 2), cy - Math.sin(tr) * (r + 2)); ctx.lineTo(cx + Math.cos(tr) * (r + 9), cy - Math.sin(tr) * (r + 9)); ctx.stroke();
    }
    const mw = Math.max(...p.pts.map(q => q[2]), 1e-9); ctx.fillStyle = ink;
    p.pts.forEach(q => { const n = Math.max(1, Math.hypot(q[0], q[1])); ctx.globalAlpha = 0.12 + 0.6 * q[2] / mw; ctx.beginPath(); ctx.arc(cx + q[0] / n * r, cy - q[1] / n * r, 1.8, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1;
    const zx = cx + p.re * r, zy = cy - p.im * r;
    ctx.strokeStyle = acc; ctx.fillStyle = acc; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(zx, zy); ctx.stroke();
    ctx.beginPath(); ctx.arc(zx, zy, 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = muted; ctx.font = "500 10px IBM Plex Mono, monospace"; ctx.textAlign = "center"; ctx.fillText("ω " + p.om.toFixed(2), cx, cy + r + 15);
  }

  const f = v => { const s = Math.abs(v) < 0.05 ? 0 : v; return (s < 0 ? "−" : "+") + Math.abs(s).toFixed(1); };
  let queued = 0;
  function render() { if (!queued) queued = requestAnimationFrame(() => { queued = 0; draw(); }); }
  function draw() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0); ctx.clearRect(0, 0, CW, CH);
    const w = weights(), ps = phasors(w);
    let mx = 0, my = 0; keys.forEach((k, i) => { mx += w[i] * k.x; my += w[i] * k.y; });
    const est = decoded(ps), ink = P.ink, faint = P.faint;
    // grid, holes, keys sized by attention weight
    ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.strokeRect(OX + .5, OY + .5, GS - 1, GS - 1);
    ctx.fillStyle = faint; ctx.globalAlpha = 0.16;
    keys.forEach(k => { if (!k.on) ctx.fillRect(px(k.x) - cell / 2, py(k.y) - cell / 2, cell, cell); });
    const wm = Math.max(...w);
    keys.forEach((k, i) => {
      if (!k.on) return;
      const a = w[i] / wm, on = a > 0.02;
      ctx.globalAlpha = on ? 0.3 + 0.7 * a : 0.35; ctx.fillStyle = on ? P.acc : faint;
      ctx.beginPath(); ctx.arc(px(k.x), py(k.y), on ? 2 + a * cell * 0.42 : 1.6, 0, 7); ctx.fill();
      if (st.cont > 0 && a > 0.15) {   // the content of the attended values
        ctx.globalAlpha = 0.9; ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px(k.x), py(k.y));
        ctx.lineTo(px(k.x) + k.ux * cell * 0.4 * st.cont, py(k.y) - k.uy * cell * 0.4 * st.cont); ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
    // query, aim, landed, decoded
    ctx.fillStyle = faint; ctx.beginPath(); ctx.arc(px(0), py(0), 5, 0, 7); ctx.fill();
    ctx.strokeStyle = faint; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(px(0), py(0)); ctx.lineTo(px(st.aim[0]), py(st.aim[1])); ctx.stroke(); ctx.setLineDash([]);
    cross(px(st.aim[0]), py(st.aim[1]), 10, P.amb, 2.5);
    if (st.mode === "phasor") { ctx.strokeStyle = P.acc; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px(est[0]), py(est[1]), 11, 0, 7); ctx.stroke(); }
    // dials: x bands below, y bands right
    const r = 26, step = GS / Q;
    ps.forEach(p => {
      if (p.ax === 0) dial(p, OX + step * p.b + step / 2, OY + GS + 44, r, st.aim[0]);
      else dial(p, OX + GS + 50, OY + step * p.b + step / 2 - 6, r, st.aim[1]);
    });
    ctx.fillStyle = P.muted; ctx.font = "500 10px IBM Plex Mono, monospace"; ctx.textAlign = "left";
    ctx.fillText("x", OX - 2, OY + GS + 18); ctx.textAlign = "center"; ctx.fillText("y", OX + GS + 50, OY - 0 + 2);
    // readout and message
  }

  // ---- interaction
  const toGrid = e => { const b = cv.getBoundingClientRect(); const x = (e.clientX - b.left) / scale - OX, y = (e.clientY - b.top) / scale - OY; return x >= 0 && x <= GS && y >= 0 && y <= GS ? [x, y] : null; };
  const aimAt = p => { st.aim = [p[0] / cell - R - 0.5, -(p[1] / cell - R - 0.5)]; render(); };
  let down = false;
  cv.addEventListener("pointermove", e => { if (e.pointerType === "mouse" || down) { const p = toGrid(e); if (p) aimAt(p); } });
  cv.addEventListener("pointerdown", e => { const p = toGrid(e); if (!p) return; down = true; cv.setPointerCapture(e.pointerId); aimAt(p); });
  cv.addEventListener("pointerup", () => { down = false; }); cv.addEventListener("pointercancel", () => { down = false; });
  const spread = document.getElementById("attn-spread");
  cv.addEventListener("wheel", e => { if (!toGrid(e)) return; e.preventDefault(); st.sig = Math.min(5, Math.max(0.4, st.sig * (e.deltaY > 0 ? 1.1 : 1 / 1.1))); spread.value = st.sig; render(); }, { passive: false });
  cv.addEventListener("keydown", e => {
    const d = { ArrowLeft: [-.5, 0], ArrowRight: [.5, 0], ArrowUp: [0, .5], ArrowDown: [0, -.5] }[e.key]; if (!d) return;
    e.preventDefault(); st.aim = [Math.max(-R, Math.min(R, st.aim[0] + d[0])), Math.max(-R, Math.min(R, st.aim[1] + d[1]))]; render();
  });
  spread.addEventListener("input", () => { st.sig = +spread.value; render(); });
  const cont = document.getElementById("attn-cont");
  cont.addEventListener("input", () => { st.cont = +cont.value; render(); });
  const drop = document.getElementById("attn-drop");
  drop.addEventListener("input", () => { st.drop = +drop.value; computeMask(); render(); });
  document.getElementById("attn-reseed").addEventListener("click", () => { st.nseed++; computeMask(); aimIntoHole(); render(); });
  root.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => {
    root.querySelectorAll("[data-mode]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); st.mode = b.dataset.mode; render();
  }));

  // start aimed into a hole, next to existing keys, so the first view shows a miss
  function aimIntoHole() {
    const off = keys.filter(k => !k.on && Math.hypot(k.x, k.y) >= 3 && Math.hypot(k.x, k.y) <= 7);
    const gap = k => Math.min(...keys.filter(j => j.on).map(j => Math.hypot(j.x - k.x, j.y - k.y)));
    const best = off.sort((a, b) => Math.abs(gap(a) - 2.2) - Math.abs(gap(b) - 2.2))[0];
    if (best) st.aim = [best.x, best.y];
  }
  computeMask(); aimIntoHole(); size(); render();
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { size(); render(); }, 100); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { palette(); render(); });
})();
