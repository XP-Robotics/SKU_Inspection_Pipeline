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

from fastapi import APIRouter, Body, Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from typing import Any

from backend import settings
from backend.database import get_db
from backend.models import InspectionLog, SkuSOP
from core.contracts import ResultType, SkuConfig
from core.logging import InspectionLogger, InspectionRecord
from core.orchestration import InspectionService, OrchestrationError
from core.registry import BundleExistsError, RegistryError, SkuRegistry

app = FastAPI(
    title="Multi-SKU Visual Inspection Pipeline",
    version="1.0.0",
    summary="Identify SKU -> load bundle -> predict -> evaluate -> verdict -> log.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter()


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
@router.get("/healthz", response_model=HealthResponse, tags=["ops"])
def healthz() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/skus", response_model=SkuListResponse, tags=["skus"])
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


@router.post(
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


@router.get("/skus/{sku_id}", response_model=SkuConfig, tags=["skus"])
def get_sku(
    sku_id: str, service: InspectionService = Depends(get_service)
) -> SkuConfig:
    """Return the declarative config for one SKU bundle."""
    try:
        return service.load_bundle(sku_id).config
    except RegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _normalize_sop(sop: dict, sku_id: str) -> dict:
    """Ensure SOP has all required fields per API contract."""
    return {
        "sku_id": sop.get("sku_id", sku_id),
        "version": sop.get("version", 1),
        "capture": {
            "angles": sop.get("capture", {}).get("angles", []),
            "lighting": sop.get("capture", {}).get("lighting", ""),
            "distance_cm": sop.get("capture", {}).get("distance_cm", sop.get("capture", {}).get("distance", 0)),
            "background": sop.get("capture", {}).get("background", ""),
            "min_images": sop.get("capture", {}).get("min_images", 0),
            "notes": sop.get("capture", {}).get("notes", ""),
        },
        "pass_fail": {
            "summary": sop.get("pass_fail", {}).get("summary", ""),
            "rules": sop.get("pass_fail", {}).get("rules", []),
        },
    }


@router.get("/skus/{sku_id}/sop", tags=["skus"])
def get_sop(
    sku_id: str,
    service: InspectionService = Depends(get_service),
    db: Session = Depends(get_db),
):
    """Get the SOP (Standard Operating Procedure) for a SKU bundle.

    Reads from database if available, otherwise loads from file and stores in DB.
    Returns empty template if no SOP exists yet.
    """
    try:
        # Check database first
        db_sop = db.query(SkuSOP).filter(SkuSOP.sku_id == sku_id).first()
        if db_sop:
            return _normalize_sop(db_sop.content, sku_id)

        # Load bundle to verify it exists
        bundle = service.load_bundle(sku_id)
        sop_content = bundle.sop if bundle.sop else {"sku_id": sku_id}

        # Normalize to ensure all required fields exist
        normalized_sop = _normalize_sop(sop_content, sku_id)

        # Store in database for future access
        db_sop = SkuSOP(sku_id=sku_id, content=normalized_sop)
        db.add(db_sop)
        db.commit()

        return normalized_sop
    except RegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/skus/{sku_id}/sop", tags=["skus"])
def update_sop(
    sku_id: str,
    sop_data: dict = Body(...),
    service: InspectionService = Depends(get_service),
    db: Session = Depends(get_db),
):
    """Update the SOP for a SKU bundle.

    Saves to both database and sop.yaml file for persistence.
    Request body should be the SOP JSON object directly.
    """
    try:
        # Verify bundle exists
        bundle = service.load_bundle(sku_id)

        # Update database
        db_sop = db.query(SkuSOP).filter(SkuSOP.sku_id == sku_id).first()
        if db_sop:
            db_sop.content = sop_data
        else:
            db_sop = SkuSOP(sku_id=sku_id, content=sop_data)
            db.add(db_sop)
        db.commit()

        # Also update file for version control
        sop_file = bundle.root / "sop.yaml"
        import yaml
        with open(sop_file, 'w') as f:
            yaml.dump(sop_data, f)

        return sop_data
    except RegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update SOP: {str(exc)}") from exc


@router.post("/inspect", response_model=InspectionRecord, tags=["inspection"])
async def inspect(
    sku_id: str = Form(..., description="Which SKU bundle to inspect against."),
    image: UploadFile = File(..., description="The captured product image."),
    service: InspectionService = Depends(get_service),
    db: Session = Depends(get_db),
) -> InspectionRecord:
    """Run the full runtime path and return the logged inspection record.

    Body is ``multipart/form-data``: ``sku_id`` field + ``image`` file.
    Results are saved to SQLite database for persistence.
    """
    image_bytes = await image.read()
    try:
        inspection_result = service.inspect(sku_id, image_bytes)

        # Save to database
        log_entry = InspectionLog(
            inspection_id=inspection_result.inspection_id,
            sku_id=sku_id,
            verdict_passed=inspection_result.verdict.passed,
            verdict_reason=inspection_result.verdict.reason,
            model_version=inspection_result.result.model_version,
            result_type=inspection_result.result.result_type.value,
            payload=inspection_result.result.model_dump(),
        )
        db.add(log_entry)
        db.commit()

        return inspection_result
    except RegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OrchestrationError as exc:
        # Adapter/plugin violated the contract for this bundle.
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/inspections", tags=["inspection"])
def list_inspections(
    sku_id: str = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Get inspection history from database.

    Optional filters:
    - ``sku_id``: Filter by specific SKU
    - ``limit``: Maximum results (default 50)
    """
    query = db.query(InspectionLog).order_by(InspectionLog.created_at.desc())
    if sku_id:
        query = query.filter(InspectionLog.sku_id == sku_id)
    return query.limit(limit).all()


@router.get("/inspections/{inspection_id}", tags=["inspection"])
def get_inspection(inspection_id: str, db: Session = Depends(get_db)):
    """Get details of a specific inspection."""
    inspection = db.query(InspectionLog).filter(
        InspectionLog.inspection_id == inspection_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return inspection


@router.get("/skus/{sku_id}/dataset", tags=["dataset"])
def get_dataset(
    sku_id: str,
    service: InspectionService = Depends(get_service),
):
    """Get dataset info and images for a SKU bundle.

    Returns list of images in the data/ directory with their annotation status.
    """
    try:
        import os
        from pathlib import Path

        bundle = service.load_bundle(sku_id)
        data_dir = bundle.root / "data"

        # Scan for image files (recursively)
        images = []
        if data_dir.exists():
            for file in sorted(data_dir.rglob("*")):
                if file.is_file() and file.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
                    # Get relative path from data_dir
                    rel_path = file.relative_to(data_dir)
                    images.append({
                        "id": file.stem,
                        "url": f"/api/skus/{sku_id}/dataset/files/{rel_path}",
                        "annotated": False,  # Would check annotations dir in real implementation
                        "split": None,
                        "capture_session": None,
                    })

        total = len(images)
        annotated = sum(1 for img in images if img.get("annotated", False))

        return {
            "sku_id": sku_id,
            "counts": {
                "total": total,
                "annotated": annotated,
                "unannotated": total - annotated,
            },
            "images": images,
        }
    except RegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to get dataset: {str(exc)}") from exc


@router.post("/skus/{sku_id}/dataset/upload", tags=["dataset"])
async def upload_dataset(
    sku_id: str,
    files: list[UploadFile] = File(...),
    service: InspectionService = Depends(get_service),
):
    """Upload raw dataset images to a SKU bundle.

    Saves files to skus/<sku_id>/data/ directory.
    Handles nested folders and creates directory structure as needed.
    """
    try:
        bundle = service.load_bundle(sku_id)
        data_dir = bundle.root / "data"
        data_dir.mkdir(parents=True, exist_ok=True)

        upload_count = 0
        for file in files:
            if file.filename:
                # Handle nested paths from folder uploads
                file_path = data_dir / file.filename

                # Create parent directories if they don't exist
                file_path.parent.mkdir(parents=True, exist_ok=True)

                # Write file
                content = await file.read()
                with open(file_path, 'wb') as f:
                    f.write(content)
                upload_count += 1

        return {
            "status": "success",
            "files_uploaded": upload_count
        }
    except RegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to upload dataset: {str(exc)}") from exc


@router.post("/skus/{sku_id}/dataset/annotations", tags=["dataset"])
async def upload_annotations(
    sku_id: str,
    file: UploadFile = File(...),
    service: InspectionService = Depends(get_service),
):
    """Upload annotated dataset (COCO format or zip).

    Handles both .coco folders and .coco.zip files. Extracts and stores in
    skus/<sku_id>/data/annotations/ directory.
    """
    try:
        import zipfile
        import shutil

        bundle = service.load_bundle(sku_id)
        annotations_dir = bundle.root / "data" / "annotations"
        annotations_dir.mkdir(parents=True, exist_ok=True)

        # Determine format and extract
        if file.filename.endswith('.zip'):
            # Handle .zip file
            zip_path = annotations_dir / "temp.zip"
            content = await file.read()
            with open(zip_path, 'wb') as f:
                f.write(content)

            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(annotations_dir)
            zip_path.unlink()
            format_type = "coco_zip"
        else:
            # Handle folder upload (would need multiple files)
            content = await file.read()
            file_path = annotations_dir / (file.filename or "annotations.json")
            with open(file_path, 'wb') as f:
                f.write(content)
            format_type = "coco"

        return {
            "status": "success",
            "format": format_type
        }
    except RegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to upload annotations: {str(exc)}") from exc


@router.get("/skus/{sku_id}/dataset/files/{file_path:path}", tags=["dataset"])
def get_dataset_file(
    sku_id: str,
    file_path: str,
    service: InspectionService = Depends(get_service),
):
    """Serve dataset image files.

    Supports both top-level files and nested subdirectories.
    """
    try:
        from fastapi.responses import FileResponse

        bundle = service.load_bundle(sku_id)
        data_dir = bundle.root / "data"

        # Safely resolve the file path
        requested_file = (data_dir / file_path).resolve()

        # Security check: ensure file is within data directory
        if not str(requested_file).startswith(str(data_dir.resolve())):
            raise HTTPException(status_code=403, detail="Access denied")

        if not requested_file.exists():
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(requested_file)

    except HTTPException:
        raise
    except RegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to serve file: {str(exc)}") from exc


@router.delete("/skus/{sku_id}/dataset/delete", tags=["dataset"])
async def delete_dataset_image(
    sku_id: str,
    request_body: dict = Body(...),
    service: InspectionService = Depends(get_service),
):
    """Delete an image from a SKU's dataset.

    Removes the file from skus/<sku_id>/data/ directory.
    Expects: {"file_path": "/api/skus/{sku_id}/dataset/files/{relative_path}"}
    """
    try:
        bundle = service.load_bundle(sku_id)

        # Extract file path from request
        path_value = request_body.get("file_path", "")

        if not path_value:
            raise ValueError("file_path is required")

        # Parse the path to get relative path
        # Handle formats like:
        # - "/api/skus/001/dataset/files/good/image.jpg"
        # - "/api/skus/001/dataset/files/image.jpg"
        if "/dataset/files/" in path_value:
            relative_path = path_value.split("/dataset/files/", 1)[-1]
        else:
            relative_path = Path(path_value).name

        if not relative_path:
            raise ValueError("Could not extract file path")

        # Safely construct full file path
        file_to_delete = (bundle.root / "data" / relative_path).resolve()

        # Security check: ensure file is within data directory
        data_dir = (bundle.root / "data").resolve()
        if not str(file_to_delete).startswith(str(data_dir)):
            raise HTTPException(status_code=403, detail="Access denied")

        if file_to_delete.exists():
            file_to_delete.unlink()
            return {"status": "success", "message": f"Deleted {relative_path}"}
        else:
            raise HTTPException(status_code=404, detail=f"File not found: {relative_path}")

    except HTTPException:
        raise
    except RegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete image: {str(exc)}") from exc


# Include the API router with /api prefix
app.include_router(router, prefix="/api")

# Mount frontend static files (AFTER all API routes)
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    # Mount all static files including assets
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    # Catch-all route: serve index.html for all non-API paths
    # This allows React Router to handle client-side routing
    from fastapi.responses import FileResponse

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve index.html for any non-API path, allowing React Router to handle routing."""
        if full_path.startswith("api/") or full_path.startswith("."):
            return {"detail": "Not Found"}
        return FileResponse(frontend_dist / "index.html")


__all__ = ["app", "get_service"]
