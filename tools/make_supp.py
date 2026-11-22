"""The supplementary material as one zip: the supplement PDF, the code release, and an offline, anonymous copy of the
project page, with a README at the root that explains the three.

    python website/tools/make_supp.py                                  # -> paper/build_supp/supplementary.zip
    python website/tools/make_supp.py --paper-id 1234                  # PDF in the zip: 1234_PhasorPT_CVPR2027_supplementary.pdf
    python website/tools/make_supp.py --pdf paper/build/supp.pdf --release release/phasorpt-code --out paper/build_supp

Code: the files tracked in the release repo (git ls-files: no data / exp / weights links, no build output), without
symlinks; the script fails if any file contains an identifying string.

The copy loads nothing from the internet (fonts and three.js are vendored in assets/), so reviewers can open it with a
local static server: the 3D viewer and the live demo need http (fetch, workers) and the demo needs WebGPU, which
browsers only allow on https or localhost. Changes against the website:
- no link buttons (paper / code / weights) and no outgoing links;
- without the dev files: tools/, the git metadata, README.md, .nojekyll, unused images;
- a README.txt with the instructions, also in the zip root.
CVPR limits the supplementary file to 100 MB; the script prints the size and fails above it.
"""
import argparse
import os
import re
import shutil
import zipfile

SITE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
REPO = os.path.dirname(SITE)
PAGE = "project_page"
CODE = "code"
IDENTIFYING = [b"phasorpt.github", b"github.com/phasorpt"] + ([s.encode() for s in open(_ID).read().split()] if os.path.exists(_ID := os.path.join(SITE, "tools", ".identifying")) else [])
LIMIT_MB = 100
SKIP_DIRS = {".git", "tools"}
SKIP_FILES = {"README.md", ".nojekyll", ".gitignore", "assets/img/pooling.svg", "assets/img/logo.svg", "assets/img/logo.png"}

README = """PhasorPT project page (offline copy)
=====================================

This folder is the project page of the submission, with its interactive figures, the 3D viewer of the qualitative
results, and the live demo, which runs PhasorPT in the browser (Rust + Burn compiled to WebAssembly, on WebGPU).
Everything is included; nothing is loaded from the internet.

How to open it
--------------
The page has to be served over http from localhost (the browser does not run the 3D viewer and the demo from a
file:// URL, and WebGPU is only available on localhost or https). With Python 3, from this folder:

    python3 -m http.server 8000

then open http://localhost:8000 in the browser. Any other static file server works too.

Browser
-------
- Interactive figures and 3D viewer: any current browser.
- Live demo: a browser with WebGPU, e.g. a recent Chrome or Edge (Firefox cannot run it yet). It downloads nothing
  until "Start the demo" is clicked, then loads the model from this folder (about 77 MB) and segments a ScanNet
  validation scene on the local GPU. The first run includes the compilation of the GPU kernels; "Run again" shows
  the warm time. A dedicated GPU helps; on laptops, the browser may pick the integrated one.

Contents
--------
index.html          the page
assets/             styles, scripts, figures, fonts, three.js, and the point clouds of the 3D viewer
demo/               the live demo: WebAssembly module, model (config + fp16 weights), worker, sample scene
"""


ROOT_README = """Supplementary material
======================

Contents
--------
{pdf}
                  the supplementary document (analyses, derivations, additional results, implementation details)
code/             the code of PhasorPT, based on Pointcept: model, configs of all reported runs, training and
                  evaluation, data pipelines, the Volt baseline, and the logs of the reported runs
project_page/     the project page (offline copy): interactive figures, 3D viewer of the qualitative results,
                  and a live demo that runs PhasorPT in the browser
README.txt        this file


code/
-----
See code/README.md: installation, data preparation, training and testing, the config of every result in the
paper (main results, ablations, Volt baseline), and how to reproduce the data pipelines. The model itself is
code/pointcept/models/phasorpt/; the training and test logs of the reported runs are in code/logs/ (see
code/logs/README.md). Datasets and checkpoints are not included.


project_page/
-------------
The page loads nothing from the internet. It has to be served over http from localhost (the browser does not
run the 3D viewer and the demo from a file:// URL, and WebGPU is only available on localhost or https).
With Python 3:

    cd project_page
    python3 -m http.server 8000

then open http://localhost:8000 in the browser. Any other static file server works too.

- Interactive figures and 3D viewer: any current browser.
- Live demo: a browser with WebGPU, e.g. a recent Chrome or Edge (Firefox cannot run it yet). It loads nothing
  until "Start the demo" is clicked, then reads the model from project_page/demo (about 77 MB) and segments a
  ScanNet validation scene on the local GPU. The first run includes the compilation of the GPU kernels; "Run
  again" shows the warm time. A dedicated GPU helps; on laptops, the browser may pick the integrated one.

Contents of project_page/: index.html (the page), assets/ (styles, scripts, figures, fonts, three.js, point
clouds of the 3D viewer), demo/ (WebAssembly module, model config and fp16 weights, worker, sample scene).
"""


def review_html(s):
    """the page as submitted: no link buttons, no outgoing links"""
    s, n = re.subn(r'\s*<div class="links">.*?</div>\s*<p class="links-note">.*?</p>', "", s, count=1, flags=re.S)
    assert n == 1, "link buttons not found"
    s = re.sub(r'<a href="https?://[^"]*"[^>]*>(.*?)</a>', r"\1", s)        # external links -> their text
    assert "https://" not in s.replace("http://www.w3.org", ""), "external URL left in index.html"
    return s


def copy_site(dst):
    if os.path.exists(dst):
        shutil.rmtree(dst)
    for root, dirs, files in os.walk(SITE):
        rel = os.path.relpath(root, SITE)
        dirs[:] = [d for d in dirs if not (rel == "." and d in SKIP_DIRS)]
        for f in files:
            r = os.path.normpath(os.path.join(rel, f))
            if r in SKIP_FILES:
                continue
            os.makedirs(os.path.join(dst, rel), exist_ok=True)
            shutil.copy2(os.path.join(root, f), os.path.join(dst, r))
    p = os.path.join(dst, "index.html")
    html = review_html(open(p).read())           # read before opening for writing (that truncates the file)
    open(p, "w").write(html)
    open(os.path.join(dst, "README.txt"), "w").write(README)
    # nothing in the copy may reach out to the internet
    for root, _, files in os.walk(dst):
        for f in files:
            if f.endswith((".html", ".js", ".css")):
                txt = open(os.path.join(root, f), errors="ignore").read()
                hits = [u for u in re.findall(r"https?://[\w.-]+", txt)
                        if not re.match(r"https?://(www\.w3\.org|localhost|127\.0\.0\.1)", u)]
                if hits and "vendor" not in root:
                    raise SystemExit(f"external URL in {os.path.join(root, f)}: {sorted(set(hits))}")


def add_code(z, release):
    """the tracked files of the release repo under code/, without symlinks; fails on identifying strings"""
    import subprocess
    if subprocess.run(["git", "-C", release, "status", "--porcelain"], capture_output=True, text=True).stdout.strip():
        raise SystemExit(f"{release} has uncommitted changes: commit them (python tools/sync_release.py first)")
    files = subprocess.run(["git", "-C", release, "ls-files", "-z"], capture_output=True, check=True).stdout.decode().split("\0")
    n = 0
    for f in sorted(x for x in files if x):
        full = os.path.join(release, f)
        if os.path.islink(full) or not os.path.isfile(full):
            continue
        data = open(full, "rb").read()
        hits = [p.decode() for p in IDENTIFYING if p in data]
        if hits:
            raise SystemExit(f"identifying string {hits} in {full}")
        z.writestr(zipfile.ZipInfo.from_file(full, f"{CODE}/{f}"), data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        n += 1
    print(f"{CODE}/: {n} files from {release}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", default=os.path.join(REPO, "paper", "build", "supp.pdf"), help="supplement PDF ('' to leave out)")
    ap.add_argument("--paper-id", default="", help="CVPR submission number, prefixed to the PDF name in the zip")
    ap.add_argument("--release", default=os.path.join(REPO, "release", "phasorpt-code"), help="code release repo ('' to leave out)")
    ap.add_argument("--out", default=os.path.join(REPO, "paper", "build_supp"))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    page = os.path.join(args.out, PAGE)
    copy_site(page)
    zpath = os.path.join(args.out, "supplementary.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        if args.pdf:
            pdf_name = (f"{args.paper_id}_" if args.paper_id else "") + "PhasorPT_CVPR2027_supplementary.pdf"
            z.write(args.pdf, pdf_name)
        z.writestr("README.txt", ROOT_README.format(pdf=pdf_name) if args.pdf else README)
        if args.release:
            add_code(z, args.release)
        for root, _, files in os.walk(page):
            for f in sorted(files):
                full = os.path.join(root, f)
                z.write(full, os.path.join(PAGE, os.path.relpath(full, page)))
    mb = os.path.getsize(zpath) / 1e6
    print(f"{page}\n{zpath}: {mb:.1f} MB (limit {LIMIT_MB} MB)")
    if mb > LIMIT_MB:
        raise SystemExit("too large for the supplementary material")


if __name__ == "__main__":
    main()
