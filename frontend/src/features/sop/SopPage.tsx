import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAsync } from "../../lib/useAsync";
import { AsyncBoundary } from "../../components/States";
import { PageHeader, Card } from "../../components/ui";
import { SkuSubnav } from "../skus/SkuSubnav";
import type { Sop, SopRule } from "../../api/types";

/**
 * SOP authoring UI. Edits the capture rules and pass/fail definition for a SKU
 * (sop.yaml) and PUTs the whole document back. Kept as a structured form rather
 * than raw YAML so the human-authored rules stay well-formed against the
 * contract; the backend owns persistence.
 */
export function SopPage() {
  const { skuId = "" } = useParams();
  const state = useAsync(() => api.proposed.getSop(skuId), [skuId]);

  return (
    <div className="page">
      <PageHeader
        title="SOP authoring"
        subtitle={
          <>
            Capture rules + pass/fail definition for <code>{skuId}</code>
          </>
        }
      />
      <SkuSubnav skuId={skuId} />
      <AsyncBoundary state={state}>
        {(sop) => <SopEditor key={sop.version} initial={sop} skuId={skuId} onSaved={state.reload} />}
      </AsyncBoundary>
    </div>
  );
}

function SopEditor({
  initial,
  skuId,
  onSaved,
}: {
  initial: Sop;
  skuId: string;
  onSaved: () => void;
}) {
  const [sop, setSop] = useState<Sop>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(sop) !== JSON.stringify(initial);

  function patchCapture(patch: Partial<Sop["capture"]>) {
    setSop((s) => ({ ...s, capture: { ...s.capture, ...patch } }));
  }
  function patchRule(i: number, patch: Partial<SopRule>) {
    setSop((s) => {
      const rules = s.pass_fail.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
      return { ...s, pass_fail: { ...s.pass_fail, rules } };
    });
  }
  function addRule() {
    setSop((s) => ({
      ...s,
      pass_fail: {
        ...s.pass_fail,
        rules: [
          ...s.pass_fail.rules,
          { id: `rule-${s.pass_fail.rules.length + 1}`, description: "", severity: "critical" },
        ],
      },
    }));
  }
  function removeRule(i: number) {
    setSop((s) => ({
      ...s,
      pass_fail: { ...s.pass_fail, rules: s.pass_fail.rules.filter((_, idx) => idx !== i) },
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const next = { ...sop, version: (sop.version ?? 1) + 1 };
      await api.proposed.putSop(skuId, next);
      setSavedAt(new Date().toLocaleTimeString());
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sop">
      <div className="sop__bar">
        <span className="sop__ver">v{sop.version}</span>
        {dirty && <span className="sop__dirty">unsaved changes</span>}
        {savedAt && !dirty && <span className="sop__saved">saved at {savedAt}</span>}
        <div className="sop__bar-actions">
          <button className="btn" onClick={() => setSop(initial)} disabled={!dirty || saving}>
            Reset
          </button>
          <button className="btn btn--primary" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save SOP"}
          </button>
        </div>
      </div>
      {error && <div className="sop__error">Save failed: {error}</div>}

      <Card>
        <h3 className="card__title">Capture rules</h3>
        <div className="sop__grid">
          <Text
            label="Angles (comma-separated)"
            value={(sop.capture.angles ?? []).join(", ")}
            onChange={(v) =>
              patchCapture({ angles: v.split(",").map((s) => s.trim()).filter(Boolean) })
            }
          />
          <Text
            label="Lighting"
            value={sop.capture.lighting ?? ""}
            onChange={(v) => patchCapture({ lighting: v })}
          />
          <Text
            label="Background"
            value={sop.capture.background ?? ""}
            onChange={(v) => patchCapture({ background: v })}
          />
          <Num
            label="Distance (cm)"
            value={sop.capture.distance_cm ?? null}
            onChange={(v) => patchCapture({ distance_cm: v })}
          />
          <Num
            label="Min images"
            value={sop.capture.min_images ?? null}
            onChange={(v) => patchCapture({ min_images: v })}
          />
        </div>
        <Text
          label="Notes"
          value={sop.capture.notes ?? ""}
          onChange={(v) => patchCapture({ notes: v })}
          textarea
        />
      </Card>

      <Card>
        <h3 className="card__title">
          Pass / fail definition
          <span className="card__title-note">these rules become the RulePlugin contract</span>
        </h3>
        <Text
          label="Summary"
          value={sop.pass_fail.summary ?? ""}
          onChange={(v) =>
            setSop((s) => ({ ...s, pass_fail: { ...s.pass_fail, summary: v } }))
          }
        />

        <div className="rules">
          {sop.pass_fail.rules.map((r, i) => (
            <div className="rule" key={i}>
              <div className="rule__head">
                <input
                  className="rule__id"
                  value={r.id}
                  onChange={(e) => patchRule(i, { id: e.target.value })}
                  aria-label="Rule id"
                />
                <select
                  className={`rule__sev rule__sev--${r.severity}`}
                  value={r.severity}
                  onChange={(e) =>
                    patchRule(i, { severity: e.target.value as SopRule["severity"] })
                  }
                >
                  <option value="critical">critical</option>
                  <option value="major">major</option>
                  <option value="minor">minor</option>
                </select>
                <button className="btn btn--ghost rule__del" onClick={() => removeRule(i)}>
                  Remove
                </button>
              </div>
              <input
                className="rule__desc"
                placeholder="Description of the pass/fail criterion"
                value={r.description}
                onChange={(e) => patchRule(i, { description: e.target.value })}
              />
              <input
                className="rule__feature"
                placeholder="Feature (optional), e.g. screw"
                value={r.feature ?? ""}
                onChange={(e) => patchRule(i, { feature: e.target.value || null })}
              />
            </div>
          ))}
        </div>
        <button className="btn" onClick={addRule}>
          + Add rule
        </button>
      </Card>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  return (
    <label className="field field--inline">
      <span>{label}</span>
      {textarea ? (
        <textarea value={value} rows={2} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="field field--inline">
      <span>{label}</span>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </label>
  );
}
