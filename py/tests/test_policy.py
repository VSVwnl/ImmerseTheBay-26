import asyncio
import base64
import json
import sys
from pathlib import Path

import numpy as np
import pytest
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import report  # noqa: E402
import train  # noqa: E402
from policy_model import Policy, loss_fn, preprocess_images, random_shift, to_action  # noqa: E402
from serve import PolicyBank, serve  # noqa: E402

IMG = 96


def make_dataset(root: Path, n=6, T=12, worlds=("lab", "beach")):
    root.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(0)
    for e in range(n):
        imgs = rng.integers(0, 255, (T, IMG, IMG, 3), dtype=np.uint8)
        states = rng.uniform(-1, 1, (T, 4)).astype(np.float32)
        states[:, 3] = (rng.random(T) > 0.5)
        acts = np.clip(states + 0.1, -1, 1).astype(np.float32)
        acts[:, 3] = states[:, 3]
        meta = {"world": worlds[e % len(worlds)], "seed": e, "source": "expert", "noise": False, "success": True}
        np.savez_compressed(root / f"ep_{e:05d}.npz", images=imgs, states=states, actions=acts, meta=np.asarray(json.dumps(meta)))
    return root


def test_preprocess_matches_layout():
    a = np.zeros((1, IMG, IMG, 3), dtype=np.uint8)
    a[0, 0, 0] = [255, 0, 0]
    x = preprocess_images(torch.from_numpy(a))
    assert x.shape == (1, 3, IMG, IMG)
    assert x[0, 0, 0, 0] == 1.0 and x[0, 1, 0, 0] == 0.0
    with pytest.raises(ValueError):
        preprocess_images(torch.zeros(1, IMG, IMG, 3))


def test_random_shift_keeps_shape_and_moves_content():
    torch.manual_seed(0)
    x = torch.zeros(8, 3, IMG, IMG)
    x[:, :, 40:56, 40:56] = 1
    y = random_shift(x, 4)
    assert y.shape == x.shape
    assert torch.allclose(y.sum(dim=(1, 2, 3)), x.sum(dim=(1, 2, 3)))  # interior content only moves
    assert random_shift(x, 0).equal(x)


def test_model_shapes_and_loss():
    m = Policy()
    out = m(torch.rand(5, 3, IMG, IMG), torch.rand(5, 4))
    assert out.shape == (5, 4)
    loss, parts = loss_fn(out, torch.cat([torch.rand(5, 3), torch.ones(5, 1)], dim=1))
    assert loss.item() > 0 and set(parts) == {"mse", "bce"}
    a = to_action(out)
    assert set(a[:, 3].tolist()) <= {0.0, 1.0} and a[:, :3].abs().max() <= 1


def test_split_is_by_episode():
    tr, va = train.split_by_episode(20, 0.1, seed=0)
    assert len(va) == 2 and not set(tr) & set(va) and sorted(tr + va) == list(range(20))


def test_overfit_tiny_dataset(tmp_path):
    ds = make_dataset(tmp_path / "ds", n=5, T=10)
    r = train.train(str(ds), None, minutes=2, overfit=5, seed=0, max_epochs=300, log=lambda *_: None)
    assert r["final_train"] < 0.05, r["final_train"]


def test_checkpoint_roundtrip_and_serve(tmp_path):
    ds = make_dataset(tmp_path / "ds", n=6, T=8)
    ck = tmp_path / "multi.pt"
    train.train(str(ds), str(ck), minutes=1, overfit=None, seed=0, max_epochs=2, log=lambda *_: None)
    saved = torch.load(ck, weights_only=True)
    assert saved["data"]["train_episodes"] + saved["data"]["val_episodes"] == 6
    bank = PolicyBank([f"multi={ck}", f"single={ck}"])
    img = base64.b64encode(np.zeros((IMG, IMG, 3), np.uint8).tobytes()).decode()
    name, act = bank.act("single", img, [0, 0, 0, 0])
    assert name == "single" and len(act) == 4 and act[3] in (0.0, 1.0)
    assert bank.act(None, img, [0, 0, 0, 0])[0] == "multi"

    import websockets

    async def run():
        ready, stop = asyncio.Event(), asyncio.Event()
        task = asyncio.create_task(serve(bank, 18767, ready, stop))
        await ready.wait()
        async with websockets.connect("ws://localhost:18767") as ws:
            await ws.send(json.dumps({"type": "ping"}))
            pong = json.loads(await ws.recv())
            await ws.send(json.dumps({"type": "act", "id": 7, "policy": "multi", "image": img, "state": [0, 0, 0, 1]}))
            act = json.loads(await ws.recv())
        stop.set()
        await task
        return pong, act

    pong, act = asyncio.run(run())
    assert pong["server"] == "policy" and set(pong["policies"]) == {"multi", "single"}
    assert act["type"] == "action" and act["id"] == 7 and len(act["action"]) == 4


def test_report_table():
    run = {"runId": "r1", "tag": "t", "protocol": {"seeds": [1, 2]}, "episodes": [
        {"world": w, "policy": p, "seed": s, "success": (p == "multi" or w == "lab") and s == 1}
        for w in report.WORLDS for p in report.POLICIES for s in (1, 2)
    ]}
    s = report.summarize(run)
    assert s["complete"]
    assert s["table"]["multi"]["subway"] == {"success": 1, "episodes": 2, "rate": 0.5}
    assert s["table"]["single"]["held_out_mean"]["success"] == 0
    assert s["table"]["single"]["held_out_mean"]["episodes"] == 6
    out = report.print_table(s)
    assert "1/2 (50%)" in out and "held-out mean" in out
