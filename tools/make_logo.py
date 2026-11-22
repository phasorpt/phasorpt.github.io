"""PhasorPT logo: a phasor e^{iθ} on the unit circle. A ring of points coloured by the cosine of their phase (blue +,
amber -), the phasor as a glowing amber hand, its cosine projected onto the axis in blue, on a dark navy square.

    python website/tools/make_logo.py      # writes assets/img/logo.svg (org avatar, full bleed) and favicon.svg
    inkscape website/assets/img/logo.svg --export-type=png --export-filename=website/assets/img/logo.png --export-width=500
"""
import math
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "img")
BLUE, AMBER, DIM = (111, 163, 242), (240, 180, 94), (44, 57, 79)
NAVY_IN, NAVY_OUT, LIGHT = "#1d2a3f", "#0d1420", "#e9eef6"


def mix(a, b, t):
    return "#%02x%02x%02x" % tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def logo(size, n, ring, dot, dot_var, hand_w, tip, hub, glow, proj_w, radius=0):
    c = size / 2
    ang = math.radians(36)
    tx, ty = c + ring * math.cos(ang), c - ring * math.sin(ang)
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">',
         '<defs><radialGradient id="bg" cx="50%" cy="45%" r="60%">'
         f'<stop offset="0" stop-color="{NAVY_IN}"/><stop offset="1" stop-color="{NAVY_OUT}"/></radialGradient>'
         f'<filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="{glow}"/></filter></defs>',
         f'<rect width="{size}" height="{size}" rx="{radius}" fill="url(#bg)"/>']
    for k in range(n):                       # the ring: each point coloured by cos of its phase
        a = 2 * math.pi * k / n
        v = math.cos(a)
        x, y = c + ring * math.cos(a), c - ring * math.sin(a)
        col = mix(DIM, BLUE if v >= 0 else AMBER, min(1, abs(v)) ** 0.8)
        s.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{dot + dot_var * abs(v):.2f}" fill="{col}"/>')
    amber = mix(AMBER, AMBER, 0)
    s.append(f'<circle cx="{tx:.2f}" cy="{ty:.2f}" r="{tip * 1.6:.2f}" fill="{amber}" opacity=".6" filter="url(#glow)"/>')
    s.append(f'<line x1="{c}" y1="{c}" x2="{tx:.2f}" y2="{c}" stroke="{mix(BLUE, BLUE, 0)}" stroke-width="{proj_w}" stroke-linecap="round"/>')
    s.append(f'<line x1="{c}" y1="{c}" x2="{tx:.2f}" y2="{ty:.2f}" stroke="{amber}" stroke-width="{hand_w}" stroke-linecap="round"/>')
    s.append(f'<circle cx="{tx:.2f}" cy="{ty:.2f}" r="{tip}" fill="{amber}"/>')
    s.append(f'<circle cx="{c}" cy="{c}" r="{hub}" fill="{LIGHT}"/></svg>')
    return "\n".join(s)


if __name__ == "__main__":
    # avatar: full bleed (GitHub rounds the corners itself)
    open(os.path.join(OUT, "logo.svg"), "w").write(
        logo(512, n=40, ring=170, dot=7, dot_var=5.5, hand_w=24, tip=24, hub=16, glow=11, proj_w=12))
    # favicon: fewer, larger points so it reads at 16-32 px; rounded corners
    open(os.path.join(OUT, "favicon.svg"), "w").write(
        logo(64, n=12, ring=21, dot=2.6, dot_var=1.4, hand_w=5, tip=4.2, hub=3.2, glow=2.2, proj_w=3.2, radius=12))
    print("wrote", os.path.join(OUT, "logo.svg"), "and favicon.svg")
