"""Backend settings — resolved from environment with sane file-on-disk defaults."""

from __future__ import annotations

import os
from pathlib import Path

#: Repository root (this file is backend/settings.py).
REPO_ROOT = Path(__file__).resolve().parent.parent


def skus_root() -> Path:
    """Directory holding the ``<sku_id>/`` bundles."""
    return Path(os.environ.get("SKU_SKUS_ROOT", REPO_ROOT / "skus"))


def inspection_log_path() -> Path:
    """JSONL file the runtime verdict trail is appended to."""
    return Path(os.environ.get("SKU_LOG_PATH", REPO_ROOT / "logs" / "inspections.jsonl"))
