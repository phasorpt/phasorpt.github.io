#!/usr/bin/env bash
# Copy the browser demo (rust/phasorpt-web, built with its build.sh) into website/demo: the wasm module (pkg, no
# autotuning), the model (config + f16 weights), the worker and PLY reader, and the sample scene. The page's own UI
# is assets/js/demo.js; the demo's index.html / main.js (stats panel, URL options) are not used here.
#   website/tools/sync_demo.sh [path/to/phasorpt-web/www [model_dir]]
#     www default: ../rust/phasorpt-web/www (from the parent repo); model_dir (config.json + weights_f16.safetensors,
#     from tools/export_phasorpt.py) default: ../export/phasorpt-scannet-cnnkd, the main-table model with the CNN teacher
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$HERE/../rust/phasorpt-web/www}"
MODEL="${2:-$HERE/../export/phasorpt-scannet-cnnkd}"
DST="$HERE/demo"
for f in worker.js ply.js pkg/phasorpt_web.js pkg/phasorpt_web_bg.wasm scenes/scene0011_00.ply; do
  [ -f "$SRC/$f" ] || { echo "missing $SRC/$f (run rust/phasorpt-web/build.sh first)" >&2; exit 1; }
done
for f in config.json weights_f16.safetensors; do
  [ -f "$MODEL/$f" ] || { echo "missing $MODEL/$f (tools/export_phasorpt.py weights <run> --out $MODEL)" >&2; exit 1; }
done
rm -rf "$DST"; mkdir -p "$DST/pkg" "$DST/model" "$DST/scenes"
cp "$SRC/worker.js" "$SRC/ply.js" "$DST/"
cp "$SRC/pkg/phasorpt_web.js" "$SRC/pkg/phasorpt_web_bg.wasm" "$DST/pkg/"
# weights without the safetensors __metadata__ (export run directory and checkpoint: local paths); tensors unchanged
python3 - "$MODEL/weights_f16.safetensors" "$DST/model/weights_f16.safetensors" <<'PY'
import json, struct, sys
src, dst = sys.argv[1:]
with open(src, "rb") as f:
    n = struct.unpack("<Q", f.read(8))[0]; header = json.loads(f.read(n)); data = f.read()
header.pop("__metadata__", None)
h = json.dumps(header, separators=(",", ":")).encode()
h += b" " * (-len(h) % 8)                        # header padded to 8 bytes, as safetensors writes it
with open(dst, "wb") as f:
    f.write(struct.pack("<Q", len(h))); f.write(h); f.write(data)
PY
# config without its "source" entry (local run directory and checkpoint path: not for a public site)
python3 -c 'import json, sys; c = json.load(open(sys.argv[1])); c.pop("source", None); json.dump(c, open(sys.argv[2], "w"), indent=2)' \
  "$MODEL/config.json" "$DST/model/config.json"
if grep -rq "$HOME" "$DST"; then
  echo "error: local paths under $HOME left in $DST:" >&2; grep -rl "$HOME" "$DST" >&2
  echo "(wasm: build with RUSTFLAGS=--remap-path-prefix=$HOME=~)" >&2; exit 1
fi
cp "$SRC/scenes/scene0011_00.ply" "$DST/scenes/"
du -sh "$DST"/*
