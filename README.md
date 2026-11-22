# PhasorPT project page

Static site, no build step: `index.html`, `assets/style.css`, one script per section in `assets/js/`
(three.js 0.160 from jsdelivr for the 3D viewer). Deployable as is to GitHub Pages.

Preview locally (the viewer fetches the scenes, so it needs http, not `file://`):

    cd website && python3 -m http.server 8765    # http://localhost:8765/   (?ds=kitti / structured3d opens that dataset)

## Contents

| Section | Source |
| --- | --- |
| Shared behaviour | `assets/js/page.js` (title background waves, inlines the figure SVGs so the page font applies, nav, BibTeX copy) |
| Phasor pooling figure | `assets/js/pooling.js` (interactive version of the paper's Fig. planewave: scene grid → cell → waves → S → token, with an accumulate animation) |
| Phasor attention demo | `assets/js/attention.js` (simplified 2D VO-RoPE prototype: holes, RoPE vs. phasor values) |
| Figures | `assets/img/{vo_attention,overview}.svg` (and an unused static `pooling.svg`), written by `tools/make_web_figures.py` from the paper figures (recoloured: gray, amber = phasor ops, blue = attention) |
| Numbers | static in `index.html` and `assets/js/results.js`, copied from `paper/results.tex` (Tab. main, Tab. components) |
| 3D scenes | `assets/scenes/`, written by `tools/export_scenes.py` |
| Live demo | `assets/js/demo.js` (page UI) + `demo/` (worker, PLY reader, wasm, f16 weights, sample scene), copied by `tools/sync_demo.sh` from `rust/phasorpt-web/www`; nothing under `demo/` loads before the visitor clicks *Start the demo* (`?demo=start#demo` starts it directly) |

## 3D scenes

    python website/tools/export_scenes.py

Uses the scene choice and prediction runs of `paper/figures/make_examples_fig.py` (ScanNet and SemanticKITTI
with the CNN teacher, Structured3D without), at most 260k points per scene, ~25 MB in total, loaded on demand.

## Before publishing

- Authors, venue badge, BibTeX: anonymous placeholders.
- Paper / arXiv / Code / Weights buttons: `href="#"` with `aria-disabled="true"`; set the links and drop the attribute.
- Numbers are copied by hand; re-check them against `paper/results.tex` if the tables change.

## Live demo

    rust/phasorpt-web/build.sh            # in the parent repo: wasm + model export
    python tools/export_phasorpt.py weights ~/mnt/phasorpt_runs/vm3/pvit_d12_cnnkd_s0 --out export/phasorpt-scannet-cnnkd
    website/tools/sync_demo.sh            # copy what the page needs into website/demo (~77 MB)

The page uses the main-table ScanNet model with the CNN teacher (pvit_d12_cnnkd_s0, 78.3 mIoU); the Rust demo's own
default export (phasorpt-scannet) is the EMA self-distillation run.

The sync drops the `source` entry (local run path) from `config.json`. The wasm itself embeds the build paths of the
Rust crates (panic locations, e.g. `/home/<user>/.cargo/...`); to hide them, build with
`RUSTFLAGS="--remap-path-prefix=$HOME=~"`.

## Deploy (GitHub Pages)

This folder is its own git repository (a submodule of the paper / code repo). Push it to a GitHub repository and
enable Pages for the branch root (Settings > Pages > Deploy from a branch). `.nojekyll` makes Pages serve the files
as they are. All files are below GitHub's 100 MB limit (largest: the 45 MB weights), so no Git LFS is needed
(Pages does not serve LFS files).
