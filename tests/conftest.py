"""Put the repo root on sys.path so tests can import core/, ml/, plugins/.

Minimal and shim-free: the real core.contracts is on disk, so nothing is faked.
"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
