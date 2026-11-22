// Results: ScanNet mIoU over parameters (as the paper's teaser) and the component ablation as bars.
(function () {
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };

  // ---------- scatter ----------
  const svg = document.getElementById("scatter"), tip = document.getElementById("scatter-tip"), card = document.getElementById("scatter-card");
  // [name, params (M), mIoU, mIoU with CNN teacher or null, conv-free, ours]
  const DATA = [
    ["PTv3", 46.2, 77.5, null, false], ["OA-CNNs", 51.5, 76.1, null, false], ["LitePT-S", 12.7, 76.5, null, false],
    ["PTX", 9.6, 76.5, null, true], ["Volt-S", 23.7, 76.4, 77.2, true], ["PhasorPT", 22.6, 77.5, 78.3, true, true]];
  function drawScatter() {
    if (!svg) return;
    svg.innerHTML = "";
    const W = 520, H = 360, L = 46, Rr = 14, T = 30, B = 38, x0 = 0, x1 = 56, y0 = 75.9, y1 = 78.6;
    const X = v => L + (v - x0) / (x1 - x0) * (W - L - Rr), Y = v => T + (y1 - v) / (y1 - y0) * (H - T - B);
    const rule = css("--rule"), muted = css("--muted"), acc = css("--accent"), amb = css("--amber"), ink = css("--ink"), panel = css("--panel");
    for (let v = 76; v <= 78.5; v += 0.5) {
      el("line", { x1: L, x2: W - Rr, y1: Y(v), y2: Y(v), stroke: rule, "stroke-width": 1, "stroke-dasharray": "2 4" }, svg);
      el("text", { x: L - 8, y: Y(v) + 4, "text-anchor": "end", "font-size": 11 }, svg).textContent = v.toFixed(1);
    }
    for (let v = 0; v <= 50; v += 10) el("text", { x: X(v), y: H - B + 18, "text-anchor": "middle", "font-size": 11 }, svg).textContent = v;
    el("text", { x: (L + W - Rr) / 2, y: H - 4, "text-anchor": "middle", "font-size": 11.5 }, svg).textContent = "parameters (M)";
    const yl = el("text", { x: 12, y: (T + H - B) / 2, "text-anchor": "middle", "font-size": 11.5, transform: `rotate(-90 12 ${(T + H - B) / 2})` }, svg); yl.textContent = "ScanNet val mIoU";
    const defs = el("defs", {}, svg), mk = el("marker", { id: "arr", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto" }, defs);
    el("path", { d: "M1 1L9 5L1 9z", fill: muted }, mk);
    const star = (cx, cy, r) => { let d = ""; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; d += (i ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(1) + " " + (cy + rr * Math.sin(a)).toFixed(1); } return d + "Z"; };
    const show = (e, html) => { const b = card.getBoundingClientRect(), s = svg.getBoundingClientRect(); tip.innerHTML = html; tip.style.left = (e.cx / W * s.width + s.left - b.left) + "px"; tip.style.top = (e.cy / H * s.height + s.top - b.top) + "px"; tip.style.opacity = 1; };
    const hide = () => { tip.style.opacity = 0; };
    // the core message: same mIoU as PTv3 at half the parameters
    el("line", { x1: X(22.6) + 16, x2: X(46.2) - 11, y1: Y(77.5), y2: Y(77.5), stroke: acc, "stroke-width": 1.4, "stroke-dasharray": "5 4" }, svg);
    const msg = el("text", { x: (X(22.6) + X(46.2)) / 2 + 6, y: Y(77.5) - 9, "text-anchor": "middle", "font-size": 12.5, "font-weight": 600, fill: acc }, svg);
    msg.textContent = "same mIoU, ½ the parameters";
    for (const [name, p, v, vt, free, ours] of DATA) {
      const col = free ? acc : muted, g = el("g", { style: "cursor:default" }, svg);
      if (vt) el("line", { x1: X(p), x2: X(p), y1: Y(v) - (ours ? 11 : 8), y2: Y(vt) + (ours ? 13 : 9), stroke: muted, "stroke-width": 1.3, "marker-end": "url(#arr)" }, g);
      const mark = (val, teacher) => {
        const cx = X(p), cy = Y(val);
        const m = ours ? el("path", { d: star(cx, cy, 11), fill: teacher ? panel : col, stroke: col, "stroke-width": 1.8 }, g)
                       : el("circle", { cx, cy, r: 6.5, fill: teacher ? panel : col, "fill-opacity": teacher ? 1 : .85, stroke: col, "stroke-width": 1.8 }, g);
        m.addEventListener("pointerenter", () => show({ cx, cy: cy - 8 }, `<b>${name}${teacher ? " + CNN teacher" : ""}</b> · ${val.toFixed(1)} mIoU · ${p}M`));
        m.addEventListener("pointerleave", hide);
      };
      mark(v, false); if (vt) mark(vt, true);
      const lab = (val, txt, sub) => {
        const left = ours || name === "OA-CNNs", dx = left ? -15 : 13;
        const t = el("text", { x: X(p) + dx, y: Y(val) + 4, "text-anchor": left ? "end" : "start", "font-size": ours ? 12.5 : 11.5, "font-weight": ours ? 600 : 400, fill: ours ? ink : muted }, g);
        t.textContent = txt;
        if (sub) { const s = el("text", { x: X(p) + dx, y: Y(val) + 17, "text-anchor": left ? "end" : "start", "font-size": 10, fill: muted }, g); s.textContent = sub; }
      };
      if (name === "LitePT-S") lab(v - 0.12, name); else if (name === "PTX") { const t = el("text", { x: X(p) - 12, y: Y(v) + 4, "text-anchor": "end", "font-size": 11.5, fill: muted }, g); t.textContent = name; }
      else lab(v, name);
      if (vt) lab(vt, name, "+ CNN teacher");
    }
  }

  // ---------- ablation bars ----------
  // [tokenizer, positions, attention, full, geom]
  const ABL = [["voxel", "grid", "RoPE", 76.6, 74.0], ["voxel", "grid", "PA", 77.1, 75.1], ["voxel", "centroid", "PA", 77.4, 74.6],
    ["phasor", "centroid", "RoPE", 77.6, 75.1], ["phasor", "centroid", "PA", 77.5, 75.9]];
  const bars = document.getElementById("abl-bars");
  let mode = "geom";
  function drawBars(animate) {
    if (!bars) return;
    const k = mode === "geom" ? 4 : 3, [lo, hi] = mode === "geom" ? [73, 76.3] : [75.6, 77.9], base = ABL[0][k];
    if (!bars.children.length) {
      ABL.forEach((r, i) => {
        const row = document.createElement("div"); row.className = "bar-row" + (i === ABL.length - 1 ? " ours" : "");
        row.innerHTML = `<div class="lab">${i === ABL.length - 1 ? "<b>PhasorPT</b>" : ""}<div class="pills">` +
          `<span class="pill${r[0] === "phasor" ? " on" : ""}">${r[0] === "phasor" ? "phasor pooling" : "voxel embed"}</span><span class="pill${r[1] === "centroid" ? " on" : ""}">${r[1] === "centroid" ? "centroids" : "cell centres"}</span><span class="pill${r[2] === "PA" ? " on" : ""}">${r[2] === "PA" ? "phasor attn" : "RoPE"}</span></div></div>` +
          `<div class="track"><div class="fill"></div></div><div class="val"></div>`;
        bars.appendChild(row);
      });
    }
    [...bars.children].forEach((row, i) => {
      const v = ABL[i][k], d = v - base;
      row.querySelector(".fill").style.width = (animate ? 0 : Math.max(2, (v - lo) / (hi - lo) * 100)) + "%";
      row.querySelector(".val").innerHTML = `<span>${v.toFixed(1)}</span><small>${i ? (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(1) : ""}</small>`;
    });
  }
  document.querySelectorAll("[data-abl]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-abl]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); mode = b.dataset.abl; drawBars(false);
  }));

  drawScatter(); drawBars(true);
  if (bars) new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { drawBars(false); o.disconnect(); } }, { rootMargin: "0px 0px -15% 0px" }).observe(bars);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawScatter);
})();
