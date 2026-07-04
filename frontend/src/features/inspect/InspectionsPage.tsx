import { useState } from "react";
import { api } from "../../api/client";
import { useAsync } from "../../lib/useAsync";
import { AsyncBoundary } from "../../components/States";
import { PageHeader, Card } from "../../components/ui";
import { ResultView } from "../results/ResultView";
import type { InspectionRecord } from "../../api/types";

/**
 * Runtime inspection log (G3 traceability): every logged Verdict, newest first.
 * Selecting a row opens the full ResultView for that inspection.
 *
 * NOTE: the list endpoint is a frontend proposal (api.proposed) — the backend
 * has not published GET /inspections yet. See docs/backend-requests.md.
 */
export function InspectionsPage() {
  const state = useAsync(() => api.proposed.listInspections({ limit: 100 }), []);
  const [selected, setSelected] = useState<InspectionRecord | null>(null);

  return (
    <div className="page">
      <PageHeader
        title="Inspection log"
        subtitle="Every runtime inspection is logged with a verdict and reason. (Proposed endpoint — mock data.)"
      />

      <AsyncBoundary state={state} empty={(d) => d.length === 0}>
        {(rows) => (
          <div className="log">
            <Card className="log__table-card">
              <table className="log__table">
                <thead>
                  <tr>
                    <th>Verdict</th>
                    <th>SKU</th>
                    <th>Reason</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.inspection_id ?? i}
                      className={`log__row ${
                        selected?.inspection_id === r.inspection_id ? "log__row--sel" : ""
                      }`}
                      onClick={() => setSelected(r)}
                    >
                      <td>
                        <span className={`chip chip--${r.verdict.passed ? "pass" : "fail"}`}>
                          {r.verdict.passed ? "PASS" : "FAIL"}
                        </span>
                      </td>
                      <td>
                        <code>{r.sku_id}</code>
                      </td>
                      <td className="log__reason">{r.verdict.reason}</td>
                      <td className="log__when">
                        {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {selected ? (
              <div className="log__detail">
                <button className="btn btn--ghost" onClick={() => setSelected(null)}>
                  ← Close
                </button>
                <ResultView inspection={selected} />
              </div>
            ) : (
              <Card className="log__hint">Select a row to see the full result.</Card>
            )}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
