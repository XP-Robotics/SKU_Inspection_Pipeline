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
import { CreateSkuRequest, Sop } from "../api/schemas";
import type { SkuConfig, SkuSummary } from "../api/types";

/**
 * MSW request handlers. Authoritative routes mirror openapi/openapi.json; the
 * routes marked PROPOSED implement endpoints the backend has not published yet
 * (see docs/backend-requests.md). Turn all mocks off with VITE_USE_MOCKS=false.
 */

const notFound = (detail: string) => HttpResponse.json({ detail }, { status: 404 });

// In-memory stores so create/edit persist for the session.
const sopStore = structuredClone(sops);
const skuList: SkuSummary[] = structuredClone(skus);
const cfgStore: Record<string, SkuConfig> = structuredClone(skuConfigs);

export const handlers = [
  // ---- Authoritative ------------------------------------------------------
  http.get("/api/healthz", () => HttpResponse.json({ status: "ok" })),

  http.get("/api/skus", async () => {
    await delay(120);
    return HttpResponse.json({ skus: skuList });
  }),

  http.get("/api/skus/:skuId", ({ params }) => {
    const cfg = cfgStore[params.skuId as string];
    return cfg ? HttpResponse.json(cfg) : notFound("SKU not found");
  }),

  // PROPOSED: create a new SKU bundle (build phase: "Define SKU"). Not in the
  // published schema yet — see docs/backend-requests.md.
  http.post("/api/skus", async ({ request }) => {
    const parsed = CreateSkuRequest.safeParse(await request.json());
    if (!parsed.success) {
      return HttpResponse.json(
        { detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
        { status: 422 },
      );
    }
    const body = parsed.data;
    if (cfgStore[body.sku_id]) {
      return HttpResponse.json({ detail: `SKU '${body.sku_id}' already exists` }, { status: 409 });
    }
    const cfg: SkuConfig = {
      sku_id: body.sku_id,
      name: body.name ?? body.sku_id,
      result_type: body.result_type,
      adapter_id: body.adapter_id,
      plugin_id: body.plugin_id,
      classes: body.classes ?? [],
      thresholds: body.thresholds ?? {},
      params: body.params ?? {},
    };
    cfgStore[body.sku_id] = cfg;
    skuList.push({ sku_id: cfg.sku_id, name: cfg.name, result_type: cfg.result_type });
    await delay(300);
    return HttpResponse.json(cfg, { status: 201 });
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
    const skuId = params.skuId as string;
    let sop = sopStore[skuId];

    // Auto-create empty SOP on first access if not found (matches backend behavior)
    if (!sop && cfgStore[skuId]) {
      sop = {
        sku_id: skuId,
        version: 1,
        capture: {
          angles: [],
          lighting: "",
          distance_cm: 0,
          background: "",
          min_images: 0,
          notes: "",
        },
        pass_fail: {
          summary: "",
          rules: [],
        },
      };
      sopStore[skuId] = sop;
    }

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

  http.post("/api/skus/:skuId/dataset/upload", async ({ request }) => {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    return HttpResponse.json({
      status: "success",
      files_uploaded: files.length,
    });
  }),

  http.post("/api/skus/:skuId/dataset/annotations", async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const format = file?.name?.endsWith(".zip") ? "coco_zip" : "coco";
    return HttpResponse.json({
      status: "success",
      format,
    });
  }),
];
