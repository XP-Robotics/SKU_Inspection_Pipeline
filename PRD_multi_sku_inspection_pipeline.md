# PRD — Multi-SKU Visual Inspection Pipeline

**Owner:** Solo developer (frontend + backend + ML)
**Status:** Draft v1
**Last updated:** 2026-07-03

---

## 1. Summary
A visual quality-inspection platform that classifies products as pass/fail. Each
product is a **SKU** with its own capture SOP, dataset, model, and pass/fail
logic. The platform is built so adding a new SKU is configuration + two small
plugins — never changes to the core pipeline.

## 2. Problem
Inspection logic differs per product: different capture rules, different model
types, and genuinely different pass/fail criteria. A naïve build hardcodes each
product into the pipeline, so every new product means rewriting core code. That
does not scale for a solo developer maintaining many SKUs.

## 3. Goals
- **G1 — SKU scalability.** Onboard a new SKU without editing shared code.
- **G2 — Heterogeneity.** Support different model types (detection,
  classification, measurement, extensible) and different pass/fail logic per SKU.
- **G3 — Traceability.** Every inspection yields a verdict with a human-readable
  reason and is logged.
- **G4 — Solo-dev workflow.** Work is divisible into isolated, contract-bound
  units suitable for delegation (Claude Code subagents).

### Non-goals (v1)
- Cross-SKU shared model.
- Real-time line integration / PLC control.
- Multi-tenant / user management beyond the developer.

## 4. Users
- **Developer** (you): authors SOPs, runs build phase, maintains plugins.
- **Operator** (runtime): triggers inspection, reads pass/fail results.

## 5. Core concepts

### 5.1 SKU bundle (unit of scale)
Each SKU is a folder on disk:
```
skus/<sku_id>/
  sop.yaml       capture rules + pass/fail definition (human-authored)
  config.yaml    model type, class list, thresholds, adapter+plugin ids
  data/          images + labels
  model/         trained weights
  metrics/       confusion matrix + validation report
```

### 5.2 Frozen contracts (`core/contracts.py`)
The system's spine. Never redefined elsewhere.
- **`ModelResult`** — uniform envelope, type-specific payload
  (`detection` / `classification` / `measurement` / extensible).
- **`Verdict`** — `passed`, `reason`, `details`.
- **`ModelAdapter.predict(image) -> ModelResult`** — per-SKU; wraps any model type.
- **`RulePlugin.evaluate(result, config) -> Verdict`** — per-SKU pass/fail.

### 5.3 The scalability rule (non-negotiable)
- No branching on `sku_id` in shared code.
- Dispatch only by SKU id (which bundle to load) and result type (how to
  interpret/validate).
- Adding SKU #N = new bundle folder + one `ModelAdapter` + one `RulePlugin` +
  register. Zero edits to core / backend / frontend.

## 6. Architecture

| Layer | Scope | Responsibility |
|-------|-------|----------------|
| `core/` | shared | registry, frozen contracts, orchestration, dispatch |
| `ml/` | shared + per-SKU adapters | training runner, validation (by result type), model adapters |
| `plugins/` | per-SKU | `RulePlugin` pass/fail implementations |
| `backend/` | shared | FastAPI runtime path, logging |
| `frontend/` | shared | SOP authoring, annotation review, dashboards, results |
| `skus/<id>/` | per-SKU data | the bundle |

## 7. Process flow

### Build phase (per SKU, once)
1. Define SKU (id + metadata).
2. Author SOP (capture rules + pass/fail definition).
3. Capture data per SOP.
4. Annotate images.
5. Train model (type chosen for this SKU).
6. Validate — confusion matrix, dispatched by result type.
7. Register bundle in the registry.

### Runtime phase (per product)
1. Identify SKU (scan / select).
2. Load bundle from registry.
3. Capture image per SOP.
4. `ModelAdapter.predict` → `ModelResult`.
5. `RulePlugin.evaluate` → `Verdict` (pass/fail + reason).
6. Log result.

## 8. Tech stack
- Core + backend: Python 3.11, FastAPI, pydantic (all contracts).
- ML: per-SKU model types (e.g. detection via RF-DETR/YOLO, classification,
  measurement).
- Frontend: React.
- Storage: files on disk per-SKU (DB/model-registry deferred).

## 9. Development workflow (solo dev)
- Contracts frozen in `core/contracts.py` first; `CLAUDE.md` is source of truth.
- Core / registry / backend / frontend: main working session (whole-system context).
- Repetitive per-SKU work delegated to Claude Code subagents:
  `adapter-writer`, `plugin-writer`, `test-writer`, each locked to the frozen
  interfaces and forbidden from touching core.

## 10. Success metrics
- Onboard a new SKU with **zero** edits to shared code (G1 pass/fail check).
- Per-SKU validation reported as a confusion matrix in `skus/<id>/metrics/`.
- Every runtime inspection produces a logged `Verdict` with a reason.

## 11. Risks & mitigations
- **Data quality / generalization** — biggest risk; a model trained on too few
  units or near-duplicate images won't generalize. Mitigation: SOP enforces
  capture variety; validate on a held-out set split by capture session, not
  randomly.
- **Contract drift** — agents redefining types. Mitigation: single source of
  truth + conformance tests + `CLAUDE.md` rules.
- **Rule sprawl** — pass/fail logic leaking into core. Mitigation: rule engine +
  per-SKU plugins behind one interface; ban `sku_id` branching.
- **Result-type explosion** — adding types carelessly. Mitigation: adding a
  `ResultType` is a controlled contracts change with a defined 4-step procedure.

## 12. Milestones
1. Contracts + `CLAUDE.md` + subagent roles. **(done)**
2. Registry: discover/load bundle, resolve adapter+plugin by id.
3. FastAPI runtime path: identify → load → predict → evaluate → log.
4. Build-phase runners: train + validate (confusion matrix by result type).
5. First real SKU end-to-end (adapter + plugin + bundle).
6. React frontend: SOP authoring, annotation review, dashboards.
7. Second SKU with a *different* model type — proves G1/G2.
