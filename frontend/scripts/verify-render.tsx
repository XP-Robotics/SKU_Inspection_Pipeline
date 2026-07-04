/**
 * Render smoke test: server-render the key views with mock fixtures and assert
 * the important content appears in the markup. Proves the components render a
 * mocked inspection result (pass/fail + reason + which part failed) and the
 * confusion matrix without a browser. Run via esbuild + node.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ResultView } from "../src/features/results/ResultView";
import { ConfusionMatrix } from "../src/features/metrics/ConfusionMatrix";
import { inspectResults, metrics } from "../src/mocks/fixtures";

let failures = 0;
function assert(name: string, html: string, needles: string[]) {
  const missing = needles.filter((n) => !html.includes(n));
  if (missing.length === 0) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name} — missing: ${missing.join(", ")}`);
  }
}

// Detection FAIL: must show FAIL, the reason, and the missing screw feature.
const fail = inspectResults["bracket-a"];
const failHtml = renderToStaticMarkup(
  <MemoryRouter>
    <ResultView inspection={fail} />
  </MemoryRouter>,
);
assert("detection fail result", failHtml, [
  "FAIL",
  "Missing screw at bottom-right",
  "Screw Bottom Right",
  "missing",
]);

// Classification PASS: verdict + scores.
const pass = inspectResults["label-b"];
const passHtml = renderToStaticMarkup(
  <MemoryRouter>
    <ResultView inspection={pass} />
  </MemoryRouter>,
);
assert("classification pass result", passHtml, ["PASS", "ok", "Predicted"]);

// Measurement FAIL: out-of-tolerance diameter.
const meas = inspectResults["shaft-c"];
const measHtml = renderToStaticMarkup(
  <MemoryRouter>
    <ResultView inspection={meas} />
  </MemoryRouter>,
);
assert("measurement fail result", measHtml, ["FAIL", "diameter", "12.34"]);

// Confusion matrix renders labels and counts.
const cmHtml = renderToStaticMarkup(<ConfusionMatrix cm={metrics["bracket-a"].confusion_matrix} />);
assert("confusion matrix", cmHtml, ["screw", "crack", "background", "correct", "misclassified"]);

if (failures > 0) {
  console.error(`\n${failures} render check(s) failed`);
  process.exit(1);
}
console.log("\nAll views render mocked data correctly ✓");
