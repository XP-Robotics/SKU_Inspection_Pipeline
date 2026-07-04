# Frontend — Multi-SKU Visual Inspection

React app surface for the inspection pipeline: **runtime results** (pass/fail +
reason + which part failed), **SOP authoring**, **annotation/dataset review**,
and **validation dashboards** (confusion matrix).

This app is presentation + API calls only. It has **no backend or ML logic** and
talks only to the API contract. It does not import from `core/`, `backend/`,
`ml/`, `plugins/`, or `skus/`.

## Quick start

```bash
cp .env.example .env      # VITE_USE_MOCKS=true by default
npm install
npm run dev               # http://localhost:5173
```

With mocks on (the default) the app is fully functional with **no backend** —
requests to `/api/*` are intercepted in the browser by Mock Service Worker and
answered from `src/mocks/fixtures.ts`.

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | `tsc -b` only |
| `npm run verify` | Typecheck + validate every mock fixture against the contract + server-render the key views (headless, no browser) |
| `npm run preview` | Serve the production build |

`npm run verify` is the fast confidence check: it proves the mock data still
satisfies the zod schemas (i.e. the contract) and that the Results view and
confusion matrix render mocked data without throwing.

## The API contract (fixed input)

The **authoritative** schema is published by the backend/core chat at
**`openapi/openapi.json`** (repo root). The frontend mirrors it exactly and never
invents or works around shapes:

- **`src/api/schemas.ts`** — runtime-validated zod mirror, split into two
  sections: **AUTHORITATIVE** (exact mirror of `openapi/openapi.json`) and
  **PROPOSED** (shapes for endpoints the backend hasn't published yet).
- **`src/api/types.ts`** — types inferred from the schemas. Import API types from
  here; never redefine these shapes.
- **`src/api/client.ts`** — `api.*` for real endpoints, `api.proposed.*` for
  unpublished ones. Every response is parsed through its schema, so **contract
  drift fails loudly at the boundary** (surfaced in the UI as an "API contract
  mismatch" error) instead of corrupting a view.

**When the backend schema changes, update the AUTHORITATIVE section of
`schemas.ts` to match — do not diverge.** Anything the frontend needs that the
schema lacks is tracked in **`docs/backend-requests.md`**, not hacked around.

### Endpoints consumed

Authoritative (`openapi/openapi.json`):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/healthz` | Health check |
| `GET` | `/api/skus` | List SKU bundles (`SkuListResponse`) |
| `GET` | `/api/skus/{id}` | SKU config (`SkuConfig`) |
| `POST` | `/api/inspect` | Run one inspection → `InspectionRecord` |

Proposed — mock-backed, **pending backend** (see `docs/backend-requests.md`):

| Method | Path | Purpose |
|--------|------|---------|
| `GET`/`PUT` | `/api/skus/{id}/sop` | Read / author the SOP |
| `GET` | `/api/skus/{id}/metrics` | Validation report + confusion matrix |
| `GET` | `/api/skus/{id}/dataset` | Dataset images + annotation status |
| `GET` | `/api/inspections` | Inspection log |

## Switching to the real backend

1. Start FastAPI (expected at `http://localhost:8000`; override with
   `VITE_API_TARGET`).
2. Set `VITE_USE_MOCKS=false` in `.env`.

The Vite dev proxy forwards `/api` → the backend. No frontend code changes: the
client already uses same-origin relative URLs.

## Structure

```
docs/backend-requests.md    what the frontend needs the backend to add
src/
  api/                      schemas (zod, authoritative + proposed) · types · typed client
  mocks/                    MSW handlers + deterministic fixtures
  components/               shared UI (states, cards, badges)
  features/
    skus/                   SKU bundle list + per-SKU subnav
    inspect/                Run inspection + inspection log
    results/                Results view (verdict, checks, annotated image, model output)
    sop/                    SOP authoring form
    dataset/                Dataset & annotation review
    metrics/                Validation dashboard + confusion matrix
  lib/                      small hooks/utils
scripts/                    headless contract + render verification
```

## Notes for the backend chat

The **`Verdict.details.checks[]`** convention is how the Results view localizes
"which part/screw failed": each entry is `{ name, status, expected?, actual?,
message?, bbox? }`. Plugins that emit it get a per-feature table and image
overlays for free; plugins that don't still render (reason only). If the real
`RulePlugin` output shape is different, tell the frontend chat so the contract
and this convention can be aligned.
