import { useState } from "react";
import { api, ApiError } from "../../api/client";
import type { CreateSkuRequest, ResultType } from "../../api/types";

const RESULT_TYPES: ResultType[] = ["detection", "classification", "measurement"];

/**
 * Modal form to define a new SKU bundle (build phase: "Define SKU"). Captures the
 * declarative SkuConfig fields and POSTs them. The create endpoint is a frontend
 * proposal (api.proposed.createSku → POST /skus) — mock-backed until the backend
 * publishes it (see docs/backend-requests.md). The adapter, plugin, data, model
 * and training are added out-of-band per the SKU onboarding flow.
 */
export function AddSkuDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (skuId: string) => void;
}) {
  const [form, setForm] = useState({
    sku_id: "",
    name: "",
    result_type: "detection" as ResultType,
    adapter_id: "",
    plugin_id: "",
    classes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const body: CreateSkuRequest = {
      sku_id: form.sku_id.trim(),
      name: form.name.trim() || undefined,
      result_type: form.result_type,
      adapter_id: form.adapter_id.trim(),
      plugin_id: form.plugin_id.trim(),
      classes: form.classes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      const created = await api.proposed.createSku(body);
      onCreated(created.sku_id);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 0
            ? "Cannot reach the API."
            : `${err.message}${err.detail ? ` — ${err.detail}` : ""}`
          : String(err);
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <div className="modal__scrim" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-sku-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <h2 id="add-sku-title" className="modal__title">
            New SKU bundle
          </h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form className="modal__body" onSubmit={submit}>
          <label className="field field--inline">
            <span>
              SKU id <em className="req">*</em>
            </span>
            <input
              value={form.sku_id}
              onChange={(e) => set("sku_id", e.target.value)}
              placeholder="e.g. bracket-a"
              autoFocus
              required
            />
            <small className="field__hint">lowercase letters, digits, '-' or '_'</small>
          </label>

          <label className="field field--inline">
            <span>Display name</span>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Mounting Bracket A"
            />
          </label>

          <label className="field field--inline">
            <span>
              Result type <em className="req">*</em>
            </span>
            <select
              value={form.result_type}
              onChange={(e) => set("result_type", e.target.value as ResultType)}
            >
              {RESULT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <div className="modal__row">
            <label className="field field--inline">
              <span>
                Adapter id <em className="req">*</em>
              </span>
              <input
                value={form.adapter_id}
                onChange={(e) => set("adapter_id", e.target.value)}
                placeholder="e.g. rfdetr_bracket_a"
                required
              />
            </label>
            <label className="field field--inline">
              <span>
                Plugin id <em className="req">*</em>
              </span>
              <input
                value={form.plugin_id}
                onChange={(e) => set("plugin_id", e.target.value)}
                placeholder="e.g. bracket_a_rules"
                required
              />
            </label>
          </div>

          <label className="field field--inline">
            <span>Classes</span>
            <input
              value={form.classes}
              onChange={(e) => set("classes", e.target.value)}
              placeholder="comma-separated, e.g. screw, crack"
            />
          </label>

          <p className="modal__note">
            Creates the bundle config only. Adapter, rule plugin, dataset, model and
            training are added out-of-band per the SKU onboarding flow.
          </p>

          {error && <div className="modal__error">{error}</div>}

          <div className="modal__actions">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? "Creating…" : "Create bundle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
