# Backend requests — from the frontend chat

The frontend builds against the authoritative schema at **`openapi/openapi.json`**
(repo root, published by the core/backend chat). This file lists where the
frontend needs something the schema does not yet provide. Per the project rules
the frontend does **not** invent or work around contract shapes — these are asks,
tracked here until the backend chat resolves them.

Status legend: 🟥 blocks a live-backend feature · 🟧 degraded without it · 🟩 nice-to-have.

---

## 1. 🟧 `Verdict.details.checks[]` convention (which part/screw failed)

`Verdict.details` is an open object in the contract. The Results view renders a
per-feature table and image overlays from an optional `checks` array inside it.
This directly serves the core requirement: *show which part/screw failed*.

Requested shape (what RulePlugins should emit in `details`):

```jsonc
"details": {
  "checks": [
    {
      "name": "screw_bottom_right",        // required — the inspected feature
      "status": "pass|fail|missing|warn",  // required
      "expected": "detected",              // optional, display string
      "actual": "not found",               // optional, display string
      "message": "No screw in bottom-right region.", // optional
      "box": { "x": 430, "y": 330, "width": 60, "height": 60 } // optional, locates it on the image
    }
  ]
}
```

**Ask:** bless `checks` as the conventional key in `details` (ideally a typed
model in `core/contracts.py`), and have per-SKU RulePlugins populate it. Without
it the view still works but shows only `passed` + `reason` (no per-feature
breakdown, no overlays).

## 2. 🟥 Image reference on `InspectionRecord`

`InspectionRecord` carries no image. The **live inspect flow** is fine — the view
shows the operator's just-uploaded image locally. But the **inspection log**
(historical records) has no image to show the failed-part overlay on.

**Ask:** add an image locator to `InspectionRecord`, e.g. `image_url` (served by
the backend) or an `GET /inspections/{id}/image` endpoint.

## 3. 🟥 List endpoint: `GET /inspections`

The inspection log (PRD G3 traceability) needs to read logged records. The
backend logs to JSONL but exposes no read endpoint.

**Ask:** `GET /inspections?sku_id=&limit=` → `InspectionRecord[]` (newest first).
Currently mock-backed via `api.proposed.listInspections`.

## 4. 🟥 SOP read/write: `GET`/`PUT /skus/{id}/sop`

The SOP authoring UI reads and saves `sop.yaml` as structured JSON. No endpoint
exists. Proposed `Sop` shape is in `src/api/schemas.ts` (PROPOSED section).

**Ask:** `GET /skus/{id}/sop` → `Sop`, `PUT /skus/{id}/sop` (body `Sop`) → `Sop`.
Currently mock-backed via `api.proposed.getSop` / `putSop`.

## 5. 🟥 Validation metrics: `GET /skus/{id}/metrics`

The metrics dashboard renders the confusion matrix + validation report the build
phase writes to `skus/<id>/metrics/`. No endpoint exposes it.

**Ask:** `GET /skus/{id}/metrics` → `MetricsReport` (see PROPOSED section:
`confusion_matrix {labels, matrix}`, headline `summary`, `per_class`).
Currently mock-backed via `api.proposed.getMetrics`.

## 6. 🟥 Dataset listing: `GET /skus/{id}/dataset`

The dataset/annotation-review dashboard needs the image list + annotation status.

**Ask:** `GET /skus/{id}/dataset` → `Dataset` (image list with `annotated`,
`split`, `capture_session`). Currently mock-backed via `api.proposed.getDataset`.

## 7. 🟥 Create a SKU bundle: `POST /skus`

The SKU bundles page has an **"Add SKU bundle"** action (build phase: *Define
SKU*). It needs a create endpoint. The frontend sends the writable `SkuConfig`
fields; the backend should scaffold `skus/<id>/` (config.yaml) and register it.

Requested:

```
POST /skus            body: CreateSkuRequest → 201 SkuConfig
```

```jsonc
// CreateSkuRequest (mirrors writable SkuConfig fields)
{
  "sku_id": "bracket-a",          // required, ^[a-z0-9][a-z0-9_-]*$
  "name": "Mounting Bracket A",   // optional
  "result_type": "detection",     // required
  "adapter_id": "rfdetr_bracket_a", // required
  "plugin_id": "bracket_a_rules",   // required
  "classes": ["screw", "crack"],  // optional
  "thresholds": {},               // optional
  "params": {}                    // optional
}
```

Expected errors: `409` if the id already exists, `422` on validation. Currently
mock-backed via `api.proposed.createSku`. (Adapter/plugin/data/model/training are
added out-of-band — the create call only defines the bundle config.)

## 8. 🟩 `SkuSummary` enrichment for the bundle list

`SkuSummary` is `{sku_id, name, result_type}`. The SKU bundle cards would benefit
from a build-status and a thumbnail, but the frontend does **not** assume them —
cards currently render a generated monogram and no status.

**Ask (optional):** add `status` (e.g. draft/training/ready) and `thumbnail_url`
to `SkuSummary`.

---

### How the frontend stays honest to the contract
- `src/api/schemas.ts` is split into **AUTHORITATIVE** (exact mirror of
  `openapi/openapi.json`) and **PROPOSED** (the items above).
- `src/api/client.ts` exposes real endpoints as `api.*` and unpublished ones as
  `api.proposed.*`.
- Every response is validated against its schema; a live backend that diverges
  from the mirror surfaces an **"API contract mismatch"** error in the UI instead
  of silently rendering wrong data.
