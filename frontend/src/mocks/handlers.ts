import { http, HttpResponse, delay } from "msw";
import {
  inspectResults,
  inspections,
  makeDataset,
  metrics,
  skuConfigs,
  skus,
  sops,
} from "./fixtures";
import { Sop } from "../api/schemas";

/**
 * MSW request handlers. Authoritative routes mirror openapi/openapi.json; the
 * routes marked PROPOSED implement endpoints the backend has not published yet
 * (see docs/backend-requests.md). Turn all mocks off with VITE_USE_MOCKS=false.
 */

const notFound = (detail: string) => HttpResponse.json({ detail }, { status: 404 });

// In-memory SOP store so authoring edits persist for the session.
const sopStore = structuredClone(sops);

export const handlers = [
  // ---- Authoritative ------------------------------------------------------
  http.get("/api/healthz", () => HttpResponse.json({ status: "ok" })),

  http.get("/api/skus", async () => {
    await delay(120);
    return HttpResponse.json({ skus });
  }),

  http.get("/api/skus/:skuId", ({ params }) => {
    const cfg = skuConfigs[params.skuId as string];
    return cfg ? HttpResponse.json(cfg) : notFound("SKU not found");
  }),

  http.post("/api/inspect", async ({ request }) => {
    const form = await request.formData();
    const skuId = String(form.get("sku_id") ?? "");
    const canned = inspectResults[skuId];
    if (!canned) return notFound(`No bundle registered for SKU '${skuId}'`);
    await delay(700); // simulate predict + evaluate latency
    return HttpResponse.json({
      ...canned,
      inspection_id: `insp-${Math.floor(performance.now())}`,
      created_at: new Date().toISOString(),
    });
  }),

  // ---- Proposed (pending backend) -----------------------------------------
  http.get("/api/skus/:skuId/sop", ({ params }) => {
    const sop = sopStore[params.skuId as string];
    return sop ? HttpResponse.json(sop) : notFound("SOP not found");
  }),

  http.put("/api/skus/:skuId/sop", async ({ params, request }) => {
    const parsed = Sop.safeParse(await request.json());
    if (!parsed.success) {
      return HttpResponse.json(
        { detail: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 422 },
      );
    }
    sopStore[params.skuId as string] = parsed.data;
    await delay(200);
    return HttpResponse.json(parsed.data);
  }),

  http.get("/api/skus/:skuId/metrics", ({ params }) => {
    const m = metrics[params.skuId as string];
    return m ? HttpResponse.json(m) : notFound("No metrics for this SKU");
  }),

  http.get("/api/skus/:skuId/dataset", async ({ params }) => {
    await delay(100);
    return HttpResponse.json(makeDataset(params.skuId as string));
  }),

  http.get("/api/inspections", ({ request }) => {
    const url = new URL(request.url);
    const skuId = url.searchParams.get("sku_id");
    const limit = Number(url.searchParams.get("limit") ?? 50);
    let rows = inspections;
    if (skuId) rows = rows.filter((r) => r.sku_id === skuId);
    return HttpResponse.json(rows.slice(0, limit));
  }),
];
