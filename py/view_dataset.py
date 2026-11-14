"""Contact sheet for a dataset: random frames grouped by world.

  python py/view_dataset.py data/datasets/multi [--per-world 12] [--seed 0]
Writes <dataset>/contact.png. Check: upright and correctly colored; wall clearly visible and different
between worlds; cube, gripper and bin in view.
"""
from __future__ import annotations

import argparse
import json
import random
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def load_index(root: Path):
    by_world: dict[str, list[tuple[Path, int]]] = defaultdict(list)
    for f in sorted(root.glob("ep_*.npz")):
        with np.load(f) as d:
            meta = json.loads(str(d["meta"]))
            n = d["images"].shape[0]
        by_world[meta["world"]].append((f, n))
    return by_world


def contact_sheet(root: Path, per_world: int = 12, seed: int = 0, scale: int = 2) -> Path:
    rng = random.Random(seed)
    by_world = load_index(root)
    if not by_world:
        raise SystemExit(f"no episodes in {root}")
    cell = 96 * scale
    label_w = 150
    W = label_w + per_world * (cell + 4)
    H = len(by_world) * (cell + 8) + 30
    sheet = Image.new("RGB", (W, H), (20, 22, 28))
    draw = ImageDraw.Draw(sheet)
    total = sum(len(v) for v in by_world.values())
    draw.text((8, 8), f"{root.name}: {total} episodes, {len(by_world)} worlds", fill=(220, 220, 220))
    for row, (world, eps) in enumerate(sorted(by_world.items())):
        y = 30 + row * (cell + 8)
        draw.text((8, y + cell // 2 - 6), f"{world} ({len(eps)})", fill=(230, 230, 230))
        for k in range(per_world):
            f, n = rng.choice(eps)
            with np.load(f) as d:
                img = d["images"][rng.randrange(n)]
            sheet.paste(Image.fromarray(img).resize((cell, cell), Image.NEAREST), (label_w + k * (cell + 4), y))
    out = root / "contact.png"
    sheet.save(out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset")
    ap.add_argument("--per-world", type=int, default=12)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    print(contact_sheet(Path(a.dataset), a.per_world, a.seed))


if __name__ == "__main__":
    main()
