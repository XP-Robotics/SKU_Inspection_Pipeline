import { useState } from "react";
import type { InspectionRecord } from "../../api/types";
import { VerdictBanner } from "./VerdictBanner";
import { ChecksTable } from "./ChecksTable";
import { AnnotatedImage } from "./AnnotatedImage";
import { ModelResultView } from "./ModelResultView";
import { ResultTypeTag, Card } from "../../components/ui";

/**
 * The full runtime results view for one inspection: verdict (pass/fail + reason),
 * the image with the failed part localized, the per-feature checks table, and
 * the raw ModelResult. Reused by the Run-inspection page and the Inspection log.
 *
 * The contract's InspectionRecord carries no image reference, so `imageUrl` is
 * passed in separately — the inspect page supplies the operator's just-uploaded
 * image; the historical log has none until the backend adds an image ref.
 */
export function ResultView({
  inspection,
  imageUrl,
}: {
  inspection: InspectionRecord;
  imageUrl?: string | null;
}) {
  const [activeCheck, setActiveCheck] = useState<string | null>(null);
  const { verdict, result } = inspection;
  const checks = verdict.details?.checks ?? [];

  return (
    <div className="result">
      <VerdictBanner verdict={verdict} />

      <div className="result__meta">
        <span>
          <span className="result__meta-k">SKU</span> <code>{inspection.sku_id}</code>
        </span>
        <span>
          <span className="result__meta-k">Type</span>{" "}
          <ResultTypeTag type={result.result_type} />
        </span>
        {inspection.inspection_id && (
          <span>
            <span className="result__meta-k">ID</span> <code>{inspection.inspection_id}</code>
          </span>
        )}
        {inspection.created_at && (
          <span>
            <span className="result__meta-k">Time</span>{" "}
            {new Date(inspection.created_at).toLocaleString()}
          </span>
        )}
      </div>

      <div className="result__grid">
        <Card className="result__image">
          <AnnotatedImage
            imageUrl={imageUrl}
            result={result}
            checks={checks}
            activeCheck={activeCheck}
            onHoverCheck={setActiveCheck}
          />
        </Card>

        <div className="result__side">
          {checks.length > 0 && (
            <Card>
              <h3 className="card__title">
                Feature checks
                <span className="card__title-note">what passed and what failed</span>
              </h3>
              <ChecksTable
                checks={checks}
                activeCheck={activeCheck}
                onHover={setActiveCheck}
              />
            </Card>
          )}

          <Card>
            <h3 className="card__title">
              Model output
              <span className="card__title-note">{result.result_type}</span>
            </h3>
            <ModelResultView result={result} />
          </Card>
        </div>
      </div>
    </div>
  );
}
