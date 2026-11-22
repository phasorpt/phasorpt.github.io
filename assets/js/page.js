// Shared page behaviour: inline the figure SVGs (so the page font and colours apply to them), reveal on scroll,
// active section in the nav, BibTeX copy.
(function () {
  document.querySelectorAll(".paperfig[data-src]").forEach(async fig => {
    try {
      const txt = await (await fetch(fig.dataset.src)).text();
      const doc = new DOMParser().parseFromString(txt, "image/svg+xml"), svg = doc.documentElement;
      svg.removeAttribute("width"); svg.removeAttribute("height");
      svg.setAttribute("role", "img"); svg.setAttribute("aria-label", fig.getAttribute("aria-label") || "");
      // ids (markers, clip paths) are unique per file but not across the page: prefix them
      const pre = fig.dataset.src.replace(/\W/g, "") + "-";
      svg.querySelectorAll("[id]").forEach(el => { el.id = pre + el.id; });
      svg.querySelectorAll("*").forEach(el => {
        for (const a of ["marker-end", "marker-start", "clip-path", "mask", "fill", "href", "xlink:href"]) {
          const v = el.getAttribute(a); if (!v) continue;
          if (v.startsWith("url(#")) el.setAttribute(a, v.replace("url(#", "url(#" + pre));
          else if (v.startsWith("#") && a.includes("href")) el.setAttribute(a, "#" + pre + v.slice(1));
        }
        const st = el.getAttribute("style");
        if (st && st.includes("url(#")) el.setAttribute("style", st.replace(/url\(#/g, "url(#" + pre));
      });
      fig.appendChild(document.importNode(svg, true));
    } catch (e) { fig.innerHTML = `<img src="${fig.dataset.src}" alt="">`; }
  });

  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".reveal").forEach(el => io.observe(el));

  const links = [...document.querySelectorAll("nav.toc a[href^='#']:not(.brand)")];
  const secs = links.map(a => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  const onScroll = () => {
    const y = window.scrollY + 120; let cur = null;
    for (const s of secs) if (s.offsetTop <= y) cur = s.id;
    links.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + cur));
  };
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  const b = document.getElementById("bib-copy");
  if (b) b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(document.getElementById("bib-text").textContent); b.textContent = "Copied"; }
    catch (e) { b.textContent = "Select and copy"; }
    setTimeout(() => { b.textContent = "Copy"; }, 1600);
  });
})();

// Title background: a faint dot lattice, each dot tinted by two slowly travelling plane waves (blue where the sum is
// positive, amber where negative), faded out behind the title.
(function () {
  const cv = document.getElementById("hero-bg");
  if (!cv) return;
  const ctx = cv.getContext("2d"), still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w = 0, h = 0, dots = [], raf = 0, visible = true;
  function build() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = cv.clientWidth; h = cv.clientHeight; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sp = 15; dots = [];
    for (let y = sp / 2; y < h; y += sp) for (let x = sp / 2; x < w; x += sp) {
      // mask: transparent behind the centred title, visible towards the sides and the bottom
      // transparent behind the centred title, visible towards the sides and the bottom
      const dx = (x - w / 2) / (w * 0.36), dy = (y - h * 0.42) / (h * 0.62), r = Math.sqrt(dx * dx + dy * dy);
      const m = Math.min(1, Math.max(0, (r - 0.55) / 0.7));
      if (m > 0.02) dots.push([x, y, m]);
    }
  }
  function frame(t) {
    const s = t * 0.00012;
    ctx.clearRect(0, 0, w, h);
    const k1 = 2 * Math.PI / 340, k2 = 2 * Math.PI / 190, a1 = 0.5 + 0.2 * Math.sin(s * .7), a2 = 2.3 + 0.2 * Math.cos(s * .5);
    const w1 = [k1 * Math.cos(a1), k1 * Math.sin(a1)], w2 = [k2 * Math.cos(a2), k2 * Math.sin(a2)];
    for (const [x, y, m] of dots) {
      const v = 0.6 * Math.cos(w1[0] * x + w1[1] * y - 6 * s) + 0.4 * Math.cos(w2[0] * x + w2[1] * y + 4 * s);
      const a = (0.05 + 0.2 * Math.abs(v)) * m;
      ctx.fillStyle = v >= 0 ? `rgba(47,111,208,${a})` : `rgba(199,122,18,${a})`;
      const r = 0.9 + 0.9 * Math.abs(v);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }
  const loop = t => { frame(t); raf = visible && !still ? requestAnimationFrame(loop) : 0; };
  build(); frame(3000);
  if (!still) raf = requestAnimationFrame(loop);
  new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible && !still && !raf) raf = requestAnimationFrame(loop); }).observe(cv);
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { build(); frame(performance.now()); }, 150); });
})();
