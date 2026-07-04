import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useAsync } from "../../lib/useAsync";
import type { InspectionRecord } from "../../api/types";
import { PageHeader, Card, ResultTypeTag } from "../../components/ui";
import { ErrorState, Spinner } from "../../components/States";
import { ResultView } from "../results/ResultView";

/**
 * Runtime "Run inspection" page: pick a SKU, provide an image, POST /inspect,
 * and render the returned Verdict + ModelResult. With mocks enabled the backend
 * returns a canned result per SKU regardless of the image, so the flow is fully
 * demonstrable offline.
 */
export function InspectPage() {
  const skusState = useAsync(() => api.listSkus(), []);
  const [params, setParams] = useSearchParams();
  const skuId = params.get("sku") ?? "";

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<InspectionRecord | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Default the SKU selection once the list loads.
  useEffect(() => {
    if (!skuId && skusState.data?.length) {
      setParams({ sku: skusState.data[0].sku_id }, { replace: true });
    }
  }, [skuId, skusState.data, setParams]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onPick(f: File | null) {
    setFile(f);
    setResult(null);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function run() {
    if (!skuId || !file) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.inspect(skuId, file));
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setRunning(false);
    }
  }

  const selected = skusState.data?.find((s) => s.sku_id === skuId);

  return (
    <div className="page">
      <PageHeader
        title="Run inspection"
        subtitle="Identify SKU → capture image → predict → evaluate → verdict."
      />

      <Card className="inspect-form">
        <div className="field">
          <label htmlFor="sku">SKU</label>
          <div className="field__row">
            <select
              id="sku"
              value={skuId}
              onChange={(e) => setParams({ sku: e.target.value }, { replace: true })}
              disabled={skusState.loading}
            >
              {(skusState.data ?? []).map((s) => (
                <option key={s.sku_id} value={s.sku_id}>
                  {s.name} ({s.sku_id})
                </option>
              ))}
            </select>
            {selected && <ResultTypeTag type={selected.result_type} />}
          </div>
        </div>

        <div className="field">
          <label htmlFor="image">Image</label>
          <input
            id="image"
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          <p className="field__hint">
            Any image works in mock mode — the verdict is canned per SKU.
          </p>
        </div>

        {preview && (
          <div className="inspect-form__preview">
            <img src={preview} alt="Selected preview" />
          </div>
        )}

        <div className="field__row">
          <button className="btn btn--primary" onClick={run} disabled={!skuId || !file || running}>
            {running ? "Inspecting…" : "Run inspection"}
          </button>
          {file && (
            <button
              className="btn"
              onClick={() => {
                onPick(null);
                if (fileInput.current) fileInput.current.value = "";
              }}
              disabled={running}
            >
              Clear
            </button>
          )}
        </div>
      </Card>

      {running && <Spinner label="Predicting and evaluating…" />}
      {error && (
        <ErrorState
          error={error}
          onRetry={
            error instanceof ApiError && error.status === 404 ? undefined : run
          }
        />
      )}
      {result && <ResultView inspection={result} imageUrl={preview} />}
    </div>
  );
}
