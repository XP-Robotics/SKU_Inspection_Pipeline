import { useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAsync } from "../../lib/useAsync";
import { AsyncBoundary } from "../../components/States";
import { PageHeader, Card, ResultTypeTag } from "../../components/ui";
import { SkuSubnav } from "../skus/SkuSubnav";
import { ConfusionMatrix } from "./ConfusionMatrix";

function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${(n * 100).toFixed(1)}%`;
}

/**
 * Build-phase validation dashboard: confusion matrix + headline metrics +
 * per-class breakdown. The confusion matrix is dispatched by result type on the
 * backend; the frontend just renders whatever labels/matrix it receives.
 */
export function MetricsPage() {
  const { skuId = "" } = useParams();
  const state = useAsync(() => api.proposed.getMetrics(skuId), [skuId]);

  return (
    <div className="page">
      <PageHeader
        title="Validation metrics"
        subtitle={
          <>
            Confusion matrix + validation report for <code>{skuId}</code>
          </>
        }
      />
      <SkuSubnav skuId={skuId} />
      <AsyncBoundary state={state}>
        {(m) => (
          <div className="metrics">
            <div className="metrics__summary">
              <Stat label="Accuracy" value={pct(m.summary?.accuracy)} big />
              <Stat label="Precision" value={pct(m.summary?.precision)} />
              <Stat label="Recall" value={pct(m.summary?.recall)} />
              <Stat label="F1" value={pct(m.summary?.f1)} />
              <Stat label="Support" value={m.summary?.support?.toString() ?? "—"} />
            </div>

            <div className="metrics__meta">
              <ResultTypeTag type={m.result_type} />
              {m.dataset_split && <span>split: {m.dataset_split}</span>}
              {m.generated_at && (
                <span>generated: {new Date(m.generated_at).toLocaleString()}</span>
              )}
            </div>

            <Card>
              <h3 className="card__title">
                Confusion matrix
                <span className="card__title-note">rows = actual, columns = predicted</span>
              </h3>
              <ConfusionMatrix cm={m.confusion_matrix} />
            </Card>

            {m.per_class && m.per_class.length > 0 && (
              <Card>
                <h3 className="card__title">Per-class</h3>
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Precision</th>
                      <th>Recall</th>
                      <th>F1</th>
                      <th>Support</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.per_class.map((c) => (
                      <tr key={c.label}>
                        <td>{c.label}</td>
                        <td>{pct(c.precision)}</td>
                        <td>{pct(c.recall)}</td>
                        <td>{pct(c.f1)}</td>
                        <td>{c.support ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={`stat ${big ? "stat--big" : ""}`}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}
