"""Tests for POST /skus — create a SKU bundle (build phase "Define SKU").

Uses an isolated temp ``skus_root`` so the real ``skus/`` on disk is untouched.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from backend.main import app, get_service
from core.logging import InspectionLogger
from core.orchestration import InspectionService
from core.registry import SkuRegistry


@pytest.fixture
def client(tmp_path: Path):
    skus_root = tmp_path / "skus"
    skus_root.mkdir()
    service = InspectionService(
        SkuRegistry(skus_root), InspectionLogger(tmp_path / "log.jsonl")
    )
    app.dependency_overrides[get_service] = lambda: service
    try:
        yield TestClient(app), skus_root
    finally:
        app.dependency_overrides.clear()


VALID_BODY = {
    "sku_id": "bracket-a",
    "name": "Mounting Bracket A",
    "result_type": "detection",
    "adapter_id": "rfdetr_bracket_a",
    "plugin_id": "bracket_a_rules",
    "classes": ["screw", "crack"],
    "thresholds": {"screw": 0.5},
    "params": {},
}


def test_create_returns_201_and_scaffolds_disk(client):
    tc, skus_root = client
    resp = tc.post("/skus", json=VALID_BODY)
    assert resp.status_code == 201, resp.text

    body = resp.json()
    assert body["sku_id"] == "bracket-a"
    assert body["result_type"] == "detection"
    assert body["adapter_id"] == "rfdetr_bracket_a"

    # Bundle scaffolded on disk: config.yaml + empty data/model/metrics.
    root = skus_root / "bracket-a"
    assert (root / "config.yaml").is_file()
    for sub in ("data", "model", "metrics"):
        assert (root / sub).is_dir()
    written = yaml.safe_load((root / "config.yaml").read_text())
    assert written["adapter_id"] == "rfdetr_bracket_a"
    assert written["result_type"] == "detection"


def test_new_sku_appears_in_list_and_get_without_restart(client):
    tc, _ = client
    assert tc.post("/skus", json=VALID_BODY).status_code == 201

    ids = {s["sku_id"] for s in tc.get("/skus").json()["skus"]}
    assert "bracket-a" in ids

    got = tc.get("/skus/bracket-a")
    assert got.status_code == 200
    assert got.json()["plugin_id"] == "bracket_a_rules"


def test_duplicate_sku_id_returns_409(client):
    tc, _ = client
    assert tc.post("/skus", json=VALID_BODY).status_code == 201
    dup = tc.post("/skus", json=VALID_BODY)
    assert dup.status_code == 409


def test_unknown_adapter_or_plugin_id_is_allowed(client):
    """A create with ids that aren't registered yet still succeeds (not runnable)."""
    tc, _ = client
    resp = tc.post("/skus", json={**VALID_BODY, "sku_id": "future-sku"})
    assert resp.status_code == 201


@pytest.mark.parametrize(
    "bad",
    [
        {**VALID_BODY, "sku_id": "Bad_ID"},          # uppercase -> pattern fail
        {**VALID_BODY, "sku_id": "-leading-dash"},   # leading dash -> pattern fail
        {k: v for k, v in VALID_BODY.items() if k != "adapter_id"},  # missing field
        {**VALID_BODY, "result_type": "teleport"},   # invalid enum
    ],
)
def test_invalid_body_returns_422(client, bad):
    tc, _ = client
    assert tc.post("/skus", json=bad).status_code == 422
