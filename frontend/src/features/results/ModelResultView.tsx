import type { ModelResult } from "../../api/types";
import { isClassification, isDetection, isMeasurement } from "../../api/types";

/**
 * Renders the type-specific ModelResult payload. Dispatch is by result_type
 * only (never by sku_id) — adding a new ResultType means adding one branch here,
 * mirroring the core contracts extension procedure.
 */
export function ModelResultView({ result }: { result: ModelResult }) {
  if (isDetection(result)) {
    const { detections } = result.payload;
    return (
      <div className="mrv">
        <div className="mrv__caption">
          {detections.length} detection{detections.length === 1 ? "" : "s"}
        </div>
        <table className="mini-table">
          <thead>
            <tr>
              <th>Class</th>
              <th>Confidence</th>
              <th>Box (x, y, w, h)</th>
            </tr>
          </thead>
          <tbody>
            {detections.map((d, i) => (
              <tr key={i}>
                <td>{d.label}</td>
                <td>{(d.confidence * 100).toFixed(1)}%</td>
                <td className="mono">
                  {[d.box.x, d.box.y, d.box.width, d.box.height].map((n) => Math.round(n)).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (isClassification(result)) {
    const { label, confidence, scores } = result.payload;
    const entries = Object.entries(scores ?? { [label]: confidence }).sort(
      (a, b) => b[1] - a[1],
    );
    return (
      <div className="mrv">
        <div className="mrv__caption">
          Predicted <strong>{label}</strong> at {(confidence * 100).toFixed(1)}%
        </div>
        <div className="scorebars">
          {entries.map(([cls, p]) => (
            <div key={cls} className={`scorebar ${cls === label ? "scorebar--top" : ""}`}>
              <span className="scorebar__label">{cls}</span>
              <span className="scorebar__track">
                <span className="scorebar__fill" style={{ width: `${p * 100}%` }} />
              </span>
              <span className="scorebar__val">{(p * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isMeasurement(result)) {
    const { measurements } = result.payload;
    // Tolerance/pass-fail lives in the Verdict checks (expected vs actual), not
    // in the raw ModelResult — the contract's Measurement carries no bounds.
    return (
      <div className="mrv">
        <table className="mini-table">
          <thead>
            <tr>
              <th>Measurement</th>
              <th>Value</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {measurements.map((m, i) => (
              <tr key={i}>
                <td>{m.name}</td>
                <td className="mono">{m.value}</td>
                <td className="mono">{m.unit ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Unknown result type: the schema validated but this UI has no renderer yet.
  return (
    <div className="mrv mrv--unknown">
      Unsupported result type <code>{(result as ModelResult).result_type}</code>. Add a
      renderer in ModelResultView.
    </div>
  );
}
