# XP Robotics — Multi-SKU Visual Inspection Pipeline

A configuration-driven platform for automated visual quality inspection. Every
product is a **SKU** with its own capture rules, dataset, model, and pass/fail
logic. Adding a new product means adding a config and two small plugins — never
editing the core pipeline.

## Why

Inspection logic differs per product: different capture requirements, different
model types, and genuinely different pass/fail criteria. Hardcoding each product
into the pipeline means rewriting core code for every new one. Arbiter treats a
SKU as **data + plugins**, so the system scales horizontally across products
without touching shared code.

## Key ideas

- **A SKU is a self-contained bundle** on disk: SOP, dataset, model, rules, metrics.
- **Frozen contracts** at the boundaries (`ModelResult`, `Verdict`, `ModelAdapter`,
  `RulePlugin`) let every part evolve independently.
- **Heterogeneous by design** — model type (detection / classification /
  measurement / extensible) and pass/fail logic both vary per SKU.
- **No `sku_id` branching in shared code.** Dispatch happens by SKU id (which
  bundle to load) and result type (how to interpret) only.
- **Adding SKU #N** = new bundle folder + one adapter + one rule plugin + register.
  Zero edits to core, backend, or frontend.

## How it works

### Build phase (once per SKU)
Author SOP → capture data → annotate → train model → validate (confusion matrix)
→ register the bundle.

### Runtime phase (per product)
Identify SKU → load bundle → predict (model adapter → `ModelResult`) → evaluate
(rule plugin → `Verdict`) → log.

## Architecture

| Layer        | Scope        | Responsibility                                   |
|--------------|--------------|--------------------------------------------------|
| `core/`      | shared       | registry, frozen contracts, orchestration        |
| `ml/`        | shared + per-SKU | training, validation (by result type), adapters |
| `plugins/`   | per-SKU      | `RulePlugin` pass/fail implementations           |
| `backend/`   | shared       | runtime API: identify → load → predict → evaluate → log |
| `frontend/`  | shared       | SOP authoring, annotation review, dashboards     |
| `skus/<id>/` | per-SKU data | the bundle                                        |

### SKU bundle layout
```
skus/<sku_id>/
  sop.yaml       capture rules + pass/fail definition
  config.yaml    model type, class list, thresholds, adapter + plugin ids
  data/          images + labels
  model/         trained weights
  metrics/       confusion matrix + validation report
```

## Core contracts

Defined once in `core/contracts.py` and imported everywhere — never redefined.

- `ModelResult` — uniform envelope, type-specific payload.
- `Verdict` — `passed`, `reason`, `details`.
- `ModelAdapter.predict(image) -> ModelResult` — wraps any model type for one SKU.
- `RulePlugin.evaluate(result, config) -> Verdict` — pass/fail for one SKU.

Adding a new `ResultType` is the only expected extension, following the procedure
documented in `core/contracts.py`.

## Adding a SKU

1. Create `skus/<sku_id>/` and author `sop.yaml` (capture rules + pass/fail).
2. Capture and annotate data per the SOP.
3. Train a model of the appropriate type; drop weights in `model/`.
4. Implement a `ModelAdapter` (normalizes output to `ModelResult`).
5. Implement a `RulePlugin` (turns `ModelResult` into a `Verdict`).
6. Register the bundle. No core changes required.

## Tech stack

- **Core / backend:** Python 3.11, FastAPI, pydantic
- **ML:** per-SKU model types (object detection, classification, measurement, …)
- **Frontend:** React
- **Storage:** files on disk per SKU

## Status

Early development. Contracts and per-SKU plugin interfaces are stable; registry,
runtime API, and build-phase runners are in progress.

## Roadmap

- [x] Frozen contracts + interfaces
- [ ] SKU registry (discover / load / resolve by id)
- [ ] Runtime API (identify → load → predict → evaluate → log)
- [ ] Build-phase runners (train + validate)
- [ ] First SKU end-to-end
- [ ] Frontend (SOP authoring, annotation review, dashboards)
- [ ] Second SKU with a different model type
