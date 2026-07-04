"""Tests for the build-phase validation runner (ml/validate.py)."""

from __future__ import annotations

from pathlib import Path

from core.contracts import (
    BoundingBox,
    ClassificationPayload,
    Detection,
    DetectionPayload,
    Measurement,
    MeasurementPayload,
    ModelResult,
)
from core.registry import SkuRegistry
from ml.validate import (
    NEGATIVE_LABEL,
    LabeledSample,
    build_confusion_matrix,
    reducer_for,
    validate_bundle,
)
from core.contracts import ResultType

SKUS_ROOT = Path(__file__).resolve().parents[1] / "skus"


def _det_result(*labels_conf):
    dets = [
        Detection(label=l, confidence=c, box=BoundingBox(x=0, y=0, width=1, height=1))
        for l, c in labels_conf
    ]
    return ModelResult(sku_id="s", payload=DetectionPayload(detections=dets))


def test_detection_reducer_picks_highest_confidence():
    reduce = reducer_for(ResultType.detection)
    assert reduce(_det_result(("a", 0.4), ("b", 0.9)), {}) == "b"
    assert reduce(_det_result(), {}) == NEGATIVE_LABEL


def test_classification_reducer_returns_label():
    reduce = reducer_for(ResultType.classification)
    result = ModelResult(
        sku_id="s", payload=ClassificationPayload(label="ok", confidence=0.8)
    )
    assert reduce(result, {}) == "ok"


def test_measurement_reducer_uses_tolerances():
    reduce = reducer_for(ResultType.measurement)
    result = ModelResult(
        sku_id="s",
        payload=MeasurementPayload(measurements=[Measurement(name="len", value=5.0)]),
    )
    assert reduce(result, {"tolerances": {"len": [4.0, 6.0]}}) == "ok"
    assert reduce(result, {"tolerances": {"len": [0.0, 1.0]}}) == NEGATIVE_LABEL
    # No tolerance declared -> not judged, defaults to ok.
    assert reduce(result, {"tolerances": {}}) == "ok"


def test_confusion_matrix_is_square_and_scores():
    cm = build_confusion_matrix(
        [("a", "a"), ("a", "b"), ("b", "b")], classes=["a", "b"]
    )
    assert NEGATIVE_LABEL in cm.labels
    assert len(cm.matrix) == len(cm.labels)
    assert all(len(row) == len(cm.labels) for row in cm.matrix)
    assert cm.accuracy == 2 / 3


def test_validate_bundle_end_to_end():
    registry = SkuRegistry(SKUS_ROOT)
    bundle = registry.load("demo_bracket")
    # Stub is deterministic; highest-confidence label is bracket_body.
    samples = [LabeledSample(image=f"img{i}.jpg", truth="bracket_body") for i in range(3)]
    report = validate_bundle(bundle, samples)
    assert report.sku_id == "demo_bracket"
    assert report.result_type is ResultType.detection
    assert report.n_samples == 3
    assert report.accuracy == 1.0
