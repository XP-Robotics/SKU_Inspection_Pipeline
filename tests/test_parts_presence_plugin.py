"""Conformance test for PartsPresencePlugin (plugins/parts_presence_plugin.py)."""
from __future__ import annotations

import pytest

from core.contracts import (
    BoundingBox,
    ClassificationPayload,
    Detection,
    DetectionPayload,
    ModelResult,
    ResultType,
    RulePlugin,
    SkuConfig,
    Verdict,
)
from core.registry import registered_plugins
from plugins.parts_presence_plugin import PartsPresencePlugin

EXPECTED = ["bracket_body", "screw_left", "screw_right", "clip"]


def _config(**overrides) -> SkuConfig:
    base = dict(
        sku_id="demo_bracket",
        result_type=ResultType.detection,
        adapter_id="stub",
        plugin_id="parts_presence",
        classes=list(EXPECTED),
        thresholds={"min_confidence": 0.5},
        params={"expected_parts": list(EXPECTED)},
    )
    base.update(overrides)
    return SkuConfig(**base)


def _det(label: str, confidence: float) -> Detection:
    return Detection(
        label=label,
        confidence=confidence,
        box=BoundingBox(x=0, y=0, width=1, height=1),
    )


def _result(dets: list[Detection]) -> ModelResult:
    return ModelResult(sku_id="demo_bracket", payload=DetectionPayload(detections=dets))


def test_plugin_is_registered_by_id():
    assert registered_plugins().get("parts_presence") is not None


def test_all_parts_present_passes():
    result = _result([_det(p, 0.9) for p in EXPECTED])
    verdict = PartsPresencePlugin().evaluate(result, _config())

    assert isinstance(verdict, Verdict)
    assert verdict.passed is True
    assert verdict.details["missing_parts"] == []
    assert set(verdict.details["detected_parts"]) == set(EXPECTED)


def test_missing_part_fails_and_names_it():
    result = _result([_det(p, 0.9) for p in EXPECTED if p != "clip"])
    verdict = PartsPresencePlugin().evaluate(result, _config())

    assert verdict.passed is False
    assert verdict.details["missing_parts"] == ["clip"]
    assert "clip" in verdict.reason


def test_low_confidence_counts_as_missing():
    dets = [_det(p, 0.9) for p in EXPECTED if p != "screw_right"]
    dets.append(_det("screw_right", 0.3))  # below min_confidence 0.5
    verdict = PartsPresencePlugin().evaluate(_result(dets), _config())

    assert verdict.passed is False
    assert verdict.details["missing_parts"] == ["screw_right"]


def test_threshold_comes_from_config_not_code():
    dets = [_det(p, 0.4) for p in EXPECTED]  # all at 0.4
    passing_cfg = _config(thresholds={"min_confidence": 0.3})
    failing_cfg = _config(thresholds={"min_confidence": 0.5})

    assert PartsPresencePlugin().evaluate(_result(dets), passing_cfg).passed is True
    assert PartsPresencePlugin().evaluate(_result(dets), failing_cfg).passed is False


def test_wrong_result_type_raises():
    plugin = PartsPresencePlugin()
    classification = ModelResult(
        sku_id="demo_bracket",
        payload=ClassificationPayload(label="ok", confidence=0.9),
    )
    with pytest.raises(ValueError):
        plugin.evaluate(classification, _config())


def test_plugin_satisfies_contract():
    assert isinstance(PartsPresencePlugin(), RulePlugin)
