"""Train a camera-based Place policy from a factory dataset.

  python py/train.py --data data/datasets/multi  --out data/ckpt/multi.pt
  python py/train.py --data data/datasets/single --out data/ckpt/single.pt
  python py/train.py --data data/datasets/multi --overfit 5          # sanity check: loss must go to ~0

Same code and hyperparameters for both policies; only the data differs. Fixed time budget, best-val checkpoint.
No color or brightness augmentation: only a random shift of up to 4 pixels.
"""
from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

import numpy as np
import torch

from policy_model import MODEL_CONFIG, PREPROCESS, Policy, loss_fn, pick_device, preprocess_images, preprocess_states, random_shift

HPARAMS = {"lr": 3e-4, "batch": 256, "val_frac": 0.1, "shift": 4, "weight_decay": 1e-4}


def load_episodes(root: Path, limit: int | None = None):
    files = sorted(Path(root).glob("ep_*.npz"))
    if limit:
        files = files[:limit]
    eps = []
    for f in files:
        with np.load(f) as d:
            eps.append({
                "file": f.name,
                "images": d["images"],
                "states": d["states"],
                "actions": d["actions"],
                "meta": json.loads(str(d["meta"])),
            })
    if not eps:
        raise SystemExit(f"no episodes in {root}")
    return eps


def split_by_episode(n: int, val_frac: float, seed: int = 0):
    """Split episode indices (not frames) so no episode is in both sets."""
    idx = list(range(n))
    random.Random(seed).shuffle(idx)
    n_val = max(1, int(round(n * val_frac))) if n > 1 else 0
    return sorted(idx[n_val:]), sorted(idx[:n_val])


def stack(eps, which):
    return (
        np.concatenate([eps[i]["images"] for i in which]),
        np.concatenate([eps[i]["states"] for i in which]),
        np.concatenate([eps[i]["actions"] for i in which]),
    )


def train(data: str, out: str | None, minutes: float, overfit: int | None, seed: int, max_epochs: int | None = None,
          log=print, device: str | None = None):
    torch.manual_seed(seed)
    np.random.seed(seed)
    random.seed(seed)
    device = torch.device(device) if device else pick_device()
    log(f"device: {device}" + (f" ({torch.cuda.get_device_name(0)})" if device.type == "cuda" else ""))
    eps = load_episodes(Path(data), limit=overfit)
    if overfit:
        tr_idx, va_idx = list(range(len(eps))), []
    else:
        tr_idx, va_idx = split_by_episode(len(eps), HPARAMS["val_frac"], seed)
    Xi, Xs, Ya = stack(eps, tr_idx)
    worlds = sorted({e["meta"]["world"] for e in eps})
    log(f"data: {data}  episodes {len(eps)} (train {len(tr_idx)}, val {len(va_idx)})  frames {len(Xi)}  worlds {worlds}")
    # keep everything on the device: the datasets are small (uint8 images)
    ti = torch.from_numpy(Xi).to(device)
    ts = preprocess_states(torch.from_numpy(Xs)).to(device)
    ta = torch.from_numpy(Ya).float().to(device)
    if va_idx:
        Vi, Vs, Va = stack(eps, va_idx)
        vi = torch.from_numpy(Vi).to(device)
        vs = preprocess_states(torch.from_numpy(Vs)).to(device)
        va = torch.from_numpy(Va).float().to(device)

    model = Policy(MODEL_CONFIG).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=HPARAMS["lr"], weight_decay=HPARAMS["weight_decay"])
    budget = minutes * 60
    t0 = time.time()
    best = float("inf")
    history = []
    epoch = 0
    n = len(ti)
    B = HPARAMS["batch"]

    def evaluate(I, S, A):
        model.eval()
        tot, cnt = 0.0, 0
        with torch.no_grad():
            for k in range(0, len(I), 1024):
                p = model(preprocess_images(I[k:k + 1024]), S[k:k + 1024])
                l, _ = loss_fn(p, A[k:k + 1024])
                tot += float(l) * len(p)
                cnt += len(p)
        model.train()
        return tot / max(cnt, 1)

    while time.time() - t0 < budget and (max_epochs is None or epoch < max_epochs):
        epoch += 1
        perm = torch.randperm(n, device=device)
        tl, tc = 0.0, 0
        for k in range(0, n, B):
            j = perm[k:k + B]
            img = preprocess_images(ti[j])
            if not overfit:
                img = random_shift(img, HPARAMS["shift"])
            pred = model(img, ts[j])
            loss, parts = loss_fn(pred, ta[j])
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            tl += float(loss) * len(j)
            tc += len(j)
        train_loss = tl / tc
        val_loss = evaluate(vi, vs, va) if va_idx else train_loss
        history.append({"epoch": epoch, "train": train_loss, "val": val_loss, "t": round(time.time() - t0, 1)})
        improved = val_loss < best
        if improved:
            best = val_loss
            if out:
                save(out, model, data, eps, tr_idx, va_idx, history, best, seed, minutes)
        log(f"epoch {epoch:4d}  train {train_loss:.5f}  val {val_loss:.5f}{'  *' if improved else ''}  t {time.time() - t0:6.0f}s")
    log(f"done: {epoch} epochs, best val {best:.5f}" + (f", saved {out}" if out else ""))
    return {"epochs": epoch, "best": best, "final_train": history[-1]["train"] if history else None, "history": history}


def save(out, model, data, eps, tr_idx, va_idx, history, best, seed, minutes):
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "state_dict": model.state_dict(),
        "model_config": MODEL_CONFIG,
        "preprocess": PREPROCESS,
        "obs": {"image": [96, 96, 3], "state": "tip xyz scaled to [-1,1] over workspace + grip",
                "action": "target xyz same scaling + grip logit", "workspace": {"min": [-0.4, 0.76, -0.9], "max": [0.4, 1.2, -0.45]}},
        "hparams": {**HPARAMS, "minutes": minutes, "seed": seed},
        "data": {"path": str(data), "episodes": len(eps), "train_episodes": len(tr_idx), "val_episodes": len(va_idx),
                 "worlds": sorted({e["meta"]["world"] for e in eps})},
        "best_val": best,
        "history": history,
    }, out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out")
    ap.add_argument("--minutes", type=float, default=15.0)
    ap.add_argument("--overfit", type=int, help="train on the first N episodes only, no augmentation, no validation")
    ap.add_argument("--epochs", type=int, help="stop after N epochs (in addition to the time budget)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--device", help="cuda, mps or cpu (default: best available)")
    a = ap.parse_args()
    r = train(a.data, a.out, a.minutes, a.overfit, a.seed, a.epochs, device=a.device)
    if a.overfit:
        ok = r["final_train"] is not None and r["final_train"] < 0.01
        print(f"OVERFIT CHECK {'PASS' if ok else 'FAIL'}: final train loss {r['final_train']:.5f} (want < 0.01)")
        raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
