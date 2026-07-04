import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAsync } from "../../lib/useAsync";
import { AsyncBoundary } from "../../components/States";
import { PageHeader, Card } from "../../components/ui";
import { SkuSubnav } from "../skus/SkuSubnav";
import type { DatasetImage } from "../../api/types";

type Filter = "all" | "annotated" | "unannotated";

/**
 * Dataset / annotation-review dashboard. Shows capture-session coverage and
 * annotation progress, and a filterable image grid. The frontend does not
 * annotate here — annotation happens in the labeling tool — this is review and
 * dataset health at a glance.
 */
export function DatasetPage() {
  const { skuId = "" } = useParams();
  const state = useAsync(() => api.proposed.getDataset(skuId), [skuId]);
  const [filter, setFilter] = useState<Filter>("all");

  return (
    <div className="page">
      <PageHeader
        title="Dataset & annotation review"
        subtitle={
          <>
            Images and labeling progress for <code>{skuId}</code>
          </>
        }
      />
      <SkuSubnav skuId={skuId} />
      <AsyncBoundary state={state} empty={(d) => d.images.length === 0}>
        {(ds) => {
          const total = ds.counts?.total ?? ds.images.length;
          const annotated = ds.counts?.annotated ?? ds.images.filter((i) => i.annotated).length;
          const pct = total ? Math.round((annotated / total) * 100) : 0;
          const shown = ds.images.filter((i) =>
            filter === "all" ? true : filter === "annotated" ? i.annotated : !i.annotated,
          );
          return (
            <div className="dataset">
              <div className="dataset__stats">
                <Card className="dataset__progress">
                  <div className="dataset__progress-head">
                    <span>Annotation progress</span>
                    <strong>
                      {annotated}/{total} ({pct}%)
                    </strong>
                  </div>
                  <div className="progressbar">
                    <div className="progressbar__fill" style={{ width: `${pct}%` }} />
                  </div>
                </Card>
                <SplitBreakdown images={ds.images} />
              </div>

              <div className="dataset__toolbar">
                {(["all", "annotated", "unannotated"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    className={`pill-btn ${filter === f ? "pill-btn--active" : ""}`}
                    onClick={() => setFilter(f)}
                  >
                    {f} {f !== "all" && `(${ds.images.filter((i) => (f === "annotated" ? i.annotated : !i.annotated)).length})`}
                  </button>
                ))}
              </div>

              <div className="dataset__grid">
                {shown.map((img) => (
                  <figure key={img.id} className="thumb">
                    <img src={img.url} alt={img.id} loading="lazy" />
                    <figcaption>
                      <span className={`thumb__dot thumb__dot--${img.annotated ? "on" : "off"}`} />
                      {img.split && <span className="thumb__split">{img.split}</span>}
                      <span className="thumb__label">
                        {img.annotated ? img.label_summary ?? "labeled" : "unlabeled"}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          );
        }}
      </AsyncBoundary>
    </div>
  );
}

function SplitBreakdown({ images }: { images: DatasetImage[] }) {
  const counts = useMemo(() => {
    const c = { train: 0, val: 0, test: 0, none: 0 };
    for (const i of images) c[i.split ?? "none"]++;
    return c;
  }, [images]);
  return (
    <Card className="dataset__splits">
      <div className="dataset__progress-head">
        <span>Split</span>
      </div>
      <div className="splitbar">
        {(["train", "val", "test"] as const).map((s) => (
          <div key={s} className={`splitbar__seg splitbar__seg--${s}`} style={{ flex: counts[s] || 0.0001 }}>
            <span>{s}</span>
            <strong>{counts[s]}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}
