import type { z } from "zod";
import * as S from "./schemas";
import type {
  CreateSkuRequest,
  Dataset,
  InspectionRecord,
  MetricsReport,
  SkuConfig,
  SkuSummary,
  Sop,
} from "./types";

/**
 * Typed API client. Every response is validated against its zod schema, so a
 * contract mismatch surfaces here as an ApiError rather than a downstream render
 * crash. All requests are same-origin under `/api` — the Vite dev proxy forwards
 * to FastAPI, or MSW intercepts them when VITE_USE_MOCKS=true.
 *
 * `api.*`          — endpoints that exist in openapi/openapi.json (authoritative).
 * `api.proposed.*` — endpoints the frontend needs but the backend has NOT
 *                    published yet. Mock-backed only; see docs/backend-requests.md.
 */

const BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** FastAPI validation errors are {detail: [{loc,msg,...}]}; flatten to a string. */
function extractDetail(body: unknown): string | undefined {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((e) =>
          e && typeof e === "object" && "msg" in e
            ? `${Array.isArray((e as any).loc) ? (e as any).loc.join(".") + ": " : ""}${(e as any).msg}`
            : String(e),
        )
        .join("; ");
    }
  }
  return undefined;
}

async function request<Sc extends z.ZodTypeAny>(
  path: string,
  schema: Sc,
  init?: RequestInit,
): Promise<z.infer<Sc>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers:
        init?.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json", ...init?.headers }
          : init?.headers,
      ...init,
    });
  } catch (e) {
    throw new ApiError(0, `Network error contacting ${path}`, String(e));
  }

  if (!res.ok) {
    let detail: string | undefined;
    try {
      detail = extractDetail(await res.json());
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, detail);
  }

  const json = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(
      res.status,
      `Response for ${path} did not match the API contract`,
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }
  return parsed.data;
}

export const api = {
  // ---- Authoritative (openapi/openapi.json) --------------------------------
  health: (): Promise<{ status: string }> => request("/healthz", S.HealthResponse),

  listSkus: async (): Promise<SkuSummary[]> => {
    const res = await request("/skus", S.SkuListResponse);
    return res.skus;
  },

  getSku: (skuId: string): Promise<SkuConfig> =>
    request(`/skus/${encodeURIComponent(skuId)}`, S.SkuConfig),

  inspect: (skuId: string, image: File): Promise<InspectionRecord> => {
    const body = new FormData();
    body.set("sku_id", skuId);
    body.set("image", image);
    return request("/inspect", S.InspectionRecord, { method: "POST", body });
  },

  // ---- Proposed (pending backend; mock-backed) -----------------------------
  // See docs/backend-requests.md. These routes do not exist in the published
  // schema yet — flag before relying on them against a live backend.
  proposed: {
    createSku: (body: CreateSkuRequest): Promise<SkuConfig> =>
      request("/skus", S.SkuConfig, { method: "POST", body: JSON.stringify(body) }),

    getSop: (skuId: string): Promise<Sop> =>
      request(`/skus/${encodeURIComponent(skuId)}/sop`, S.Sop),

    putSop: (skuId: string, sop: Sop): Promise<Sop> =>
      request(`/skus/${encodeURIComponent(skuId)}/sop`, S.Sop, {
        method: "PUT",
        body: JSON.stringify(sop),
      }),

    getMetrics: (skuId: string): Promise<MetricsReport> =>
      request(`/skus/${encodeURIComponent(skuId)}/metrics`, S.MetricsReport),

    getDataset: (skuId: string): Promise<Dataset> =>
      request(`/skus/${encodeURIComponent(skuId)}/dataset`, S.Dataset),

    uploadDataset: (skuId: string, files: File[]): Promise<{ status: string; files_uploaded: number }> => {
      const formData = new FormData();
      files.forEach(f => formData.append("files", f));
      return request(`/skus/${encodeURIComponent(skuId)}/dataset/upload`, S.DatasetUploadResponse, {
        method: "POST",
        body: formData
      });
    },

    uploadAnnotations: (skuId: string, file: File): Promise<{ status: string; format: string }> => {
      const formData = new FormData();
      formData.append("file", file);
      return request(`/skus/${encodeURIComponent(skuId)}/dataset/annotations`, S.AnnotationsUploadResponse, {
        method: "POST",
        body: formData
      });
    },

    listInspections: (params?: { sku_id?: string; limit?: number }): Promise<InspectionRecord[]> => {
      const q = new URLSearchParams();
      if (params?.sku_id) q.set("sku_id", params.sku_id);
      if (params?.limit) q.set("limit", String(params.limit));
      const qs = q.toString();
      return request(`/inspections${qs ? `?${qs}` : ""}`, S.InspectionRecord.array());
    },
  },
};

export type Api = typeof api;
