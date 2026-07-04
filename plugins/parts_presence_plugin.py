"""PartsPresencePlugin — detection pass/fail by required-part presence.

Policy: PASS iff every expected part is detected with confidence >= a configured
threshold; otherwise FAIL, naming the missing parts. Expected parts and the
threshold come entirely from the SKU config (``params.expected_parts`` /
``thresholds.min_confidence``) — no SKU values in code.
"""

from __future__ import annotations

from core.contracts import ModelResult, ResultType, RulePlugin, SkuConfig, Verdict
from core.registry import register_plugin


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

        detected = {
            d.label
            for d in result.payload.detections
            if d.confidence >= min_confidence
        }
        missing = [part for part in expected if part not in detected]
        passed = not missing

        if passed:
            reason = (
                f"all {len(expected)} expected parts present "
                f"(min_confidence={min_confidence})"
            )
        else:
            reason = "missing parts: " + ", ".join(missing)

        return Verdict(
            passed=passed,
            reason=reason,
            details={
                "expected_parts": expected,
                "detected_parts": sorted(detected),
                "missing_parts": missing,
                "min_confidence": min_confidence,
            },
        )
