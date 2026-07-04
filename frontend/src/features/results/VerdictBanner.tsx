import type { Verdict } from "../../api/types";

/**
 * The top-line pass/fail statement for an inspection. Large, color-coded, and
 * carries the human-readable reason from RulePlugin.evaluate — this is the first
 * thing an operator reads.
 */
export function VerdictBanner({ verdict }: { verdict: Verdict }) {
  const passed = verdict.passed;
  return (
    <div className={`verdict ${passed ? "verdict--pass" : "verdict--fail"}`} role="status">
      <div className="verdict__icon" aria-hidden>
        {passed ? "✓" : "✕"}
      </div>
      <div className="verdict__text">
        <div className="verdict__label">{passed ? "PASS" : "FAIL"}</div>
        <div className="verdict__reason">{verdict.reason}</div>
      </div>
    </div>
  );
}
