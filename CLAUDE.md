# CLAUDE.md — source of truth for the Multi-SKU Inspection Pipeline

A SKU is **data + plugins, never core code**. Adding SKU #N = a new bundle folder
+ one `ModelAdapter` + one `RulePlugin` + register. Zero edits to core / backend /
frontend. This file is the contract every track (chat/subagent) works against.

## The non-negotiable rule
**Never branch on a specific SKU identity in shared code.** No `if sku_id == "x"`,
no `match sku_id: case "x"`. Dispatch happens two ways only:
- by **`sku_id`** — which bundle the registry loads (a lookup key, not a branch);
- by **`ResultType`** — how a result is interpreted / validated (a dispatch table).

Comparing two ids for a consistency check (`result.sku_id != bundle.sku_id`) is
fine — it isn't hardcoded identity. `tests/test_conformance.py` AST-scans `core/`,
`backend/`, and the shared `ml/` runners and fails the build on any violation.

## Frozen contracts (`core/contracts.py`)
The spine. Defined once, imported everywhere, redefined nowhere.
- **`ModelResult`** — uniform envelope: `sku_id`, `payload` (discriminated union on
  `type`), `result_type` (top-level, derived from the payload), `model_version`,
  `raw`. Payloads: `DetectionPayload`, `ClassificationPayload`, `MeasurementPayload`.
- **`Verdict`** — `passed`, `reason` (always populated), `details`.
- **`SkuConfig`** — declarative bundle config (`result_type`, `adapter_id`,
  `plugin_id`, `classes`, `thresholds`, `params`). Data only, no logic.
- **`ModelAdapter.predict(image) -> ModelResult`** — per-SKU, in `ml/adapters/`.
- **`RulePlugin.evaluate(result, config) -> Verdict`** — per-SKU, in `plugins/`.

**Only the core/backend chat edits `core/contracts.py`.** Other tracks import from
it and request changes; they never redefine a contract.

### Adding a new `ResultType` — the only expected contract change (4 steps)
1. Add a member to `ResultType`.
2. Define its payload model with a `type: Literal[...]` discriminator.
3. Add it to `_PayloadUnion` in `core/contracts.py`.
4. Register a reducer in `ml/validate.py` (`_REDUCERS`).
The conformance test fails if any `ResultType` lacks a validation reducer.

## Ownership
| Path | Owner | Notes |
|------|-------|-------|
| `core/` | core/backend | contracts, registry, orchestration, logging |
| `backend/` | core/backend | FastAPI runtime path |
| `ml/validate.py`, `ml/train.py`, `ml/__init__.py` | core/backend | model-agnostic runners |
| `ml/adapters/` | adapter-writer | one `ModelAdapter` per SKU, `@register_adapter(id)` |
| `plugins/` | plugin-writer | one `RulePlugin` per SKU, `@register_plugin(id)` |
| `skus/<id>/` | per-SKU data | `sop.yaml`, `config.yaml`, `data/`, `model/`, `metrics/` |
| `tests/` | test-writer + core (conformance/backend) | |
| `frontend/` | frontend | builds against the published OpenAPI schema |

## Runtime path (`backend/main.py` -> `core/orchestration.py`)
`POST /inspect` (multipart `sku_id` + `image`) walks:
identify -> load bundle -> resolve adapter+plugin by id -> `predict` -> assert the
result's `result_type` matches config -> `evaluate` -> assert the verdict has a
reason -> log to JSONL -> return the `InspectionRecord`.

## The published contract
`GET /openapi.json` (or `python -m scripts.publish_openapi` -> `openapi/openapi.json`)
is the authoritative schema the frontend builds on. Every response model is a frozen
core contract, so the schema cannot drift from the pipeline.

## Registering a plugin (adapter / rule)
```python
from core.registry import register_adapter, register_plugin
@register_adapter("my_adapter")
class MyAdapter(ModelAdapter): ...
@register_plugin("my_rule")
class MyRule(RulePlugin): ...
```
The registry imports every submodule of `ml.adapters` and `plugins` on startup, so
dropping a module in and naming its id in `config.yaml` is all that's needed.

## Running
```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload        # runtime API + docs at /docs
python -m scripts.publish_openapi         # regenerate openapi/openapi.json
pytest -q                                 # full suite incl. conformance
```
