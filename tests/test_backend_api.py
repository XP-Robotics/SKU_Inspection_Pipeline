"""FastAPI runtime-path tests: identify -> load -> predict -> evaluate -> log.

Drives the real app over HTTP with a TestClient against the ``demo_bracket``
bundle (stub adapter + parts-presence plugin). Also asserts the OpenAPI schema —
the published frontend contract — exposes the frozen core shapes.
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
def client(tmp_path: Path):
    registry = SkuRegistry(SKUS_ROOT)
    logger = InspectionLogger(tmp_path / "inspections.jsonl")
    service = InspectionService(registry, logger)
    app.dependency_overrides[get_service] = lambda: service
    try:
        yield TestClient(app), tmp_path / "inspections.jsonl"
    finally:
        app.dependency_overrides.clear()


def test_healthz(client):
    tc, _ = client
    resp = tc.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_list_skus_includes_demo(client):
    tc, _ = client
    resp = tc.get("/skus")
    assert resp.status_code == 200
    ids = {s["sku_id"] for s in resp.json()["skus"]}
    assert SKU_ID in ids


def test_get_sku_config(client):
    tc, _ = client
    resp = tc.get(f"/skus/{SKU_ID}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["sku_id"] == SKU_ID
    assert body["result_type"] == "detection"
    assert body["adapter_id"] == "stub"


def test_get_unknown_sku_404(client):
    tc, _ = client
    assert tc.get("/skus/does_not_exist").status_code == 404


def test_inspect_full_path_and_logs(client):
    tc, log_path = client
    resp = tc.post(
        "/inspect",
        data={"sku_id": SKU_ID},
        files={"image": ("part.jpg", b"fake-image-bytes", "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Verdict + typed result came back through the frozen contracts.
    assert body["sku_id"] == SKU_ID
    assert body["verdict"]["passed"] is True
    assert body["verdict"]["reason"]
    assert body["result"]["result_type"] == "detection"
    assert body["result"]["payload"]["type"] == "detection"
    assert "inspection_id" in body and "created_at" in body

    # Step 6: it was logged.
    lines = log_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1


def test_inspect_unknown_sku_404(client):
    tc, _ = client
    resp = tc.post(
        "/inspect",
        data={"sku_id": "nope"},
        files={"image": ("x.jpg", b"x", "image/jpeg")},
    )
    assert resp.status_code == 404


def test_openapi_publishes_core_contracts(client):
    tc, _ = client
    schema = tc.get("/openapi.json").json()
    components = schema["components"]["schemas"]
    # The frozen contracts must appear in the published schema.
    for name in ("ModelResult", "Verdict", "InspectionRecord", "SkuConfig"):
        assert name in components, f"{name} missing from OpenAPI schema"
    # ModelResult exposes the top-level result_type discriminator.
    assert "result_type" in components["ModelResult"]["properties"]
    # The runtime path is published.
    assert "/inspect" in schema["paths"]
