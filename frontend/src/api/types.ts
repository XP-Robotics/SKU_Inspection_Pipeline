import type { z } from "zod";
import type * as S from "./schemas";

/**
 * Types inferred from the zod schemas in schemas.ts (which mirror
 * openapi/openapi.json for the authoritative section). Import UI types from
 * here; never redefine these shapes elsewhere.
 */

// --- Authoritative ---------------------------------------------------------
export type ResultType = z.infer<typeof S.ResultType>;
export type BoundingBox = z.infer<typeof S.BoundingBox>;
export type Detection = z.infer<typeof S.Detection>;
export type DetectionPayload = z.infer<typeof S.DetectionPayload>;
export type ClassificationPayload = z.infer<typeof S.ClassificationPayload>;
export type Measurement = z.infer<typeof S.Measurement>;
export type MeasurementPayload = z.infer<typeof S.MeasurementPayload>;
export type ModelResult = z.infer<typeof S.ModelResult>;

export type CheckStatus = z.infer<typeof S.CheckStatus>;
export type Check = z.infer<typeof S.Check>;
export type VerdictDetails = z.infer<typeof S.VerdictDetails>;
export type Verdict = z.infer<typeof S.Verdict>;
export type InspectionRecord = z.infer<typeof S.InspectionRecord>;

export type SkuSummary = z.infer<typeof S.SkuSummary>;
export type SkuListResponse = z.infer<typeof S.SkuListResponse>;
export type SkuConfig = z.infer<typeof S.SkuConfig>;
export type HealthResponse = z.infer<typeof S.HealthResponse>;

// --- Proposed (pending backend) --------------------------------------------
export type SopRule = z.infer<typeof S.SopRule>;
export type Sop = z.infer<typeof S.Sop>;
export type ConfusionMatrix = z.infer<typeof S.ConfusionMatrix>;
export type MetricsReport = z.infer<typeof S.MetricsReport>;
export type DatasetImage = z.infer<typeof S.DatasetImage>;
export type Dataset = z.infer<typeof S.Dataset>;

/**
 * Narrow a ModelResult by its payload discriminator. Dispatch is by result_type
 * / payload.type only — never by sku_id.
 */
export function isDetection(
  r: ModelResult,
): r is ModelResult & { payload: DetectionPayload } {
  return r.payload.type === "detection";
}
export function isClassification(
  r: ModelResult,
): r is ModelResult & { payload: ClassificationPayload } {
  return r.payload.type === "classification";
}
export function isMeasurement(
  r: ModelResult,
): r is ModelResult & { payload: MeasurementPayload } {
  return r.payload.type === "measurement";
}
