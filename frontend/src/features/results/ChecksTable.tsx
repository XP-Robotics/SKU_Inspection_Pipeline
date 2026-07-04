import type { Check } from "../../api/types";

const STATUS_ICON: Record<Check["status"], string> = {
  pass: "✓",
  fail: "✕",
  missing: "⊘",
  warn: "!",
};

function humanize(name: string): string {
  return name.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Per-feature breakdown from Verdict.details.checks — the "which part / which
 * screw failed" answer. Failing and missing checks sort to the top so an
 * operator sees the culprit immediately. Hovering a row highlights the matching
 * overlay on the image (via onHover).
 */
export function ChecksTable({
  checks,
  onHover,
  activeCheck,
}: {
  checks: Check[];
  onHover?: (name: string | null) => void;
  activeCheck?: string | null;
}) {
  const rank: Record<Check["status"], number> = { fail: 0, missing: 1, warn: 2, pass: 3 };
  const sorted = [...checks].sort((a, b) => rank[a.status] - rank[b.status]);

  return (
    <table className="checks">
      <thead>
        <tr>
          <th>Part / feature</th>
          <th>Status</th>
          <th>Expected</th>
          <th>Actual</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((c) => {
          const failing = c.status === "fail" || c.status === "missing";
          return (
            <tr
              key={c.name}
              className={`checks__row checks__row--${c.status} ${
                activeCheck === c.name ? "checks__row--active" : ""
              }`}
              onMouseEnter={() => onHover?.(c.name)}
              onMouseLeave={() => onHover?.(null)}
            >
              <td className="checks__name">
                {humanize(c.name)}
                {c.message && failing && <div className="checks__msg">{c.message}</div>}
              </td>
              <td>
                <span className={`chip chip--${c.status}`}>
                  <span aria-hidden>{STATUS_ICON[c.status]}</span> {c.status}
                </span>
              </td>
              <td className="checks__mono">{c.expected ?? "—"}</td>
              <td className="checks__mono">{c.actual ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
