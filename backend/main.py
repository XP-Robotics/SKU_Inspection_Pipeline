"""FastAPI runtime path.

Exposes the inspection pipeline over HTTP. The OpenAPI schema this app publishes
(``/openapi.json``) IS the contract the frontend builds against — every response
model is a frozen core contract, so the schema cannot drift from the pipeline.

Endpoints are SKU-agnostic: the SKU is always a request parameter, and the app
dispatches through the registry. Nothing here branches on a specific SKU id.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from typing import Any

from backend import settings
from core.contracts import ResultType, SkuConfig
from core.logging import InspectionLogger, InspectionRecord
from core.orchestration import InspectionService, OrchestrationError
from core.registry import BundleExistsError, RegistryError, SkuRegistry

app = FastAPI(
    title="Multi-SKU Visual Inspection Pipeline",
    version="1.0.0",
    summary="Identify SKU -> load bundle -> predict -> evaluate -> verdict -> log.",
)


# --------------------------------------------------------------------------- #
# Wiring (overridable in tests via dependency_overrides)                       #
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=1)
def get_service() -> InspectionService:
    registry = SkuRegistry(settings.skus_root())
    logger = InspectionLogger(settings.inspection_log_path())
    return InspectionService(registry, logger)


# --------------------------------------------------------------------------- #
# Response models (thin wrappers over frozen contracts)                        #
# --------------------------------------------------------------------------- #
class SkuSummary(BaseModel):
    sku_id: str
    name: str | None
    result_type: str


class SkuListResponse(BaseModel):
    skus: list[SkuSummary]


class HealthResponse(BaseModel):
    status: str


class CreateSkuRequest(BaseModel):
    """Body for ``POST /skus`` — the declarative config for a new bundle.

    Mirrors the fields of the frozen :class:`SkuConfig` (build phase "Define SKU").
    ``sku_id`` is constrained to a filesystem-safe slug since it becomes a
    directory name. Validation failures surface as FastAPI's standard 422.
    """

    model_config = {"extra": "forbid"}

    sku_id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    name: str | None = None
    result_type: ResultType
    adapter_id: str
    plugin_id: str
    classes: list[str] = Field(default_factory=list)
    thresholds: dict[str, float] = Field(default_factory=dict)
    params: dict[str, Any] = Field(default_factory=dict)


# --------------------------------------------------------------------------- #
# Routes                                                                       #
# --------------------------------------------------------------------------- #
@app.get("/healthz", response_model=HealthResponse, tags=["ops"])
def healthz() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/skus", response_model=SkuListResponse, tags=["skus"])
def list_skus(service: InspectionService = Depends(get_service)) -> SkuListResponse:
    """List every registered SKU bundle."""
    summaries: list[SkuSummary] = []
    for sku_id in service.discover():
        cfg = service.load_bundle(sku_id).config
        summaries.append(
            SkuSummary(
                sku_id=cfg.sku_id, name=cfg.name, result_type=cfg.result_type.value
            )
        )
    return SkuListResponse(skus=summaries)


@app.post(
    "/skus",
    response_model=SkuConfig,
    status_code=201,
    tags=["skus"],
    summary="Create a SKU bundle",
    responses={
        409: {"description": "A bundle with that sku_id already exists"},
        422: {"description": "Validation error"},
    },
)
def create_sku(
    body: CreateSkuRequest, service: InspectionService = Depends(get_service)
) -> SkuConfig:
    """Create a SKU bundle from its declarative config (build phase "Define SKU").

    Scaffolds ``skus/<sku_id>/`` (config.yaml + empty data/model/metrics + sop
    stub) and returns the persisted :class:`SkuConfig`. The adapter/plugin named
    by id are NOT resolved here — an unknown id is allowed; the bundle simply is
    not runnable until they exist. Generic across SKUs: no identity branching.
    """
    config = SkuConfig(**body.model_dump())
    try:
        bundle = service.create_bundle(config)
    except BundleExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return bundle.config


@app.get("/skus/{sku_id}", response_model=SkuConfig, tags=["skus"])
def get_sku(
    sku_id: str, service: InspectionService = Depends(get_service)
) -> SkuConfig:
    """Return the declarative config for one SKU bundle."""
    try:
        return service.load_bundle(sku_id).config
    except RegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/inspect", response_model=InspectionRecord, tags=["inspection"])
async def inspect(
    sku_id: str = Form(..., description="Which SKU bundle to inspect against."),
    image: UploadFile = File(..., description="The captured product image."),
    service: InspectionService = Depends(get_service),
) -> InspectionRecord:
    """Run the full runtime path and return the logged inspection record.

    Body is ``multipart/form-data``: ``sku_id`` field + ``image`` file.
    """
    image_bytes = await image.read()
    try:
        return service.inspect(sku_id, image_bytes)
    except RegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OrchestrationError as exc:
        # Adapter/plugin violated the contract for this bundle.
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# Mount frontend static files (AFTER all API routes)
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")

__all__ = ["app", "get_service"]
