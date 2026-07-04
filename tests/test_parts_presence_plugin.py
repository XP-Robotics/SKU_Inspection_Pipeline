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


def _checks_by_name(verdict: Verdict) -> dict[str, dict]:
    return {c["name"]: c for c in verdict.details["checks"]}


def test_all_parts_present_passes():
    result = _result([_det(p, 0.9) for p in EXPECTED])
    verdict = PartsPresencePlugin().evaluate(result, _config())

    assert isinstance(verdict, Verdict)
    assert verdict.passed is True
    assert verdict.details["missing_parts"] == []
    assert set(verdict.details["detected_parts"]) == set(EXPECTED)

    # Frontend-facing per-part checks: one per expected part, all passing, boxed.
    checks = _checks_by_name(verdict)
    assert set(checks) == set(EXPECTED)
    for part in EXPECTED:
        assert checks[part]["status"] == "pass"
        assert checks[part]["actual"].startswith("detected")
        assert set(checks[part]["box"]) == {"x", "y", "width", "height"}


def test_missing_part_fails_and_names_it():
    result = _result([_det(p, 0.9) for p in EXPECTED if p != "clip"])
    verdict = PartsPresencePlugin().evaluate(result, _config())

    assert verdict.passed is False
    assert verdict.details["missing_parts"] == ["clip"]
    assert "clip" in verdict.reason

    checks = _checks_by_name(verdict)
    assert checks["clip"]["status"] == "missing"
    assert "box" not in checks["clip"]  # can't localize an absence
    assert checks["bracket_body"]["status"] == "pass"


def test_low_confidence_is_a_failed_check_with_a_box():
    dets = [_det(p, 0.9) for p in EXPECTED if p != "screw_right"]
    dets.append(_det("screw_right", 0.3))  # below min_confidence 0.5
    verdict = PartsPresencePlugin().evaluate(_result(dets), _config())

    assert verdict.passed is False
    # Below-threshold still counts against presence (missing_parts).
    assert verdict.details["missing_parts"] == ["screw_right"]

    check = _checks_by_name(verdict)["screw_right"]
    assert check["status"] == "fail"  # detected-but-weak, distinct from absent
    assert "box" in check  # the weak hit is still localizable
    assert "0.30" in check["message"]


def test_checks_conform_to_frontend_check_shape():
    """Every check must satisfy the frontend's Check contract (status enum,
    required name, optional string fields)."""
    dets = [_det(p, 0.9) for p in EXPECTED if p != "clip"]
    dets.append(_det("screw_right", 0.2))  # add a below-threshold duplicate-ish hit
    verdict = PartsPresencePlugin().evaluate(_result(dets), _config())

    valid_status = {"pass", "fail", "missing", "warn"}
    for c in verdict.details["checks"]:
        assert isinstance(c["name"], str) and c["name"]
        assert c["status"] in valid_status
        for opt in ("expected", "actual", "message"):
            assert opt not in c or isinstance(c[opt], str)
        if "box" in c:
            assert set(c["box"]) == {"x", "y", "width", "height"}


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
