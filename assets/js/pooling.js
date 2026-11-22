// Phasor pooling as an interactive version of the paper figure (Fig. planewave): a small 2D scene on a grid of cells
// -> the points of one cell (token) and their offsets to its centroid -> every point samples M waves (cos / sin)
// -> S_t, the mean over the points of feature x wave -> h_t = W [vec S_t, log n_t].
// Click a cell to pick a token, hover a point to follow it.
(function () {
  const cv = document.getElementById("pw-cv");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const W = 1000, H = 500;                       // logical canvas size (scaled to the container width)
  const NX = 6, NY = 4, LAT = 10, M = 3, B = 1 + 2 * M, D = 8;
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const hex = h => { h = h.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const lerp = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));
  function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------- layout (logical px)
  const L = {
    scene: { x: 344, y: 34, c: 52 },                        // top: 6 x 4 cells of 52 px
    cell: { x: 30, y: 298, s: 190 },                        // bottom row: the four steps
    waves: { x: 334, y: 314, s: 74, g: 9 },
    S: { x: 636, y: 334, c: 27, g: 3 },
    tok: { x: 950, y: 314, w: 22, c: 20 },
  };

  // ---------- scene: a wall, a table, a round chair, a plant; sampled on a fine lattice (8 per cell axis)
  let pts = [], toks = [];
  function build() {
    const r = rng(7), gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()), raw = [];
    const add = (x, y, col, obj) => raw.push([x, y, col.map(v => Math.min(1, Math.max(0, v + .05 * gauss()))), obj]);
    // a living room seen from above; objects first, the floor last (one point per fine voxel: first come wins)
    const lerp3 = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
    const ring = (cx, cy, rad, n, col, obj) => { for (let i = 0; i < n; i++) { const a = 2 * Math.PI * r(); add(cx + rad * Math.cos(a) + .025 * gauss(), cy + rad * Math.sin(a) + .025 * gauss(), col, obj); } };
    const box = (x0, y0, w, h, n, colA, colB, obj) => { for (let i = 0; i < n; i++) { const u = r(), v = r(); add(x0 + w * u, y0 + h * v, lerp3(colA, colB, u), obj); } };
    for (let x = .1; x < 5.9; x += .08) add(x, 3.86 + .02 * gauss(), [.80, .76, .68], 0);              // walls
    for (let y = .1; y < 3.86; y += .08) add(.12 + .02 * gauss(), y, [.80, .76, .68], 0);
    for (let b = 0; b < 9; b++) {                                                                 // bookshelf: one colour per book
      const hue = [[.72, .2, .2], [.2, .45, .7], [.85, .65, .2], [.3, .55, .3], [.55, .3, .6], [.9, .9, .85]][Math.floor(r() * 6)];
      box(.8 + b * .16, 3.5, .13, .28, 8, hue, hue, 1);
    }
    box(3.5, 3.05, 2.2, .5, 110, [.72, .22, .22], [.55, .16, .2], 2);                              // sofa, L-shaped
    box(5.2, 1.6, .5, 1.45, 75, [.55, .16, .2], [.72, .22, .22], 2);
    box(1.55, 1.25, 1.5, .95, 150, [.68, .47, .27], [.5, .32, .18], 3);                            // table, wood grain
    ring(1.2, 1.72, .26, 40, [.24, .42, .78], 4); ring(3.4, 1.72, .26, 40, [.24, .42, .78], 4);     // chairs
    ring(2.3, .72, .26, 40, [.3, .5, .85], 4);
    for (let i = 0; i < 70; i++) { const x = 3.8 + 1.0 * r(), y = .6 + 1.0 * r(), st = Math.floor((x + y) * 4) % 2;   // striped rug
      add(x, y, st ? [.18, .6, .6] : [.92, .88, .78], 5); }
    for (let i = 0; i < 70; i++) add(.62 + .2 * gauss(), .6 + .2 * gauss(), lerp3([.2, .5, .22], [.55, .75, .3], r()), 6);   // plant
    ring(5.45, .55, .17, 26, [.95, .78, .25], 7); add(5.45, .55, [1, .9, .4], 7);                   // lamp
    for (let i = 0; i < 70; i++) add(.15 + 5.7 * r(), .15 + 3.7 * r(), [.86, .85, .82], 8);       // floor
    const seen = new Map();
    for (const [x, y, col, obj] of raw) {
      if (x < 0 || y < 0 || x >= NX || y >= NY) continue;
      const k = Math.floor(x * LAT) + "," + Math.floor(y * LAT);
      if (!seen.has(k)) seen.set(k, { x, y, col, obj });
    }
    pts = [...seen.values()];
    const map = new Map(); toks = [];
    pts.forEach((p, i) => {
      const k = Math.floor(p.x) + "," + Math.floor(p.y);
      if (!map.has(k)) { map.set(k, toks.length); toks.push({ ix: Math.floor(p.x), iy: Math.floor(p.y), idx: [] }); }
      p.t = map.get(k); toks[p.t].idx.push(i);
    });
    for (const t of toks) {
      t.mu = [0, 0]; t.idx.forEach(i => { t.mu[0] += pts[i].x / t.idx.length; t.mu[1] += pts[i].y / t.idx.length; });
      t.objs = new Set(t.idx.map(i => pts[i].obj)).size;
    }
    pts.forEach(p => { const mu = toks[p.t].mu; p.u = [p.x - mu[0], p.y - mu[1]]; });
  }

  // ---------- waves, projection
  let OM = [], Wp = [], seedW = 3;
  function waves() {
    const r = rng(seedW * 131 + 5), a0 = r() * Math.PI;
    OM = Array.from({ length: M }, (_, m) => {
      const mag = Math.PI * (1.1 + 1.9 * m / (M - 1)) * (0.85 + 0.3 * r()), a = a0 + m * Math.PI * (3 - Math.sqrt(5)) + 0.4 * (r() - .5);
      return [mag * Math.cos(a), mag * Math.sin(a)];
    });
  }
  { const r = rng(42), g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
    Wp = Array.from({ length: D }, () => Array.from({ length: 4 * B + 1 }, () => g() * 1.6 / Math.sqrt(4 * B + 1))); }
  // phi in the paper's column order: 1, c1, s1, c2, s2, ...
  const phi = u => { const v = [1]; OM.forEach(o => { const t = o[0] * u[0] + o[1] * u[1]; v.push(Math.cos(t), Math.sin(t)); }); return v; };
  const xt = p => [...p.col, 1];

  const st = { tok: 0, hl: -1, k: null, playing: 0 };
  function pooled(t, k) {
    const idx = toks[t].idx, n = k == null ? idx.length : Math.max(1, k);
    const S = [0, 1, 2, 3].map(() => new Array(B).fill(0));
    for (let j = 0; j < n && j < idx.length; j++) { const p = pts[idx[j]], f = phi(p.u), x = xt(p); for (let a = 0; a < 4; a++) for (let b = 0; b < B; b++) S[a][b] += x[a] * f[b] / n; }
    const z = [...S.flat(), Math.log(n)], h = Wp.map(row => Math.tanh(row.reduce((s, w, j) => s + w * z[j], 0)));
    return { S, h, n };
  }

  // ---------- drawing helpers
  let scale = 1;
  function size() {
    const w = cv.clientWidth, dpr = window.devicePixelRatio || 1;
    scale = w / W; cv.style.height = Math.round(H * scale) + "px";
    cv.width = Math.round(w * dpr); cv.height = Math.round(H * scale * dpr);
  }
  let C = {};
  function colors() { C = { ink: css("--ink"), muted: css("--muted"), faint: css("--faint"), rule: css("--rule"), soft: css("--soft"), amber: css("--amber"), acc: css("--accent"), bl: hex(css("--accent")), am: hex(css("--amber")) }; }
  const div = (v, a = 1) => `rgb(${lerp([255, 255, 255], v >= 0 ? C.bl : C.am, Math.min(1, Math.abs(v)) * a)})`;
  const rgb = c => `rgb(${c.map(v => Math.round(v * 255)).join(",")})`;
  function text(s, x, y, o = {}) {
    ctx.font = o.font || "500 13px IBM Plex Sans, sans-serif"; ctx.fillStyle = o.color || C.muted;
    ctx.textAlign = o.align || "center"; ctx.textBaseline = o.base || "alphabetic"; ctx.fillText(s, x, y);
  }
  const sym = (s, x, y, sub, o = {}) => {        // italic symbol with a subscript, centred at x
    ctx.font = "italic 500 15px Newsreader, Georgia, serif"; const w1 = ctx.measureText(s).width;
    ctx.font = "italic 500 11px Newsreader, Georgia, serif"; const w2 = sub ? ctx.measureText(sub).width : 0;
    const x0 = x - (w1 + w2) / 2;
    text(s, x0, y, { font: "italic 500 15px Newsreader, Georgia, serif", color: o.color || C.ink, align: "left" });
    if (sub) text(sub, x0 + w1 + 1, y + 4, { font: "italic 500 11px Newsreader, Georgia, serif", color: o.color || C.ink, align: "left" });
  };
  function arrow(x0, y0, x1, y1, label) {
    ctx.strokeStyle = C.faint; ctx.fillStyle = C.faint; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - 6, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 7, y1 - 4); ctx.lineTo(x1 - 7, y1 + 4); ctx.closePath(); ctx.fill();
    if (label) sym(label, (x0 + x1) / 2, y0 - 8);
  }

  // wave backgrounds of the cell (cos / sin of each wave around the centroid): cached per token, wave and row
  const fields = new Map();
  function field(t, m, row) {
    const key = t + "," + m + "," + row;
    if (fields.has(key)) return fields.get(key);
    const N = 40, c = document.createElement("canvas"); c.width = c.height = N;
    const g = c.getContext("2d"), img = g.createImageData(N, N), tk = toks[t], o = OM[m], f = row ? Math.sin : Math.cos;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = [tk.ix + (i + .5) / N - tk.mu[0], tk.iy + 1 - (j + .5) / N - tk.mu[1]], v = f(o[0] * u[0] + o[1] * u[1]);
      img.data.set([...lerp([255, 255, 255], v >= 0 ? C.bl : C.am, Math.min(1, Math.abs(v)) * .55), 255], 4 * (j * N + i));
    }
    g.putImageData(img, 0, 0); fields.set(key, c); return c;
  }

  // which points count as "added" (accumulate animation)
  const added = j => st.k == null || j < st.k;
  const curPt = () => st.k != null && st.k > 0 ? toks[st.tok].idx[Math.min(st.k, toks[st.tok].idx.length) - 1] : st.hl;

  let queued = 0;
  function draw() { if (!queued) queued = requestAnimationFrame(() => { queued = 0; paint(); }); }
  function paint() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0); ctx.clearRect(0, 0, W, H);
    const t = toks[st.tok], cur = curPt();

    // ---- A: scene
    const A = L.scene, ax = i => A.x + i * A.c, ay = j => A.y + (NY - j) * A.c;
    text("scene: points p with RGB colour features x, one token per grid cell", A.x + NX * A.c / 2, 22);
    ctx.fillStyle = "#fff"; ctx.fillRect(A.x, A.y, NX * A.c, NY * A.c);
    ctx.strokeStyle = C.rule; ctx.lineWidth = 1;
    for (let i = 0; i <= NX; i++) { ctx.beginPath(); ctx.moveTo(ax(i), ay(0)); ctx.lineTo(ax(i), ay(NY)); ctx.stroke(); }
    for (let j = 0; j <= NY; j++) { ctx.beginPath(); ctx.moveTo(ax(0), ay(j)); ctx.lineTo(ax(NX), ay(j)); ctx.stroke(); }
    pts.forEach(p => { ctx.fillStyle = rgb(p.col); ctx.globalAlpha = p.t === st.tok ? 1 : .75; ctx.fillRect(A.x + p.x * A.c - 1.4, A.y + (NY - p.y) * A.c - 1.4, 2.8, 2.8); });
    ctx.globalAlpha = 1;
    const sx = ax(t.ix), sy = ay(t.iy + 1);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, A.c, A.c);
    // zoom lines to the cell view
    const Cl = L.cell;
    ctx.strokeStyle = C.rule; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(sx, sy + A.c); ctx.lineTo(Cl.x, Cl.y); ctx.moveTo(sx + A.c, sy + A.c); ctx.lineTo(Cl.x + Cl.s, Cl.y); ctx.stroke();

    // ---- B: the cell, centroid, offset
    const cx = u => Cl.x + (u - t.ix) * Cl.s, cy = v => Cl.y + (t.iy + 1 - v) * Cl.s;
    ctx.fillStyle = "#fff"; ctx.fillRect(Cl.x, Cl.y, Cl.s, Cl.s);
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1.2; ctx.strokeRect(Cl.x + .5, Cl.y + .5, Cl.s - 1, Cl.s - 1);
    text(`token t: n = ${t.idx.length} points`, Cl.x + Cl.s / 2, Cl.y - 10);
    const mx = cx(t.mu[0]), my = cy(t.mu[1]);
    if (cur >= 0 && pts[cur].t === st.tok) {
      const p = pts[cur]; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(cx(p.x), cy(p.y)); ctx.stroke();
      sym("u", (mx + cx(p.x)) / 2 + 9, (my + cy(p.y)) / 2 - 4, "c");
    }
    t.idx.forEach((i, j) => {
      const p = pts[i]; ctx.globalAlpha = added(j) ? 1 : .25;
      ctx.beginPath(); ctx.arc(cx(p.x), cy(p.y), i === cur ? 6 : 4.2, 0, 7); ctx.fillStyle = rgb(p.col); ctx.fill();
      ctx.lineWidth = i === cur ? 2 : .7; ctx.strokeStyle = C.ink; ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(mx - 7, my); ctx.lineTo(mx + 7, my); ctx.moveTo(mx, my - 7); ctx.lineTo(mx, my + 7); ctx.stroke();
    sym("μ", mx + 13, my + 16, "t");
    arrow(Cl.x + Cl.s + 6, Cl.y + Cl.s / 2, L.waves.x - 6, Cl.y + Cl.s / 2);

    // ---- C: waves, cos / sin rows, points coloured by the value they sample
    const Wv = L.waves, N = 40;
    for (let m = 0; m < M; m++) {
      const o = OM[m], x0 = Wv.x + m * (Wv.s + Wv.g);
      sym("ω", x0 + Wv.s / 2, Wv.y - 10, String(m + 1));
      for (let r = 0; r < 2; r++) {
        const y0 = Wv.y + r * (Wv.s + Wv.g), f = r ? Math.sin : Math.cos;
        ctx.imageSmoothingEnabled = true; ctx.drawImage(field(st.tok, m, r), x0, y0, Wv.s, Wv.s);
        t.idx.forEach((i, j) => {
          const p = pts[i], v = f(o[0] * p.u[0] + o[1] * p.u[1]);
          ctx.globalAlpha = added(j) ? 1 : .2;
          ctx.beginPath(); ctx.arc(x0 + (p.x - t.ix) * Wv.s, y0 + (t.iy + 1 - p.y) * Wv.s, i === cur ? 4 : 2.6, 0, 7);
          ctx.fillStyle = div(v); ctx.fill(); ctx.lineWidth = i === cur ? 1.6 : .5; ctx.strokeStyle = C.ink; ctx.stroke();
        });
        ctx.globalAlpha = 1; ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.strokeRect(x0 + .5, y0 + .5, Wv.s - 1, Wv.s - 1);
        if (m === 0) text(r ? "sin" : "cos", x0 - 5, y0 + Wv.s / 2 + 4, { align: "right", font: "500 11.5px IBM Plex Sans, sans-serif" });
      }
    }
    const wy = Cl.y + Cl.s / 2;
    arrow(Wv.x + M * (Wv.s + Wv.g) + 4, wy, L.S.x - 20, wy);

    // ---- D: S_t
    const Sx = L.S, r = pooled(st.tok, st.k), step = Sx.c + Sx.g;
    let vmax = 1e-6; r.S.forEach(row => row.forEach(v => { vmax = Math.max(vmax, Math.abs(v)); }));
    sym("S", Sx.x + B * step / 2, Sx.y - 14, "t");
    r.S.forEach((row, a) => row.forEach((v, b) => {
      ctx.fillStyle = div(Math.sign(v) * Math.sqrt(Math.abs(v) / vmax));
      ctx.fillRect(Sx.x + b * step, Sx.y + a * step, Sx.c, Sx.c);
      ctx.strokeStyle = C.muted; ctx.lineWidth = .8; ctx.strokeRect(Sx.x + b * step + .4, Sx.y + a * step + .4, Sx.c - .8, Sx.c - .8);
    }));
    ["R", "G", "B", "1"].forEach((l, a) => text(l, Sx.x - 8, Sx.y + a * step + Sx.c / 2 + 4, { align: "right", font: "500 12px IBM Plex Sans, sans-serif" }));
    ["1", ...Array.from({ length: M }, (_, m) => ["c" + (m + 1), "s" + (m + 1)]).flat()].forEach((l, b) =>
      text(l, Sx.x + b * step + Sx.c / 2, Sx.y + 4 * step + 13, { font: "500 11.5px IBM Plex Sans, sans-serif" }));

    // ---- E: token h_t
    const T = L.tok;
    arrow(Sx.x + B * step + 8, wy, T.x - 8, wy, "W");
    sym("h", T.x + T.w / 2, T.y - 10, "t");
    r.h.forEach((v, i) => { ctx.fillStyle = div(v); ctx.fillRect(T.x, T.y + i * T.c, T.w, T.c - 1); });
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.strokeRect(T.x + .5, T.y + .5, T.w - 1, D * T.c - 1);
  }

  // ---------- interaction
  const loc = e => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) / scale, (e.clientY - b.top) / scale]; };
  function pointAt(x, y) {
    const t = toks[st.tok]; let best = -1, bd = 9;
    const views = [[L.cell.x, L.cell.y, L.cell.s]];
    for (let m = 0; m < M; m++) for (let r = 0; r < 2; r++) views.push([L.waves.x + m * (L.waves.s + L.waves.g), L.waves.y + r * (L.waves.s + L.waves.g), L.waves.s]);
    for (const [x0, y0, s] of views) {
      if (x < x0 - 6 || x > x0 + s + 6 || y < y0 - 6 || y > y0 + s + 6) continue;
      t.idx.forEach(i => { const p = pts[i], d = Math.hypot(x0 + (p.x - t.ix) * s - x, y0 + (t.iy + 1 - p.y) * s - y); if (d < bd) { bd = d; best = i; } });
    }
    return best;
  }
  cv.addEventListener("pointermove", e => {
    const [x, y] = loc(e), A = L.scene;
    const inScene = x >= A.x && x < A.x + NX * A.c && y >= A.y && y < A.y + NY * A.c;
    const hasTok = inScene && toks.some(t => t.ix === Math.floor((x - A.x) / A.c) && t.iy === NY - 1 - Math.floor((y - A.y) / A.c));
    cv.style.cursor = hasTok ? "pointer" : "default";
    if (st.playing) return;
    const p = pointAt(x, y); if (p !== st.hl) { st.hl = p; draw(); }
  });
  cv.addEventListener("click", e => {
    const [x, y] = loc(e), A = L.scene;
    const ix = Math.floor((x - A.x) / A.c), iy = NY - 1 - Math.floor((y - A.y) / A.c);
    const k = toks.findIndex(t => t.ix === ix && t.iy === iy);
    if (x >= A.x && k >= 0) { st.tok = k; st.hl = -1; draw(); }
  });
  document.getElementById("pw-waves").addEventListener("click", () => { seedW++; waves(); fields.clear(); draw(); });

  build(); waves(); colors();
  // default token: the cell with the most different objects (then the most points)
  st.tok = toks.reduce((b, t, i) => (t.objs > toks[b].objs || (t.objs === toks[b].objs && t.idx.length > toks[b].idx.length)) ? i : b, 0);
  size(); draw();
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { size(); draw(); }, 100); });
  if (document.fonts) document.fonts.ready.then(draw);
})();
