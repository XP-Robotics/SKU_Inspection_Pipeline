"""PartsPresencePlugin — detection pass/fail by required-part presence.

Policy: PASS iff every expected part is detected with confidence >= a configured
threshold; otherwise FAIL, naming the missing parts. Expected parts and the
threshold come entirely from the SKU config (``params.expected_parts`` /
``thresholds.min_confidence``) — no SKU values in code.

The Verdict carries a per-part ``details.checks`` array (the "which part failed"
breakdown the frontend renders as a Feature-Checks table + image overlays). Each
check is ``{name, status, expected, actual, message?, box?}`` where status is:
  * ``pass``    — detected at/above the threshold (box points at it);
  * ``fail``    — detected but below the threshold (box points at the weak hit);
  * ``missing`` — not detected at all (no box — can't localize an absence).
This ``details.checks`` shape is a convention requested by the frontend; the
contract's ``Verdict.details`` is free-form, so this is additive.
"""

from __future__ import annotations

from typing import Any

from core.contracts import Detection, ModelResult, ResultType, RulePlugin, SkuConfig, Verdict
from core.registry import register_plugin


def _box_dict(det: Detection) -> dict[str, float]:
    return {
        "x": det.box.x,
        "y": det.box.y,
        "width": det.box.width,
        "height": det.box.height,
    }


@register_plugin("parts_presence")
class PartsPresencePlugin(RulePlugin):
    """Pass/fail for detection SKUs based on which required parts are present."""

    def evaluate(self, result: ModelResult, config: SkuConfig) -> Verdict:
        # Dispatch is by result TYPE, never sku_id: this plugin only speaks
        # detection. A mispaired adapter/plugin is a bundle error — fail loud.
        if result.result_type is not ResultType.detection:
            raise ValueError(
                f"{type(self).__name__} handles detection results, got "
                f"{result.result_type.value!r} for {config.sku_id!r}"
            )

        expected = list(config.params.get("expected_parts") or config.classes)
        if not expected:
            raise ValueError(
                f"{config.sku_id!r}: configure params.expected_parts or classes"
            )
        min_confidence = config.thresholds.get("min_confidence", 0.0)

        # Best (highest-confidence) detection per label, so a check can localize
        # the part and report the strongest evidence for it.
        best: dict[str, Detection] = {}
        for det in result.payload.detections:
            incumbent = best.get(det.label)
            if incumbent is None or det.confidence > incumbent.confidence:
                best[det.label] = det

        checks: list[dict[str, Any]] = []
        missing: list[str] = []
        for part in expected:
            det = best.get(part)
            if det is not None and det.confidence >= min_confidence:
                checks.append(
                    {
                        "name": part,
                        "status": "pass",
                        "expected": "present",
                        "actual": f"detected ({det.confidence:.2f})",
                        "box": _box_dict(det),
                    }
                )
                continue

            missing.append(part)
            if det is not None:  # detected, but below the confidence bar
                checks.append(
                    {
                        "name": part,
                        "status": "fail",
                        "expected": f"present (>= {min_confidence:.2f})",
                        "actual": f"low confidence ({det.confidence:.2f})",
                        "message": (
                            f"{part} detected at {det.confidence:.2f}, "
                            f"below min_confidence {min_confidence:.2f}"
                        ),
                        "box": _box_dict(det),
                    }
                )
            else:  # not detected at all
                checks.append(
                    {
                        "name": part,
                        "status": "missing",
                        "expected": "present",
                        "actual": "not detected",
                        "message": f"no {part} detected",
                    }
                )

        passed = not missing
        if passed:
            reason = (
                f"all {len(expected)} expected parts present "
                f"(min_confidence={min_confidence})"
            )
        else:
            reason = "missing parts: " + ", ".join(missing)

        detected = [p for p in expected if p not in missing]
        return Verdict(
            passed=passed,
            reason=reason,
            details={
                "checks": checks,
                "expected_parts": expected,
                "detected_parts": detected,
                "missing_parts": missing,
                "min_confidence": min_confidence,
            },
        )
