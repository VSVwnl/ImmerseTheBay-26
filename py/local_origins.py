"""Allowed browser origins for the legacy local recording and policy services."""
import os


def local_origins():
    port = int(os.environ.get("BACKLOT_WEB_PORT", "5173"))
    if not 1 <= port <= 65535:
        raise ValueError("BACKLOT_WEB_PORT must be a valid TCP port")
    return [f"http://localhost:{port}", f"http://127.0.0.1:{port}", None]
