"""Policy inference server (M4, M5).

  python py/serve.py --ckpt multi=data/ckpt/multi.pt --ckpt single=data/ckpt/single.pt --port 8765
  python py/serve.py --ckpt data/ckpt/multi.pt          # name taken from the file stem

WebSocket, JSON:
  {"type": "act", "id": 1, "policy": "multi", "image": "<base64 96*96*3 RGB upright>", "state": [4 floats]}
    -> {"type": "action", "id": 1, "policy": "multi", "action": [x, y, z, grip]}
  {"type": "ping"} -> {"type": "pong", "server": "policy", "policies": [...], "default": "multi"}
Uses exactly the training preprocessing (policy_model.preprocess_images). Stop data_server.py first: same port.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
from pathlib import Path

import numpy as np
import torch

from policy_model import IMG, load_checkpoint, pick_device, preprocess_images, preprocess_states, to_action

from local_origins import local_origins

ALLOWED_ORIGINS = local_origins()


class PolicyBank:
    def __init__(self, specs: list[str], device: torch.device | None = None):
        self.device = device or pick_device()
        self.models: dict[str, torch.nn.Module] = {}
        self.meta: dict[str, dict] = {}
        for spec in specs:
            name, _, path = spec.partition("=") if "=" in spec else (Path(spec).stem, "", spec)
            model, ck = load_checkpoint(path, self.device)
            self.models[name] = model
            self.meta[name] = {"path": path, "data": ck.get("data"), "best_val": ck.get("best_val")}
            print(f"[serve] loaded {name} from {path} (data {ck.get('data', {}).get('path')}, best val {ck.get('best_val')})", flush=True)
        self.default = "multi" if "multi" in self.models else next(iter(self.models))

    @torch.no_grad()
    def act(self, policy: str | None, image_b64: str, state) -> tuple[str, list[float]]:
        name = policy if policy in self.models else self.default
        raw = base64.b64decode(image_b64)
        if len(raw) != IMG * IMG * 3:
            raise ValueError(f"image has {len(raw)} bytes, expected {IMG * IMG * 3}")
        img = torch.from_numpy(np.frombuffer(raw, dtype=np.uint8).reshape(1, IMG, IMG, 3).copy()).to(self.device)
        st = preprocess_states(torch.tensor([state], dtype=torch.float32)).to(self.device)
        pred = self.models[name](preprocess_images(img), st)
        return name, [float(v) for v in to_action(pred)[0].cpu()]


async def handle(ws, bank: PolicyBank) -> None:
    async for raw in ws:
        try:
            msg = json.loads(raw)
            if msg.get("type") == "ping":
                await ws.send(json.dumps({"type": "pong", "server": "policy", "policies": list(bank.models), "default": bank.default}))
            elif msg.get("type") == "act":
                name, action = bank.act(msg.get("policy"), msg["image"], msg["state"])
                await ws.send(json.dumps({"type": "action", "id": msg.get("id"), "policy": name, "action": action}))
        except Exception as e:
            await ws.send(json.dumps({"type": "error", "id": msg.get("id") if isinstance(msg, dict) else None, "error": str(e)}))


async def serve(bank: PolicyBank, port: int, ready: asyncio.Event | None = None, stop: asyncio.Event | None = None):
    import websockets

    host = "127.0.0.1" if port == 0 else "localhost"
    async with websockets.serve(lambda ws: handle(ws, bank), host, port, max_size=4 * 1024 * 1024, origins=ALLOWED_ORIGINS) as server:
        bound_port = server.sockets[0].getsockname()[1]
        print(f"[serve] policies {list(bank.models)} on ws://localhost:{bound_port} ({bank.device})", flush=True)
        if ready:
            ready.set()
        await (stop.wait() if stop else asyncio.Future())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", action="append", required=True, help="path or name=path; repeat for several policies")
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    asyncio.run(serve(PolicyBank(a.ckpt), a.port))


if __name__ == "__main__":
    main()
