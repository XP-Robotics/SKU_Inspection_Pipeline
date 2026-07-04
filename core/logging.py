"""Inspection logging — append-only JSONL trail of every runtime verdict (G3).

One record per inspection: which SKU, the full typed result, the verdict, and a
timestamp. Written as JSON Lines so the log is greppable and streamable without a
database (storage is files-on-disk per the PRD).
"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from core.contracts import ModelResult, Verdict


class InspectionRecord(BaseModel):
    """The full, self-describing outcome of one runtime inspection."""

    model_config = ConfigDict(frozen=True)

    #: Stable unique id for this inspection (traceability + log correlation).
    inspection_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    sku_id: str
    result: ModelResult
    verdict: Verdict
    #: UTC ISO-8601 timestamp of when the record was created.
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class InspectionLogger:
    """Thread-safe append-only JSONL logger."""

    def __init__(self, log_path: str | Path) -> None:
        self.log_path = Path(log_path)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def log(self, record: InspectionRecord) -> None:
        line = record.model_dump_json()
        with self._lock, self.log_path.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")


__all__ = ["InspectionRecord", "InspectionLogger"]
