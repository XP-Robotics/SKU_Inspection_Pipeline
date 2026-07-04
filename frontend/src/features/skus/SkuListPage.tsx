import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAsync } from "../../lib/useAsync";
import { AsyncBoundary } from "../../components/States";
import { Card, PageHeader, ResultTypeTag } from "../../components/ui";

// Presentation-only monogram gradient derived from the SKU id — not an API
// field. SkuSummary carries no thumbnail in the contract.
function monogram(id: string): { text: string; hue: number } {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return { text: id.slice(0, 2).toUpperCase(), hue: h };
}

export function SkuListPage() {
  const state = useAsync(() => api.listSkus(), []);

  return (
    <div className="page">
      <PageHeader
        title="SKU bundles"
        subtitle="Each SKU is a self-contained bundle: SOP, dataset, model, rules, metrics."
      />
      <AsyncBoundary state={state} empty={(d) => d.length === 0}>
        {(skus) => (
          <div className="grid grid--cards">
            {skus.map((sku) => {
              const m = monogram(sku.sku_id);
              return (
              <Card key={sku.sku_id} className="sku-card">
                <div
                  className="sku-card__media sku-card__monogram"
                  style={{
                    background: `linear-gradient(135deg, hsl(${m.hue} 70% 45%), hsl(${(m.hue + 40) % 360} 70% 35%))`,
                  }}
                >
                  {m.text}
                </div>
                <div className="sku-card__body">
                  <div className="sku-card__top">
                    <h2 className="sku-card__name">{sku.name ?? sku.sku_id}</h2>
                    <ResultTypeTag type={sku.result_type} />
                  </div>
                  <div className="sku-card__meta">
                    <code>{sku.sku_id}</code>
                  </div>
                  <div className="sku-card__links">
                    <Link to={`/skus/${sku.sku_id}/sop`}>SOP</Link>
                    <Link to={`/skus/${sku.sku_id}/dataset`}>Dataset</Link>
                    <Link to={`/skus/${sku.sku_id}/metrics`}>Metrics</Link>
                    <Link className="sku-card__run" to={`/inspect?sku=${sku.sku_id}`}>
                      Inspect →
                    </Link>
                  </div>
                </div>
              </Card>
              );
            })}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
