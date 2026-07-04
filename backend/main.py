"""FastAPI runtime path.

Exposes the inspection pipeline over HTTP. The OpenAPI schema this app publishes
(``/openapi.json``) IS the contract the frontend builds against — every response
model is a frozen core contract, so the schema cannot drift from the pipeline.

Endpoints are SKU-agnostic: the SKU is always a request parameter, and the app
dispatches through the registry. Nothing here branches on a specific SKU id.
"""

from __future__ import annotations

from functools import lru_cache

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from backend import settings
from core.contracts import SkuConfig
from core.logging import InspectionLogger, InspectionRecord
from core.orchestration import InspectionService, OrchestrationError
from core.registry import RegistryError, SkuRegistry

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


__all__ = ["app", "get_service"]
