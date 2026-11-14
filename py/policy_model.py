"""Policy model and the one image/state preprocessing shared by train.py and serve.py.

Observation (fixed, see src/factory/obs.ts):
  image  uint8 [96, 96, 3], upright RGB      -> float [3, 96, 96] in [0, 1]
  state  [tip_x, tip_y, tip_z, grip]          positions already scaled to [-1, 1]
Action:  [target_x, target_y, target_z, grip] same scaling; grip is a logit at the output
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

IMG = 96
MODEL_CONFIG = {"channels": [32, 64, 128, 256, 256], "state_dim": 4, "state_hidden": 64, "head": 256, "out": 4, "pool": "spatial_softmax"}
# pool: the spec ends in global average pooling ("avg"). Smoke debugging showed the multi-world policy could not
# place cubes in the lab with it (1/20), so the default is a spatial-softmax keypoint head; --pool avg restores the spec.
PREPROCESS = {"image_scale": 255.0, "layout": "NHWC uint8 RGB -> NCHW float"}


def preprocess_images(images: torch.Tensor) -> torch.Tensor:
    """uint8 [B, 96, 96, 3] (any device) -> float [B, 3, 96, 96] in [0, 1]. Used by training AND serving."""
    if images.dtype != torch.uint8:
        raise ValueError("images must be uint8")
    return images.permute(0, 3, 1, 2).float() / PREPROCESS["image_scale"]


def preprocess_states(states: torch.Tensor) -> torch.Tensor:
    return states.float()


def random_shift(x: torch.Tensor, pad: int = 4) -> torch.Tensor:
    """Augmentation: random shift of up to `pad` pixels (replicate-pad then random crop), per sample."""
    b, c, h, w = x.shape
    padded = F.pad(x, (pad, pad, pad, pad), mode="replicate")
    ox = torch.randint(0, 2 * pad + 1, (b,), device=x.device)
    oy = torch.randint(0, 2 * pad + 1, (b,), device=x.device)
    ar_h = torch.arange(h, device=x.device)
    ar_w = torch.arange(w, device=x.device)
    rows = (oy[:, None] + ar_h[None, :])  # [b, h]
    cols = (ox[:, None] + ar_w[None, :])  # [b, w]
    idx_b = torch.arange(b, device=x.device)[:, None, None]
    out = padded.permute(0, 2, 3, 1)[idx_b, rows[:, :, None], cols[:, None, :]]  # [b, h, w, c]
    return out.permute(0, 3, 1, 2).contiguous()


class Policy(nn.Module):
    def __init__(self, cfg: dict | None = None):
        super().__init__()
        cfg = cfg or MODEL_CONFIG
        self.cfg = cfg
        self.pool = cfg.get("pool", "avg")
        # avg (the spec): five stride-2 convs then global average pooling. spatial_softmax keeps a 12x12 map
        # (the last two convs use stride 1) and turns each channel into an expected (x, y) keypoint.
        strides = [2, 2, 2, 1, 1] if self.pool == "spatial_softmax" else [2] * len(cfg["channels"])
        layers: list[nn.Module] = []
        cin = 3
        for ch, st in zip(cfg["channels"], strides):
            layers += [nn.Conv2d(cin, ch, 3, stride=st, padding=1), nn.GroupNorm(8, ch), nn.ReLU(inplace=True)]
            cin = ch
        if self.pool == "spatial_softmax":
            self.keypoint_temp = nn.Parameter(torch.ones(1))
        self.encoder = nn.Sequential(*layers)
        self.state_mlp = nn.Sequential(
            nn.Linear(cfg["state_dim"], cfg["state_hidden"]), nn.ReLU(inplace=True),
            nn.Linear(cfg["state_hidden"], cfg["state_hidden"]), nn.ReLU(inplace=True),
        )
        self.head = nn.Sequential(
            nn.Linear((2 * cin if self.pool == "spatial_softmax" else cin) + cfg["state_hidden"], cfg["head"]), nn.ReLU(inplace=True),
            nn.Linear(cfg["head"], cfg["head"]), nn.ReLU(inplace=True),
            nn.Linear(cfg["head"], cfg["out"]),
        )

    def forward(self, image: torch.Tensor, state: torch.Tensor) -> torch.Tensor:
        f = self.encoder(image)
        if self.pool == "spatial_softmax":
            b, c, h, w = f.shape
            att = torch.softmax(f.reshape(b, c, h * w) / self.keypoint_temp, dim=-1).reshape(b, c, h, w)
            ys = torch.linspace(-1, 1, h, device=f.device)
            xs = torch.linspace(-1, 1, w, device=f.device)
            z = torch.cat([(att.sum(2) * xs).sum(-1), (att.sum(3) * ys).sum(-1)], dim=1)
        else:
            z = f.mean(dim=(2, 3))  # global average pooling (the spec)
        s = self.state_mlp(state)
        return self.head(torch.cat([z, s], dim=1))


def loss_fn(pred: torch.Tensor, target: torch.Tensor) -> tuple[torch.Tensor, dict]:
    """MSE on the three target coordinates + BCE on grip (pred[:, 3] is a logit)."""
    mse = F.mse_loss(pred[:, :3], target[:, :3])
    bce = F.binary_cross_entropy_with_logits(pred[:, 3], target[:, 3])
    return mse + bce, {"mse": float(mse.detach()), "bce": float(bce.detach())}


def to_action(pred: torch.Tensor) -> torch.Tensor:
    """Network output -> action [x, y, z, grip(0/1)], positions clamped to the scaled workspace."""
    xyz = pred[:, :3].clamp(-1, 1)
    grip = (torch.sigmoid(pred[:, 3:4]) > 0.5).float()
    return torch.cat([xyz, grip], dim=1)


def pick_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def load_checkpoint(path: str, device: torch.device | None = None) -> tuple[Policy, dict]:
    device = device or pick_device()
    ck = torch.load(path, map_location=device, weights_only=True)
    model = Policy(ck["model_config"]).to(device)
    model.load_state_dict(ck["state_dict"])
    model.eval()
    return model, ck
