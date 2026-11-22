"""Export the qualitative val scenes of the supplement (paper/figures/make_examples_fig.py: same scenes, same
prediction runs) for the 3D viewer of the project page.

    python website/tools/export_scenes.py            # writes website/assets/scenes/<dataset>/<scene>.bin + index.json

Per scene one little-endian binary, n points, struct of arrays:
    xyz  uint16 [n, 3]  quantized over the scene's box (index.json: min, extent), z up, metres
    rgb  uint8  [n, 3]  input colour (ScanNet / Structured3D) or remission as gray (SemanticKITTI)
    pred uint8  [n]     PhasorPT prediction (TTA test output), class index
    gt   uint8  [n]     ground truth, 255 = unlabeled / ignored
index.json lists the datasets (class names, palette) and scenes (n, box, per-scene mIoU).
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(REPO, "paper", "figures"))
from make_examples_fig import DATASETS, scene_miou  # noqa: E402

OUT = os.path.join(REPO, "website", "assets", "scenes")
MAX_POINTS = 260_000          # per scene (random subset above it)
KITTI_BOX = 40.0              # SemanticKITTI: crop |x|, |y| <= 40 m around the sensor


def export(ds, cfg, rng):
    os.makedirs(os.path.join(OUT, ds), exist_ok=True)
    scenes = []
    for s in cfg["scenes"]:
        xyz, rgb, gt = cfg["load"](s)
        pred = np.load(f"{cfg['pred']}/{s}_pred.npy").reshape(-1).astype(np.int64)
        assert len(pred) == len(gt), (s, pred.shape, gt.shape)
        miou = scene_miou(pred, gt, len(cfg["names"]))
        keep = np.ones(len(xyz), bool)
        if ds == "kitti":
            keep &= (np.abs(xyz[:, 0]) <= KITTI_BOX) & (np.abs(xyz[:, 1]) <= KITTI_BOX)
        idx = np.flatnonzero(keep)
        if len(idx) > MAX_POINTS:
            idx = np.sort(rng.choice(idx, MAX_POINTS, replace=False))
        xyz, rgb, gt, pred = xyz[idx], rgb[idx], gt[idx], pred[idx]
        lo, hi = xyz.min(0), xyz.max(0)
        ext = np.maximum(hi - lo, 1e-6)
        q = np.round((xyz - lo) / ext * 65535).astype("<u2")
        col = np.clip(np.round(rgb * 255), 0, 255).astype(np.uint8)
        g = np.where(gt >= 0, gt, 255).astype(np.uint8)
        p = np.clip(pred, 0, 254).astype(np.uint8)
        with open(os.path.join(OUT, ds, f"{s}.bin"), "wb") as f:
            for a in (q, col, p, g):
                f.write(np.ascontiguousarray(a).tobytes())
        scenes.append(dict(id=s, n=int(len(idx)), min=[round(float(v), 4) for v in lo],
                           extent=[round(float(v), 4) for v in ext], miou=round(100 * float(miou), 1)))
        print(f"{ds} {s}: {len(idx)} points, mIoU {100 * miou:.1f}")
    return dict(title=cfg["title"], names=cfg["names"],
                palette=[[int(round(255 * c)) for c in rgb] for rgb in cfg["palette"]],
                input=cfg["input_label"], outdoor=ds == "kitti", scenes=scenes)


def main():
    rng = np.random.default_rng(0)
    index = {ds: export(ds, DATASETS[ds], rng) for ds in ("scannet", "structured3d", "kitti")}
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump(index, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
