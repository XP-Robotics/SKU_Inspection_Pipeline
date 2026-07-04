"""Build-phase validation runner — confusion matrix, dispatched by result type.

Model-agnostic and SKU-agnostic. Given a loaded bundle and a labeled dataset, it
runs the SKU's adapter over every sample and scores predictions against ground
truth. HOW a :class:`ModelResult` is reduced to a comparable class label depends
only on its :class:`ResultType`, never on which SKU it is — the reduction is
looked up in ``_REDUCERS`` keyed by result type.

Adding a new ResultType (contracts step 4) means registering a reducer here; the
conformance test fails if any ResultType lacks one.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from core.contracts import ModelResult, ResultType
from core.registry import SkuBundle, SkuRegistry

#: Sentinel label used when a reduction yields "no class" (e.g. nothing detected,
#: or a measurement out of tolerance). Kept out of the SKU's real class space.
NEGATIVE_LABEL = "__none__"


# --------------------------------------------------------------------------- #
# Ground-truth + sample model                                                  #
# --------------------------------------------------------------------------- #
class LabeledSample(BaseModel):
    """One validation sample: an image path and its ground-truth label.

    ``truth`` is the reduced ground-truth class in the SAME space the reducer
    produces (a class name, or :data:`NEGATIVE_LABEL`). Keeping the dataset in
    reduced form keeps this runner independent of per-type annotation formats.
    """

    model_config = ConfigDict(frozen=True)

    image: str
    truth: str


# --------------------------------------------------------------------------- #
# Confusion matrix                                                              #
# --------------------------------------------------------------------------- #
class ConfusionMatrix(BaseModel):
    """Square confusion matrix over an explicit, ordered label set."""

    model_config = ConfigDict(frozen=True)

    labels: list[str]
    #: ``matrix[i][j]`` = count of samples with truth ``labels[i]`` predicted as
    #: ``labels[j]``.
    matrix: list[list[int]]

    @property
    def accuracy(self) -> float:
        total = sum(sum(row) for row in self.matrix)
        if total == 0:
            return 0.0
        correct = sum(self.matrix[i][i] for i in range(len(self.labels)))
        return correct / total


class ValidationReport(BaseModel):
    """The validation artifact written to ``skus/<id>/metrics/``."""

    model_config = ConfigDict(frozen=True)

    sku_id: str
    result_type: ResultType
    n_samples: int
    confusion_matrix: ConfusionMatrix
    accuracy: float
    #: Per-sample (truth, predicted) pairs, for drill-down / error review.
    predictions: list[dict[str, str]] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Result-type reducers: ModelResult -> single comparable class label           #
#                                                                              #
# Each reducer collapses a typed result to one label in the SKU's class space  #
# (or NEGATIVE_LABEL). This is the ONLY place result-type semantics live; the  #
# scoring loop below is fully generic.                                         #
# --------------------------------------------------------------------------- #
def _reduce_detection(result: ModelResult, config_params: dict[str, Any]) -> str:
    """Highest-confidence detected label, or NEGATIVE_LABEL if none."""
    detections = result.payload.detections
    if not detections:
        return NEGATIVE_LABEL
    return max(detections, key=lambda d: d.confidence).label


def _reduce_classification(result: ModelResult, config_params: dict[str, Any]) -> str:
    """The predicted class label."""
    return result.payload.label


def _reduce_measurement(result: ModelResult, config_params: dict[str, Any]) -> str:
    """In-tolerance -> ``ok``, else NEGATIVE_LABEL.

    Tolerances come from ``params["tolerances"]`` as ``{name: [min, max]}``.
    A measurement with no declared tolerance is ignored (does not fail).
    """
    tolerances: dict[str, list[float]] = config_params.get("tolerances", {})
    for m in result.payload.measurements:
        bounds = tolerances.get(m.name)
        if bounds is None:
            continue
        low, high = bounds
        if not (low <= m.value <= high):
            return NEGATIVE_LABEL
    return "ok"


#: The dispatch table. Keyed by ResultType — never by sku_id.
_REDUCERS: dict[ResultType, Callable[[ModelResult, dict[str, Any]], str]] = {
    ResultType.detection: _reduce_detection,
    ResultType.classification: _reduce_classification,
    ResultType.measurement: _reduce_measurement,
}


def reducer_for(result_type: ResultType) -> Callable[[ModelResult, dict[str, Any]], str]:
    """Return the reducer for ``result_type`` or raise if none is registered."""
    try:
        return _REDUCERS[result_type]
    except KeyError as exc:  # pragma: no cover - guarded by conformance test
        raise NotImplementedError(
            f"no validation reducer for result_type {result_type.value!r}; "
            "register one in ml/validate.py (contracts step 4)"
        ) from exc


def supported_result_types() -> set[ResultType]:
    """Result types that have a registered reducer (used by conformance test)."""
    return set(_REDUCERS)


# --------------------------------------------------------------------------- #
# Confusion-matrix construction                                                #
# --------------------------------------------------------------------------- #
def build_confusion_matrix(
    pairs: list[tuple[str, str]], classes: list[str]
) -> ConfusionMatrix:
    """Build a matrix over ``classes`` + NEGATIVE_LABEL from (truth, pred) pairs."""
    labels = list(classes)
    if NEGATIVE_LABEL not in labels:
        labels.append(NEGATIVE_LABEL)
    index = {label: i for i, label in enumerate(labels)}
    size = len(labels)
    matrix = [[0] * size for _ in range(size)]
    for truth, pred in pairs:
        # Unknown labels fold into NEGATIVE_LABEL so the matrix stays square.
        i = index.get(truth, index[NEGATIVE_LABEL])
        j = index.get(pred, index[NEGATIVE_LABEL])
        matrix[i][j] += 1
    return ConfusionMatrix(labels=labels, matrix=matrix)


# --------------------------------------------------------------------------- #
# The runner                                                                   #
# --------------------------------------------------------------------------- #
def validate_bundle(
    bundle: SkuBundle, samples: list[LabeledSample]
) -> ValidationReport:
    """Run the adapter over ``samples`` and score by the result-type reducer.

    Dispatch is by ``bundle.config.result_type`` (which reducer) and by
    ``config.adapter_id`` (which adapter the registry resolves) — no branching on
    the SKU's identity.
    """
    registry = SkuRegistry(bundle.root.parent)
    adapter = registry.resolve_adapter(bundle)
    reduce = reducer_for(bundle.config.result_type)
    params = bundle.config.params

    pairs: list[tuple[str, str]] = []
    predictions: list[dict[str, str]] = []
    for sample in samples:
        result = adapter.predict(sample.image)
        if result.result_type != bundle.config.result_type:
            raise ValueError(
                f"adapter returned {result.result_type.value!r}, "
                f"config declares {bundle.config.result_type.value!r}"
            )
        pred = reduce(result, params)
        pairs.append((sample.truth, pred))
        predictions.append({"image": sample.image, "truth": sample.truth, "pred": pred})

    cm = build_confusion_matrix(pairs, bundle.config.classes)
    return ValidationReport(
        sku_id=bundle.sku_id,
        result_type=bundle.config.result_type,
        n_samples=len(samples),
        confusion_matrix=cm,
        accuracy=cm.accuracy,
        predictions=predictions,
    )


def write_report(bundle: SkuBundle, report: ValidationReport) -> Path:
    """Persist the report as JSON under ``skus/<id>/metrics/validation.json``."""
    bundle.metrics_dir.mkdir(parents=True, exist_ok=True)
    out_path = bundle.metrics_dir / "validation.json"
    out_path.write_text(report.model_dump_json(indent=2), encoding="utf-8")
    return out_path


def load_dataset(path: str | Path) -> list[LabeledSample]:
    """Load a JSONL dataset of ``{"image": ..., "truth": ...}`` rows."""
    rows: list[LabeledSample] = []
    with Path(path).open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(LabeledSample.model_validate(json.loads(line)))
    return rows


__all__ = [
    "NEGATIVE_LABEL",
    "LabeledSample",
    "ConfusionMatrix",
    "ValidationReport",
    "validate_bundle",
    "write_report",
    "load_dataset",
    "reducer_for",
    "supported_result_types",
    "build_confusion_matrix",
]
