"""Build-phase training runner — model-agnostic orchestration.

Actual training is model-specific and therefore lives in the per-SKU adapter
(``ml/adapters/``). This shared runner only orchestrates: load the bundle,
resolve its adapter, and — if that adapter is trainable — drive training and
report where the weights landed. It contains no model library imports and no
SKU-specific branching; it dispatches purely by ``adapter_id`` via the registry.
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict

from core.registry import SkuBundle, SkuRegistry


@runtime_checkable
class Trainable(Protocol):
    """Optional capability a :class:`~core.contracts.ModelAdapter` may implement."""

    def train(self, data_dir: Path, model_dir: Path) -> "TrainReport": ...


class TrainReport(BaseModel):
    """Result of a training run."""

    model_config = ConfigDict(frozen=True)

    sku_id: str
    model_version: str
    weights_path: str
    metrics: dict[str, float] = {}


class TrainingNotSupported(RuntimeError):
    """Raised when a SKU's adapter does not implement the trainable protocol."""


def train_bundle(bundle: SkuBundle) -> TrainReport:
    """Train the model for ``bundle`` by delegating to its adapter."""
    registry = SkuRegistry(bundle.root.parent)
    adapter = registry.resolve_adapter(bundle)
    if not isinstance(adapter, Trainable):
        raise TrainingNotSupported(
            f"adapter {bundle.config.adapter_id!r} is not trainable; "
            "implement train(data_dir, model_dir) on it"
        )
    bundle.model_dir.mkdir(parents=True, exist_ok=True)
    return adapter.train(bundle.data_dir, bundle.model_dir)


__all__ = ["Trainable", "TrainReport", "TrainingNotSupported", "train_bundle"]
