import { z } from "zod";

/**
 * Runtime-validated mirrors of the API contract.
 *
 * Two sections:
 *   1. AUTHORITATIVE — an exact mirror of the backend's published schema at
 *      `openapi/openapi.json` (repo root). These are the source of truth for the
 *      types the client validates. If the backend schema changes, regenerate/
 *      update this section to match — do not diverge.
 *   2. PROPOSED — shapes for endpoints the frontend needs but the backend has
 *      NOT published yet (SOP write, metrics, dataset, inspection log). They are
 *      mock-backed only. Every item here is tracked in docs/backend-requests.md.
 *
 * Types are inferred from these schemas (see types.ts); never redefine the
 * shapes elsewhere.
 */

// ===========================================================================
// 1. AUTHORITATIVE — mirrors openapi/openapi.json
// ===========================================================================

export const ResultType = z.enum(["detection", "classification", "measurement"]);

export const BoundingBox = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const Detection = z.object({
  label: z.string(),
  confidence: z.number(),
  box: BoundingBox,
});

export const DetectionPayload = z.object({
  type: z.literal("detection"),
  detections: z.array(Detection).default([]),
});

export const ClassificationPayload = z.object({
  type: z.literal("classification"),
  label: z.string(),
  confidence: z.number(),
  scores: z.record(z.string(), z.number()).optional(),
});

export const Measurement = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string().nullish(),
});

export const MeasurementPayload = z.object({
  type: z.literal("measurement"),
  measurements: z.array(Measurement).default([]),
});

export const ModelResult = z.object({
  sku_id: z.string(),
  payload: z.discriminatedUnion("type", [
    DetectionPayload,
    ClassificationPayload,
    MeasurementPayload,
  ]),
  model_version: z.string().nullish(),
  raw: z.record(z.string(), z.unknown()).optional(),
  result_type: ResultType,
});

/**
 * Verdict.details is a free-form object in the contract. The frontend reads an
 * optional `checks` array from it to render "which part/screw failed" — this is
 * a *convention requested of RulePlugins*, not part of the frozen contract yet
 * (see docs/backend-requests.md). Absence degrades gracefully (reason only).
 */
export const CheckStatus = z.enum(["pass", "fail", "missing", "warn"]);

export const Check = z.object({
  name: z.string(),
  status: CheckStatus,
  expected: z.string().nullish(),
  actual: z.string().nullish(),
  message: z.string().nullish(),
  box: BoundingBox.nullish(),
});

export const VerdictDetails = z
  .object({ checks: z.array(Check).optional() })
  .passthrough();

export const Verdict = z.object({
  passed: z.boolean(),
  reason: z.string(),
  details: VerdictDetails.optional(),
});

export const InspectionRecord = z.object({
  inspection_id: z.string().optional(),
  sku_id: z.string(),
  result: ModelResult,
  verdict: Verdict,
  created_at: z.string().optional(),
});

export const SkuSummary = z.object({
  sku_id: z.string(),
  name: z.string().nullish(),
  result_type: z.string(),
});

export const SkuListResponse = z.object({
  skus: z.array(SkuSummary),
});

export const SkuConfig = z.object({
  sku_id: z.string(),
  name: z.string().nullish(),
  result_type: ResultType,
  adapter_id: z.string(),
  plugin_id: z.string(),
  classes: z.array(z.string()).optional(),
  thresholds: z.record(z.string(), z.number()).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const HealthResponse = z.object({ status: z.string() });

// ===========================================================================
// 2. PROPOSED — pending backend endpoints (mock-backed only)
//    Tracked in docs/backend-requests.md. Kept separate so the authoritative
//    section above stays an exact mirror.
// ===========================================================================

/**
 * Body for creating a new SKU bundle (build phase: "Define SKU"). Mirrors the
 * writable fields of SkuConfig. The backend has no create endpoint yet — this
 * is a frontend proposal (POST /skus). See docs/backend-requests.md.
 */
export const CreateSkuRequest = z.object({
  sku_id: z
    .string()
    .min(1, "SKU id is required")
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "lowercase letters, digits, '-' or '_' only"),
  name: z.string().optional(),
  result_type: ResultType,
  adapter_id: z.string().min(1, "adapter id is required"),
  plugin_id: z.string().min(1, "plugin id is required"),
  classes: z.array(z.string()).optional(),
  thresholds: z.record(z.string(), z.number()).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const SopRule = z.object({
  id: z.string(),
  description: z.string(),
  feature: z.string().nullish(),
  severity: z.enum(["critical", "major", "minor"]),
});

export const Sop = z.object({
  sku_id: z.string(),
  version: z.number(),
  capture: z.object({
    angles: z.array(z.string()).optional(),
    lighting: z.string().optional(),
    distance_cm: z.number().nullish(),
    background: z.string().optional(),
    min_images: z.number().nullish(),
    notes: z.string().optional(),
  }),
  pass_fail: z.object({
    summary: z.string().optional(),
    rules: z.array(SopRule),
  }),
});

export const ConfusionMatrix = z.object({
  labels: z.array(z.string()),
  matrix: z.array(z.array(z.number())),
});

export const MetricsReport = z.object({
  sku_id: z.string(),
  result_type: ResultType,
  generated_at: z.string().nullish(),
  dataset_split: z.string().nullish(),
  confusion_matrix: ConfusionMatrix,
  summary: z
    .object({
      accuracy: z.number().nullish(),
      precision: z.number().nullish(),
      recall: z.number().nullish(),
      f1: z.number().nullish(),
      support: z.number().nullish(),
    })
    .optional(),
  per_class: z
    .array(
      z.object({
        label: z.string(),
        precision: z.number().nullish(),
        recall: z.number().nullish(),
        f1: z.number().nullish(),
        support: z.number().nullish(),
      }),
    )
    .optional(),
});

export const DatasetImage = z.object({
  id: z.string(),
  url: z.string(),
  annotated: z.boolean(),
  split: z.enum(["train", "val", "test"]).nullish(),
  capture_session: z.string().nullish(),
  label_summary: z.string().nullish(),
});

export const Dataset = z.object({
  sku_id: z.string(),
  counts: z
    .object({
      total: z.number(),
      annotated: z.number(),
      unannotated: z.number(),
    })
    .optional(),
  images: z.array(DatasetImage),
});

export const DatasetUploadResponse = z.object({
  status: z.string(),
  files_uploaded: z.number(),
});

export const AnnotationsUploadResponse = z.object({
  status: z.string(),
  format: z.string(),
});
