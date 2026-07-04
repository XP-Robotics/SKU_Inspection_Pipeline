"""End-to-end through the real core: identify -> load -> predict -> evaluate -> log.

This exercises the full runtime path using only core (registry + logging) and
the per-SKU stub adapter + rule plugin — no SKU-specific branching anywhere. It
is the closest end-to-end achievable until the backend HTTP route lands; the
backend will call exactly this sequence.
"""
from __future__ import annotations

import json
from pathlib import Path

from core.contracts import ModelResult, Verdict
from core.logging import InspectionLogger, InspectionRecord
from core.registry import SkuRegistry

SKUS_ROOT = Path(__file__).resolve().parents[1] / "skus"
SKU_ID = "demo_bracket"


def test_demo_bracket_runs_end_to_end(tmp_path: Path):
    registry = SkuRegistry(SKUS_ROOT)

    # identify -> load
    assert SKU_ID in registry.discover()
    bundle = registry.load(SKU_ID)

    # resolve per-SKU plugins by id (no sku_id branching in this shared code)
    adapter = registry.resolve_adapter(bundle)
    plugin = registry.resolve_plugin(bundle)

    # predict -> evaluate
    result = adapter.predict(b"fake-image")
    assert isinstance(result, ModelResult)

    verdict = plugin.evaluate(result, bundle.config)
    assert isinstance(verdict, Verdict)

    # The demo bundle's canned result has every required part -> PASS.
    assert verdict.passed is True
    assert verdict.details["missing_parts"] == []

    # log
    log_path = tmp_path / "inspections.jsonl"
    logger = InspectionLogger(log_path)
    logger.log(InspectionRecord(sku_id=SKU_ID, result=result, verdict=verdict))

    lines = log_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert record["sku_id"] == SKU_ID
    assert record["verdict"]["passed"] is True
    assert record["result"]["payload"]["type"] == "detection"
