import type {
  Dataset,
  InspectionRecord,
  MetricsReport,
  SkuConfig,
  SkuSummary,
  Sop,
} from "../api/types";

/**
 * Deterministic fixtures for the MSW mock layer and tests.
 *
 * Authoritative-endpoint fixtures (skus, skuConfigs, inspection records) match
 * openapi/openapi.json exactly. Proposed-endpoint fixtures (sops, metrics,
 * datasets) back UI whose endpoints the backend has not published yet.
 *
 * SKUs match the real backend:
 *   - demo_bracket      detection (the bracket assembly showcase)
 *   - classifier_chip   classification (chip condition classification)
 */

// A tiny inline SVG so images render with no network dependency. Used only for
// mock dataset thumbnails and the locally-uploaded inspect preview — never
// claimed as an API field.
function placeholder(label: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
    <rect width="640" height="480" fill="#0f172a"/>
    <rect x="120" y="90" width="400" height="300" rx="16" fill="${color}" opacity="0.18"/>
    <text x="320" y="250" font-family="monospace" font-size="34" fill="#e2e8f0"
      text-anchor="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---- Authoritative: SkuSummary (GET /skus) --------------------------------
export const skus: SkuSummary[] = [
  { sku_id: "demo_bracket", name: "Demo Bracket Assembly", result_type: "detection" },
  { sku_id: "classifier_chip", name: "Chip Classification", result_type: "classification" },
];

// ---- Authoritative: SkuConfig (GET /skus/{id}) ----------------------------
export const skuConfigs: Record<string, SkuConfig> = {
  "demo_bracket": {
    sku_id: "demo_bracket",
    name: "Demo Bracket Assembly",
    result_type: "detection",
    adapter_id: "stub",
    plugin_id: "parts_presence",
    classes: ["screw", "crack"],
    thresholds: { screw: 0.5, crack: 0.4 },
    params: { required_screws: 4 },
  },
  "classifier_chip": {
    sku_id: "classifier_chip",
    name: "Chip Classification",
    result_type: "classification",
    adapter_id: "stub",
    plugin_id: "parts_presence",
    classes: ["pass", "fail"],
    thresholds: { pass: 0.9 },
    params: {},
  },
};

// ---- Authoritative: InspectionRecord (POST /inspect) ----------------------
// Note: the contract's InspectionRecord carries NO image reference. The Results
// view shows the operator's just-uploaded image (passed in as a prop), and the
// historical log shows "no image" until the backend adds an image ref.

const bracketFail: InspectionRecord = {
  inspection_id: "insp-1007",
  sku_id: "demo_bracket",
  created_at: "2026-07-04T09:12:44Z",
  verdict: {
    passed: false,
    reason: "Missing screw at bottom-right corner (3 of 4 detected).",
    details: {
      checks: [
        { name: "screw_top_left", status: "pass", actual: "detected (0.94)", box: { x: 150, y: 110, width: 60, height: 60 } },
        { name: "screw_top_right", status: "pass", actual: "detected (0.91)", box: { x: 430, y: 110, width: 60, height: 60 } },
        { name: "screw_bottom_left", status: "pass", actual: "detected (0.88)", box: { x: 150, y: 330, width: 60, height: 60 } },
        {
          name: "screw_bottom_right",
          status: "missing",
          expected: "detected",
          actual: "not found",
          message: "No screw detected in bottom-right region.",
          box: { x: 430, y: 330, width: 60, height: 60 },
        },
        { name: "arm_crack", status: "pass", actual: "no crack" },
      ],
    },
  },
  result: {
    sku_id: "demo_bracket",
    result_type: "detection",
    model_version: "rfdetr-2026.06.1",
    payload: {
      type: "detection",
      detections: [
        { label: "screw", confidence: 0.94, box: { x: 150, y: 110, width: 60, height: 60 } },
        { label: "screw", confidence: 0.91, box: { x: 430, y: 110, width: 60, height: 60 } },
        { label: "screw", confidence: 0.88, box: { x: 150, y: 330, width: 60, height: 60 } },
      ],
    },
  },
};

const bracketPass: InspectionRecord = {
  inspection_id: "insp-1006",
  sku_id: "demo_bracket",
  created_at: "2026-07-04T09:05:02Z",
  verdict: {
    passed: true,
    reason: "All 4 corner screws detected; no cracks.",
    details: {
      checks: [
        { name: "screw_top_left", status: "pass", actual: "detected (0.95)" },
        { name: "screw_top_right", status: "pass", actual: "detected (0.93)" },
        { name: "screw_bottom_left", status: "pass", actual: "detected (0.90)" },
        { name: "screw_bottom_right", status: "pass", actual: "detected (0.92)" },
        { name: "arm_crack", status: "pass", actual: "no crack" },
      ],
    },
  },
  result: {
    sku_id: "demo_bracket",
    result_type: "detection",
    model_version: "rfdetr-2026.06.1",
    payload: {
      type: "detection",
      detections: [
        { label: "screw", confidence: 0.95, box: { x: 150, y: 110, width: 60, height: 60 } },
        { label: "screw", confidence: 0.93, box: { x: 430, y: 110, width: 60, height: 60 } },
        { label: "screw", confidence: 0.9, box: { x: 150, y: 330, width: 60, height: 60 } },
        { label: "screw", confidence: 0.92, box: { x: 430, y: 330, width: 60, height: 60 } },
      ],
    },
  },
};

const labelPass: InspectionRecord = {
  inspection_id: "insp-2003",
  sku_id: "label-b",
  created_at: "2026-07-04T08:40:19Z",
  verdict: {
    passed: true,
    reason: "Label classified 'ok' at 0.96 (>= 0.80 threshold).",
    details: {
      checks: [{ name: "print_quality", status: "pass", expected: "ok", actual: "ok (0.96)" }],
    },
  },
  result: {
    sku_id: "label-b",
    result_type: "classification",
    model_version: "effnet-2026.05.2",
    payload: {
      type: "classification",
      label: "ok",
      confidence: 0.96,
      scores: { ok: 0.96, misprint: 0.03, smudge: 0.01 },
    },
  },
};

const shaftFail: InspectionRecord = {
  inspection_id: "insp-3001",
  sku_id: "shaft-c",
  created_at: "2026-07-04T08:15:00Z",
  verdict: {
    passed: false,
    reason: "Diameter 12.34 mm is above the 12.0 +/- 0.1 mm tolerance.",
    details: {
      checks: [
        {
          name: "diameter",
          status: "fail",
          expected: "12.0 +/- 0.1 mm",
          actual: "12.34 mm",
          message: "0.24 mm over upper limit.",
        },
        { name: "length", status: "pass", expected: "88.0 +/- 0.5 mm", actual: "88.12 mm" },
      ],
    },
  },
  result: {
    sku_id: "shaft-c",
    result_type: "measurement",
    model_version: "measure-2026.04.0",
    payload: {
      type: "measurement",
      measurements: [
        { name: "diameter", value: 12.34, unit: "mm" },
        { name: "length", value: 88.12, unit: "mm" },
      ],
    },
  },
};

export const inspections: InspectionRecord[] = [bracketFail, bracketPass, labelPass, shaftFail];

/** Canned response returned by POST /inspect, keyed by SKU. */
export const inspectResults: Record<string, InspectionRecord> = {
  "bracket-a": bracketFail,
  "label-b": labelPass,
  "shaft-c": shaftFail,
};

// ---- Proposed: SOP (GET/PUT /skus/{id}/sop) -------------------------------
export const sops: Record<string, Sop> = {
  "bracket-a": {
    sku_id: "demo_bracket",
    version: 3,
    capture: {
      angles: ["top-down", "front-45"],
      lighting: "diffuse, no glare on metal",
      distance_cm: 30,
      background: "matte black mat",
      min_images: 60,
      notes: "All four corner screws must be visible in a single top-down frame.",
    },
    pass_fail: {
      summary: "All four corner screws present and seated; no cracks in the arm.",
      rules: [
        { id: "screws-present", description: "All 4 corner screws detected.", feature: "screw", severity: "critical" },
        { id: "no-crack", description: "No crack detected along the bracket arm.", feature: "crack", severity: "critical" },
      ],
    },
  },
  "label-b": {
    sku_id: "label-b",
    version: 1,
    capture: {
      angles: ["front"],
      lighting: "even white light",
      distance_cm: 20,
      background: "conveyor",
      min_images: 40,
      notes: "Label fully in frame, not skewed more than 10 degrees.",
    },
    pass_fail: {
      summary: "Label classified as correctly printed.",
      rules: [
        { id: "print-ok", description: "Label classified as 'ok' with confidence >= 0.8.", feature: "label", severity: "critical" },
      ],
    },
  },
  "shaft-c": {
    sku_id: "shaft-c",
    version: 2,
    capture: {
      angles: ["profile"],
      lighting: "backlit silhouette",
      distance_cm: 50,
      background: "lightbox",
      min_images: 30,
      notes: "Calibration ruler must be in frame for scale.",
    },
    pass_fail: {
      summary: "Shaft diameter and length within tolerance.",
      rules: [
        { id: "diameter-tol", description: "Diameter within 12.0 +/- 0.1 mm.", feature: "diameter", severity: "critical" },
        { id: "length-tol", description: "Length within 88.0 +/- 0.5 mm.", feature: "length", severity: "major" },
      ],
    },
  },
};

// ---- Proposed: metrics (GET /skus/{id}/metrics) ---------------------------
export const metrics: Record<string, MetricsReport> = {
  "bracket-a": {
    sku_id: "demo_bracket",
    result_type: "detection",
    generated_at: "2026-07-03T18:00:00Z",
    dataset_split: "test (held-out by capture session)",
    confusion_matrix: {
      labels: ["screw", "crack", "background"],
      matrix: [
        [182, 0, 6],
        [1, 24, 3],
        [4, 2, 140],
      ],
    },
    summary: { accuracy: 0.94, precision: 0.95, recall: 0.93, f1: 0.94, support: 362 },
    per_class: [
      { label: "screw", precision: 0.97, recall: 0.97, f1: 0.97, support: 188 },
      { label: "crack", precision: 0.92, recall: 0.86, f1: 0.89, support: 28 },
      { label: "background", precision: 0.94, recall: 0.96, f1: 0.95, support: 146 },
    ],
  },
  "label-b": {
    sku_id: "label-b",
    result_type: "classification",
    generated_at: "2026-07-02T12:30:00Z",
    dataset_split: "val",
    confusion_matrix: {
      labels: ["ok", "misprint", "smudge"],
      matrix: [
        [88, 1, 1],
        [2, 43, 0],
        [3, 0, 27],
      ],
    },
    summary: { accuracy: 0.96, precision: 0.95, recall: 0.95, f1: 0.95, support: 165 },
    per_class: [
      { label: "ok", precision: 0.95, recall: 0.98, f1: 0.96, support: 90 },
      { label: "misprint", precision: 0.98, recall: 0.96, f1: 0.97, support: 45 },
      { label: "smudge", precision: 0.96, recall: 0.9, f1: 0.93, support: 30 },
    ],
  },
  "shaft-c": {
    sku_id: "shaft-c",
    result_type: "measurement",
    generated_at: "2026-07-01T09:00:00Z",
    dataset_split: "test",
    confusion_matrix: {
      labels: ["in_tolerance", "out_of_tolerance"],
      matrix: [
        [54, 4],
        [3, 39],
      ],
    },
    summary: { accuracy: 0.93, precision: 0.91, recall: 0.93, f1: 0.92, support: 100 },
    per_class: [
      { label: "in_tolerance", precision: 0.95, recall: 0.93, f1: 0.94, support: 58 },
      { label: "out_of_tolerance", precision: 0.91, recall: 0.93, f1: 0.92, support: 42 },
    ],
  },
};

// ---- Proposed: dataset (GET /skus/{id}/dataset) ---------------------------
export function makeDataset(skuId: string): Dataset {
  const rt = skus.find((s) => s.sku_id === skuId)?.result_type ?? "detection";
  const color = rt === "detection" ? "#38bdf8" : rt === "classification" ? "#a78bfa" : "#34d399";
  const total = 24;
  const images = Array.from({ length: total }, (_, i) => {
    const annotated = i < 18;
    const split: "train" | "val" | "test" = i % 5 === 0 ? "test" : i % 4 === 0 ? "val" : "train";
    return {
      id: `${skuId}-img-${i + 1}`,
      url: placeholder(`${skuId} #${i + 1}`, color),
      annotated,
      split,
      capture_session: `session-${(i % 3) + 1}`,
      label_summary: annotated ? (rt === "measurement" ? "1 profile" : "3 boxes") : undefined,
    };
  });
  return { sku_id: skuId, counts: { total, annotated: 18, unannotated: 6 }, images };
}
