# STATUS — SKU Inspection Pipeline

Living tracker. Updated after every meaningful change.

_Last updated: 2026-07-04 · integrated commit `86dd20a` (master) · tests: 37 passed_

---

## Pipeline stages

Runtime flow: identify SKU → load bundle → predict (adapter → `ModelResult`) →
evaluate (plugin → `Verdict`) → log.
Build flow (per SKU): author SOP → capture → annotate → train → validate → register.

| Stage | State | Notes |
|-------|-------|-------|
| Core spine (contracts, registry, orchestration) | **DONE** | `core/` — frozen contracts, bundle auto-discovery, adapter+plugin resolution by id + result type |
| Backend runtime (FastAPI) | **DONE** | `POST /inspect`, `GET /skus`, `GET /skus/{id}`, `POST /skus`, `GET /healthz`; JSONL logging |
| Model adapter layer | **DONE (stub)** | `StubAdapter` (id `stub`) — canned payload from config, no weights. Real models drop in at GPU phase. |
| Rule plugin layer | **DONE** | `PartsPresencePlugin` (id `parts_presence`) — detection pass/fail from `expected_parts` + `min_confidence`; emits `details.checks` |
| SKU bundles | **DONE (1 of ≥2)** | `demo_bracket` (detection). Second SKU (classification/measurement) = TODO |
| Validate runner (confusion matrix) | **DONE** | `ml/validate.py` — dispatched by result type |
| Conformance test (no `if sku_id ==`) | **DONE** | `tests/test_conformance.py` AST-scans shared code |
| OpenAPI publication | **DONE** | `openapi/openapi.json` via `scripts/publish_openapi.py` |
| Frontend app (React+TS) | **DONE** | results view, SOP authoring, dataset review, validation dashboard, add-SKU dialog; MSW mock layer |
| Frontend ↔ live backend wiring | **IN PROGRESS** | vite `/api` proxy + rewrite landed; end-to-end run vs real `/inspect` not yet done (issue #3) |
| Second SKU (heterogeneity proof) | **TODO** | new bundle + adapter + plugin, zero shared-code edits |
| Real models / Triton / TensorRT | **TODO (GPU phase)** | deferred until servers arrive |

## Cross-cutting handshakes

| Handshake | State | Notes |
|-----------|-------|-------|
| **ModelResult / Verdict contract** | **STABLE** | `core/contracts.py` is single source of truth; imported everywhere, never redefined. Discriminated `ModelResult` (detection/classification/measurement), `Verdict{passed,reason,details}` |
| **OpenAPI schema** | **STABLE** | `openapi/openapi.json` published; frontend API client mirrors it |

## Open contract requests

| Request | Waits on | State |
|---------|----------|-------|
| `details.checks[]` (name/status/expected/actual/box) — "which part failed" | core / `contracts.py` | **PARTIAL** — plugin **emits** it, frontend **consumes** it (`ChecksTable`), but `core/contracts.py` has **not** formally blessed the shape. Next: type/document `checks[]` in contracts so it's a first-class convention (issue #2) |
| 5 lower-priority endpoints (inspections list, SOP read/write, metrics, dataset, image ref) | backend | **OPEN** — see `frontend/docs/backend-requests.md` |

## Git / branch state

- **master `86dd20a`** — all three tracks consolidated (this is the integrated trunk). Not pushed.
- Merge order used: core+backend (ff to `8c3fcac`) → ML/SKU (`e07b58c`) → frontend (`86dd20a`).
- Track branches (now merged, retained as history): `feat/core-backend 8c3fcac`, `feat/ml-skus 6d8631f`, `feat/frontend 81b49c7`.
- Each track has its own git **worktree** (issue #1 done): `.worktrees/master`, `.worktrees/backend`, `ml-worktree`, and this frontend worktree.
- `main 75cb09a` — still docs-only (remote default branch); **not** advanced. Reconcile main↔master before any push.
- Consolidation resolved the git tangle (issue #1): docs-only master, collapsed HEADs. No work lost.

## Last test run

`python3 -m pytest -q` → **37 passed** (integrated master `86dd20a`).
Frontend: headless build + contract/render checks (verified on `feat/frontend`).

## Next actions (priority order)

1. **Issue #2 (finish):** bless `checks[]` in `core/contracts.py` (plugin+frontend already speak it).
2. **Issue #3:** run frontend against live backend (`VITE_USE_MOCKS=false`) end-to-end vs real `/inspect`.
3. **Second SKU:** classification or measurement bundle to prove heterogeneity (no shared-code edits).

