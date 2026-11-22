"""Web versions of the paper figures, in the page's palette: gray blocks, amber = phasor operators, blue = attention.

    python website/tools/make_web_figures.py      # writes website/assets/img/{overview,vo_attention,pooling}.svg

overview / vo_attention: the Unicode previews of paper/figures, recoloured (the page sets their font by CSS).
pooling: paper/figures/make_planewave_fig.py re-run without LaTeX, with plain-word labels, SVG text kept as text.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
FIGS = os.path.join(REPO, "paper", "figures")
OUT = os.path.join(REPO, "website", "assets", "img")

GRAY, LIGHT, ICON = "#E3E6EB", "#EEF0F3", "#5C6575"
AMBER, AMBER_ICON, AMBER_PALE = "#F6DFB8", "#C77A12", "#FBF0DD"
BLUE, BLUE_ICON, BLUE_PALE = "#CBDDF6", "#2F6FD0", "#E4EDFA"
COMMON = {"#B9E3A0": GRAY, "#4F8A2E": ICON,            # linear
          "#D6D6D6": LIGHT, "#4A4A4A": ICON,           # norm
          "#F2B6CC": BLUE, "#B8457A": BLUE_ICON, "#F7DDE7": BLUE_PALE,   # attention
          "#C7DAEE": BLUE, "#3E6A99": BLUE_ICON,       # heads
          "#BCE3DE": GRAY, "#2A7A70": ICON, "#DDF1EE": "#F3F4F6",       # FFN block
          "#F9D9A6": AMBER, "#B9771A": AMBER_ICON, "#FCEBD0": AMBER_PALE,  # phasor pooling / waves
          "#000000": "#141A26"}
PER_FILE = {
    # vo_attention: the purple pills are the value / output rotations, the phasor part -> amber
    # (the q / k RoPE pills share the purple: set back to gray below, so only the value path is highlighted);
    # the attention itself is plain RoPE attention -> gray as well
    "vo_attention": {"#CDC3EC": AMBER, "#6550A8": AMBER_ICON, "#F2B6CC": "#D9DDE3", "#B8457A": ICON, "#F7DDE7": "#EEF0F3"},
    # overview: purple = max pooling / linear unpooling, plain operators -> gray
    "overview": {"#CDC3EC": GRAY, "#6550A8": ICON, "#E4DEF4": "#F3F4F6"},
}
SUB = '<tspan baseline-shift="sub" font-size="72%">{}</tspan>'
SUB_I = '<tspan baseline-shift="sub" font-size="72%" font-style="italic">{}</tspan>'   # italic index (n, m)


def recolor(name):
    s = open(os.path.join(FIGS, f"{name}_preview.svg")).read()
    table = {**COMMON, **PER_FILE[name]}
    s = re.sub(r"#[0-9A-Fa-f]{6}\b", lambda m: table.get(m.group(0).upper(), m.group(0)), s)
    # plain-text subscripts of the preview ('R_Ω(p_m)', 'u_c') -> tspans
    s = re.sub(r"R_Ω\(p_(\w)\)", lambda m: "R" + SUB.format("Ω") + '(<tspan font-style="italic">p</tspan>' + SUB_I.format(m.group(1)) + ")", s)
    # positions as on the rest of the page: italic p, not the paper's bold vector
    s = s.replace('<tspan font-weight="bold">p</tspan>', '<tspan font-style="italic">p</tspan>')
    s = re.sub(r">u_c<", ">u" + SUB.format("c") + "<", s)
    s = s.replace("φ(u_c)", "φ(u" + SUB.format("c") + ")")
    if name == "vo_attention":   # q / k: plain 3D RoPE -> gray; only the value / output rotations stay amber
        for gid, nxt in (("rot-q", "linear-k"), ("rot-k", "linear-v")):
            i, j = s.index(f'<g id="{gid}"'), s.index(f'<g id="{nxt}"')
            s = s[:i] + s[i:j].replace(AMBER, LIGHT).replace(AMBER_ICON, ICON) + s[j:]
    s = re.sub(r'<svg ([^>]*?)width="[\d.]+" height="[\d.]+"', r'<svg \1', s, count=1)   # scale with the page
    with open(os.path.join(OUT, f"{name}.svg"), "w") as f:
        f.write(s)
    print(os.path.join(OUT, f"{name}.svg"))


def pooling():
    src = open(os.path.join(FIGS, "make_planewave_fig.py")).read()
    rep = [
        ('"text.usetex": True, "font.family": "serif", "font.size": 7,',
         '"text.usetex": False, "font.family": "sans-serif", "font.sans-serif": ["IBM Plex Sans", "DejaVu Sans"], '
         '"font.size": 7, "svg.fonttype": "none", "mathtext.default": "regular",'),
        ('"text.latex.preamble": r"\\usepackage{times}\\usepackage{amsmath}"', '"text.latex.preamble": ""'),
        ('["#B8457A", "#F2B6CC", "#FFFFFF", "#B9E3A0", "#4F8A2E"]', '["#C77A12", "#F3D7A8", "#FFFFFF", "#BCD3F3", "#2F6FD0"]'),
        ('GRAY = "#3D3D3D"', 'GRAY = "#5C6575"'),
        ('r"$\\mathbf{u}_c$"', 'r"$u_c$"'),
        ('r"$\\boldsymbol{\\mu}_t$"', 'r"$\\mu$"'),
        ('r"points $x_c$, cell $t$"', '"one token"'),
        ('rf"$\\boldsymbol{{\\omega}}_{m + 1}^\\top \\mathbf{{u}}$"', 'f"wave {m + 1}"'),
        ('r"$\\cos$"', '"cos"'), ('r"$\\sin$"', '"sin"'),
        ('r"waves $\\phi(\\mathbf{u}_c)$"', '""'),
        ('[r"$\\mathrm{R}$", r"$\\mathrm{G}$", r"$\\mathrm{B}$", r"$1$"]', '["R", "G", "B", "1"]'),
        ('[r"$1$", r"$c_1$", r"$s_1$", r"$c_2$", r"$s_2$"]', '["1", "c1", "s1", "c2", "s2"]'),
        ('r"$S_t$"', '"mean"'),
        ('r"$\\frac{1}{n_t} \\sum\\nolimits_{c \\in t} \\tilde{x}_c \\otimes \\phi(\\mathbf{u}_c)$"', '""'),
        ('r"$h_t$"', '"token"'),
        ('r"$W$"', '"linear"'),
        ('fig.savefig("planewave.pdf", pad_inches=0.01)', f'fig.savefig({os.path.join(OUT, "pooling.svg")!r}, pad_inches=0.02, bbox_inches=\"tight\", transparent=True)'),
        ('fig.savefig("planewave_preview.png", dpi=300, pad_inches=0.01)', ''),
        ('print("planewave.pdf")', f'print({os.path.join(OUT, "pooling.svg")!r})'),
    ]
    for a, b in rep:
        assert a in src, a
        src = src.replace(a, b)
    cwd = os.getcwd()
    os.chdir(FIGS)
    try:
        exec(compile(src, "make_planewave_fig.py (web)", "exec"), {"__name__": "__main__"})
    finally:
        os.chdir(cwd)
    p = os.path.join(OUT, "pooling.svg")
    s = open(p).read()
    s = re.sub(r'<svg ([^>]*?)width="[\d.]+pt" height="[\d.]+pt"', r'<svg \1', s, count=1)
    open(p, "w").write(s)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    recolor("overview")
    recolor("vo_attention")
    pooling()
