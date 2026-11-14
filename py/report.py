"""Summarize an evaluation run.

  python py/report.py [--tag smoke]
Reads data/results/eval.json (or eval-<tag>.json), writes summary.json (summary-<tag>.json) and prints:

                 lab    subway   forest   desert   held-out mean
  single policy  ...
  multi policy   ...
Every number is shown with its episode count.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

WORLDS = ["lab", "subway", "forest", "desert"]
HELD_OUT = ["subway", "forest", "desert"]
POLICIES = ["single", "multi"]


def summarize(run: dict) -> dict:
    cells: dict[tuple[str, str], list[bool]] = defaultdict(list)
    for e in run["episodes"]:
        cells[(e["policy"], e["world"])].append(bool(e["success"]))
    table = {}
    for p in POLICIES:
        row = {}
        for w in WORLDS:
            xs = cells.get((p, w), [])
            row[w] = {"success": sum(xs), "episodes": len(xs), "rate": (sum(xs) / len(xs)) if xs else None}
        ho = [x for w in HELD_OUT for x in cells.get((p, w), [])]
        row["held_out_mean"] = {"success": sum(ho), "episodes": len(ho), "rate": (sum(ho) / len(ho)) if ho else None}
        table[p] = row
    return {
        "runId": run.get("runId"),
        "tag": run.get("tag"),
        "startedAt": run.get("startedAt"),
        "protocol": run.get("protocol"),
        "complete": all(table[p][w]["episodes"] >= len(run.get("protocol", {}).get("seeds", [])) for p in POLICIES for w in WORLDS),
        "table": table,
    }


def fmt(c: dict) -> str:
    if not c["episodes"]:
        return "-"
    return f"{c['success']}/{c['episodes']} ({100 * c['rate']:.0f}%)"


def print_table(s: dict) -> str:
    cols = WORLDS + ["held_out_mean"]
    head = f"{'':16}" + "".join(f"{('held-out mean' if c == 'held_out_mean' else c):>16}" for c in cols)
    lines = [head]
    for p in POLICIES:
        lines.append(f"{p + ' policy':16}" + "".join(f"{fmt(s['table'][p][c]):>16}" for c in cols))
    if s.get("tag"):
        lines.append(f"(tag: {s['tag']}; {'complete' if s['complete'] else 'INCOMPLETE'} run {s['runId']})")
    out = "\n".join(lines)
    print(out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="")
    ap.add_argument("--root", default="data/results")
    a = ap.parse_args()
    suffix = f"-{a.tag}" if a.tag else ""
    run = json.loads((Path(a.root) / f"eval{suffix}.json").read_text())
    s = summarize(run)
    (Path(a.root) / f"summary{suffix}.json").write_text(json.dumps(s, indent=1))
    print_table(s)


if __name__ == "__main__":
    main()
