"""Publish the authoritative OpenAPI schema from the FastAPI app.

The schema this writes is THE contract the frontend builds against. Regenerate it
whenever a contract or route changes:

    python -m scripts.publish_openapi

Writes JSON to ``openapi/openapi.json`` at the repo root.
"""

from __future__ import annotations

import json
from pathlib import Path

from backend.main import app

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = REPO_ROOT / "openapi" / "openapi.json"


def main() -> None:
    schema = app.openapi()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
    n_schemas = len(schema.get("components", {}).get("schemas", {}))
    n_paths = len(schema.get("paths", {}))
    print(f"wrote {OUT_PATH.relative_to(REPO_ROOT)} — {n_paths} paths, {n_schemas} schemas")


if __name__ == "__main__":
    main()
