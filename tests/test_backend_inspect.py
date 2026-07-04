"""True end-to-end through the FastAPI backend: POST /inspect -> Verdict.

Drives the real backend app (read-only; we never edit backend/). Only the log
sink is redirected to a tmp file via dependency override so the test leaves no
trace. This is the DONE criterion: a bundle run end-to-end through the backend,
returning a correct Verdict.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app, get_service
from core.logging import InspectionLogger
from core.orchestration import InspectionService
from core.registry import SkuRegistry

SKUS_ROOT = Path(__file__).resolve().parents[1] / "skus"
SKU_ID = "demo_bracket"


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    service = InspectionService(
        SkuRegistry(SKUS_ROOT), InspectionLogger(tmp_path / "inspections.jsonl")
    )
    app.dependency_overrides[get_service] = lambda: service
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_demo_bracket_lists_and_inspects(client: TestClient):
    # SKU is discoverable through the backend.
    listed = client.get("/skus").json()["skus"]
    assert any(s["sku_id"] == SKU_ID for s in listed)

    # Full runtime path over HTTP.
    resp = client.post(
        "/inspect",
        data={"sku_id": SKU_ID},
        files={"image": ("unit.jpg", b"fake-image-bytes", "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text

    record = resp.json()
    assert record["sku_id"] == SKU_ID
    assert record["verdict"]["passed"] is True
    assert record["verdict"]["details"]["missing_parts"] == []
    assert record["result"]["payload"]["type"] == "detection"
