"""Open-loop diagnostics for a checkpoint on its validation episodes.

  python py/diagnose.py --ckpt data/ckpt/multi.pt --data data/datasets/multi
Prints the target error in centimetres (after un-scaling) and grip accuracy, overall and by expert phase proxy.
"""
from __future__ import annotations

import argparse

import numpy as np
import torch

from policy_model import load_checkpoint, preprocess_images, preprocess_states, to_action
from train import HPARAMS, load_episodes, split_by_episode

WS_MIN = np.array([-0.4, 0.76, -0.9])
WS_MAX = np.array([0.4, 1.2, -0.45])


def unscale(v):
    return WS_MIN + (v + 1) / 2 * (WS_MAX - WS_MIN)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--data", required=True)
    a = ap.parse_args()
    model, ck = load_checkpoint(a.ckpt)
    dev = next(model.parameters()).device
    eps = load_episodes(a.data)
    _, va = split_by_episode(len(eps), HPARAMS["val_frac"], ck["hparams"]["seed"])
    errs, grip_ok, step_err = [], [], []
    with torch.no_grad():
        for i in va:
            e = eps[i]
            img = preprocess_images(torch.from_numpy(e["images"]).to(dev))
            st = preprocess_states(torch.from_numpy(e["states"])).to(dev)
            pred = to_action(model(img, st)).cpu().numpy()
            tgt = e["actions"]
            p_xyz, t_xyz = unscale(pred[:, :3]), unscale(tgt[:, :3])
            d = np.linalg.norm(p_xyz - t_xyz, axis=1) * 100
            errs.extend(d)
            grip_ok.extend(pred[:, 3] == tgt[:, 3])
            # how far the expert asks to move vs how far the policy asks to move
            tip = unscale(e["states"][:, :3])
            step_err.extend(np.linalg.norm(t_xyz - tip, axis=1) * 100)
    errs = np.array(errs)
    print(f"val episodes {len(va)}, frames {len(errs)}")
    print(f"target error cm: mean {errs.mean():.2f}  median {np.median(errs):.2f}  p90 {np.percentile(errs, 90):.2f}  max {errs.max():.2f}")
    print(f"expert step size cm (target - tip): mean {np.mean(step_err):.2f}")
    print(f"grip accuracy: {np.mean(grip_ok) * 100:.1f}%")


if __name__ == "__main__":
    main()
