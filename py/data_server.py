"""Data server for the M3 factory.

WebSocket on port 8765. One JSON message per step (image as base64):
  {"type": "begin", "dataset": "multi", "episode": 42,
   "meta": {"world": "lab", "prompt": "...", "seed": 1042, "source": "expert", "noise": true, "wall": "live"}}
  {"type": "step", "image": "<base64 96*96*3 RGB, upright>", "state": [4 floats], "action": [4 floats]}
  {"type": "end", "success": true}
Replies once per episode: {"type": "saved", ...} or {"type": "discarded", "reason": ...}.

Writes data/datasets/<dataset>/ep_00042.npz with images uint8 [T,96,96,3], states float32 [T,4],
actions float32 [T,4] and meta (JSON string). Episodes that did not succeed are discarded.
Guards: held-out worlds are never written; frames from a non-live wall only go into datasets named smoke*.

  python py/data_server.py [--port 8765] [--root data/datasets]
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import re
from pathlib import Path

import numpy as np

IMG = 96
HELD_OUT = {"subway", "forest", "desert"}
SAFE = re.compile(r"^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$")


def is_smoke(dataset: str) -> bool:
    return dataset.startswith("smoke")


class EpisodeWriter:
    """Collects one episode at a time and writes it as .npz. Independent of the transport."""

    def __init__(self, root: Path):
        self.root = Path(root)
        self.reset()

    def reset(self) -> None:
        self.dataset: str | None = None
        self.episode: int | None = None
        self.meta: dict = {}
        self.images: list[np.ndarray] = []
        self.states: list[list[float]] = []
        self.actions: list[list[float]] = []
        self.reject: str | None = None

    def begin(self, dataset: str, episode: int, meta: dict) -> None:
        self.reset()
        if not SAFE.match(str(dataset)):
            raise ValueError(f"bad dataset name {dataset!r}")
        self.dataset = str(dataset)
        self.episode = int(episode)
        self.meta = dict(meta)
        world = str(meta.get("world", ""))
        if world in HELD_OUT:
            self.reject = f"held-out world {world} may not be used for training data"
        elif meta.get("wall") != "live" and not is_smoke(self.dataset):
            self.reject = f"wall was {meta.get('wall')!r}, not live: only smoke datasets accept stub frames"

    def step(self, image_b64: str, state, action) -> None:
        if self.dataset is None:
            raise ValueError("step before begin")
        if self.reject:
            return
        raw = base64.b64decode(image_b64)
        if len(raw) != IMG * IMG * 3:
            raise ValueError(f"image has {len(raw)} bytes, expected {IMG * IMG * 3}")
        self.images.append(np.frombuffer(raw, dtype=np.uint8).reshape(IMG, IMG, 3))
        if len(state) != 4 or len(action) != 4:
            raise ValueError("state and action must have 4 numbers")
        self.states.append([float(v) for v in state])
        self.actions.append([float(v) for v in action])

    def end(self, success: bool) -> dict:
        ds, ep = self.dataset, self.episode
        if ds is None or ep is None:
            raise ValueError("end before begin")
        try:
            if self.reject:
                return {"type": "discarded", "episode": ep, "reason": self.reject}
            if not success:
                return {"type": "discarded", "episode": ep, "reason": "episode did not succeed"}
            if not self.images:
                return {"type": "discarded", "episode": ep, "reason": "no steps"}
            out = self.root / ds
            out.mkdir(parents=True, exist_ok=True)
            path = out / f"ep_{ep:05d}.npz"
            meta = {**self.meta, "success": True, "steps": len(self.images)}
            np.savez_compressed(
                path,
                images=np.stack(self.images).astype(np.uint8),
                states=np.asarray(self.states, dtype=np.float32),
                actions=np.asarray(self.actions, dtype=np.float32),
                meta=np.asarray(json.dumps(meta)),
            )
            return {"type": "saved", "episode": ep, "steps": len(self.images), "file": str(path)}
        finally:
            self.reset()


async def handle(ws, root: Path) -> None:
    writer = EpisodeWriter(root)
    async for raw in ws:
        try:
            msg = json.loads(raw)
            t = msg.get("type")
            if t == "begin":
                writer.begin(msg["dataset"], msg["episode"], msg.get("meta", {}))
            elif t == "step":
                writer.step(msg["image"], msg["state"], msg["action"])
            elif t == "end":
                reply = writer.end(bool(msg.get("success")))
                print(f"[data] {writer_dataset(msg, reply)} {reply['type']} ep {reply['episode']}"
                      + (f" ({reply.get('steps')} steps)" if reply["type"] == "saved" else f": {reply.get('reason')}"),
                      flush=True)
                await ws.send(json.dumps(reply))
            elif t == "ping":
                await ws.send(json.dumps({"type": "pong", "server": "data"}))
        except Exception as e:  # report and keep the connection
            await ws.send(json.dumps({"type": "error", "error": str(e)}))


def writer_dataset(msg: dict, reply: dict) -> str:
    return Path(reply.get("file", "")).parent.name if reply.get("file") else ""


async def serve(port: int, root: Path, ready: asyncio.Event | None = None, stop: asyncio.Event | None = None):
    import websockets

    async with websockets.serve(lambda ws: handle(ws, root), "localhost", port, max_size=8 * 1024 * 1024):
        print(f"[data] listening on ws://localhost:{port}, writing to {root}", flush=True)
        if ready:
            ready.set()
        await (stop.wait() if stop else asyncio.Future())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--root", default="data/datasets")
    a = ap.parse_args()
    asyncio.run(serve(a.port, Path(a.root)))


if __name__ == "__main__":
    main()
