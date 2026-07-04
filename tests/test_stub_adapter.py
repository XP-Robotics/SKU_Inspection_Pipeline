"""Conformance test for StubAdapter (ml/adapters/stub_adapter.py)."""
from __future__ import annotations

from pathlib import Path

import pytest

from core.contracts import ModelAdapter, ModelResult, ResultType
from core.registry import SkuRegistry, registered_adapters
from ml.adapters.stub_adapter import StubAdapter  # import => registers "stub"

SKUS_ROOT = Path(__file__).resolve().parents[1] / "skus"
SKU_ID = "demo_bracket"


@pytest.fixture
def registry() -> SkuRegistry:
    return SkuRegistry(SKUS_ROOT)


def test_stub_adapter_is_registered_by_id():
    assert registered_adapters().get("stub") is not None


def test_predict_returns_valid_modelresult(registry: SkuRegistry):
    bundle = registry.load(SKU_ID)
    adapter = registry.resolve_adapter(bundle)

    assert isinstance(adapter, ModelAdapter)

    result = adapter.predict(b"ignored-image-bytes")

    # Schema-valid envelope honoring the SKU contract.
    assert isinstance(result, ModelResult)
    assert result.sku_id == SKU_ID
    assert result.result_type is ResultType.detection
    assert result.result_type == bundle.config.result_type
    assert result.model_version == "stub-v0"

    labels = {d.label for d in result.payload.detections}
    assert labels == set(bundle.config.params["expected_parts"])


def test_stub_is_deterministic(registry: SkuRegistry):
    adapter = registry.resolve_adapter(registry.load(SKU_ID))
    assert adapter.predict("a") == adapter.predict("b")  # canned, image-agnostic


def test_stub_rejects_payload_type_mismatch(tmp_path: Path):
    """A stub whose payload type contradicts the declared result_type fails loud."""
    from core.contracts import SkuConfig

    config = SkuConfig(
        sku_id="mismatch",
        result_type=ResultType.classification,  # declares classification...
        adapter_id="stub",
        plugin_id="parts_presence",
        params={"stub": {"payload": {"type": "detection", "detections": []}}},  # ...ships detection
    )
    with pytest.raises(ValueError):
        StubAdapter(config, tmp_path).predict(b"x")
