/**
 * Contract smoke test: validate every mock fixture against the zod schemas that
 * mirror openapi/openapi.yaml. If a fixture drifts from the contract this fails
 * loudly — the same guarantee the API client enforces at runtime. Run headless
 * (no browser) via esbuild + node.
 */
import * as S from "../src/api/schemas";
import {
  inspections,
  inspectResults,
  makeDataset,
  metrics,
  skuConfigs,
  skus,
  sops,
} from "../src/mocks/fixtures";

let failures = 0;
function check(name: string, schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }, value: unknown) {
  const r = schema.safeParse(value);
  if (r.success) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
    console.error(JSON.stringify(r.error, null, 2));
  }
}

console.log("SkuListResponse");
check("skus", S.SkuListResponse, { skus });

console.log("SkuConfig");
for (const id of Object.keys(skuConfigs)) check(id, S.SkuConfig, skuConfigs[id]);

console.log("Sop");
for (const id of Object.keys(sops)) check(id, S.Sop, sops[id]);

console.log("InspectionRecord (log)");
inspections.forEach((r, i) => check(r.inspection_id ?? `#${i}`, S.InspectionRecord, r));

console.log("InspectionRecord (inspect results)");
for (const id of Object.keys(inspectResults)) check(id, S.InspectionRecord, inspectResults[id]);

console.log("MetricsReport");
for (const id of Object.keys(metrics)) check(id, S.MetricsReport, metrics[id]);

console.log("Dataset");
for (const id of skus.map((s) => s.sku_id)) check(id, S.Dataset, makeDataset(id));

if (failures > 0) {
  console.error(`\n${failures} fixture(s) violate the API contract`);
  process.exit(1);
}
console.log("\nAll fixtures satisfy the API contract ✓");
