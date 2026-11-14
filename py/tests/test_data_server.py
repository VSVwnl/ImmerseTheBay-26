import asyncio
import base64
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from data_server import EpisodeWriter, serve  # noqa: E402

IMG = 96


def img(v=0):
    a = np.full((IMG, IMG, 3), v, dtype=np.uint8)
    a[0, 0] = [255, 0, 0]  # top-left marker stays top-left
    return base64.b64encode(a.tobytes()).decode()


def meta(world="lab", wall="live"):
    return {"world": world, "prompt": "p", "seed": 1, "source": "expert", "noise": False, "wall": wall}


def test_writes_npz_with_schema(tmp_path):
    w = EpisodeWriter(tmp_path)
    w.begin("multi", 42, meta())
    for i in range(5):
        w.step(img(i), [0.1, 0.2, 0.3, 0], [0.1, 0.2, 0.3, 1])
    r = w.end(True)
    assert r["type"] == "saved"
    d = np.load(tmp_path / "multi" / "ep_00042.npz")
    assert d["images"].shape == (5, IMG, IMG, 3) and d["images"].dtype == np.uint8
    assert d["states"].shape == (5, 4) and d["states"].dtype == np.float32
    assert d["actions"].shape == (5, 4) and d["actions"].dtype == np.float32
    assert tuple(d["images"][0, 0, 0]) == (255, 0, 0)
    m = json.loads(str(d["meta"]))
    assert m["world"] == "lab" and m["success"] is True and m["steps"] == 5 and m["source"] == "expert"


def test_discards_failures(tmp_path):
    w = EpisodeWriter(tmp_path)
    w.begin("multi", 1, meta())
    w.step(img(), [0] * 4, [0] * 4)
    assert w.end(False)["type"] == "discarded"
    assert not (tmp_path / "multi").exists()


@pytest.mark.parametrize("world", ["subway", "forest", "desert"])
def test_never_writes_held_out_worlds(tmp_path, world):
    w = EpisodeWriter(tmp_path)
    w.begin("smoke", 1, meta(world=world))
    w.step(img(), [0] * 4, [0] * 4)
    r = w.end(True)
    assert r["type"] == "discarded" and "held-out" in r["reason"]


def test_stub_frames_only_in_smoke(tmp_path):
    for ds, expect in [("single", "discarded"), ("multi", "discarded"), ("smoke", "saved"), ("smoke-multi", "saved")]:
        w = EpisodeWriter(tmp_path)
        w.begin(ds, 1, meta(wall="stub"))
        w.step(img(), [0] * 4, [0] * 4)
        assert w.end(True)["type"] == expect, ds


def test_rejects_bad_input(tmp_path):
    w = EpisodeWriter(tmp_path)
    with pytest.raises(ValueError):
        w.begin("../evil", 1, meta())
    w.begin("smoke", 1, meta())
    with pytest.raises(ValueError):
        w.step(base64.b64encode(b"short").decode(), [0] * 4, [0] * 4)


def test_websocket_roundtrip(tmp_path):
    import websockets

    async def run():
        ready, stop = asyncio.Event(), asyncio.Event()
        task = asyncio.create_task(serve(18765, tmp_path, ready, stop))
        await ready.wait()
        async with websockets.connect("ws://localhost:18765") as ws:
            await ws.send(json.dumps({"type": "begin", "dataset": "smoke", "episode": 3, "meta": meta()}))
            for _ in range(3):
                await ws.send(json.dumps({"type": "step", "image": img(), "state": [0] * 4, "action": [0] * 4}))
            await ws.send(json.dumps({"type": "end", "success": True}))
            reply = json.loads(await ws.recv())
        stop.set()
        await task
        return reply

    reply = asyncio.run(run())
    assert reply["type"] == "saved" and reply["steps"] == 3
    assert (tmp_path / "smoke" / "ep_00003.npz").exists()
