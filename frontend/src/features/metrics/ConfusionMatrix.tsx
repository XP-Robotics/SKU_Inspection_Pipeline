import type { ConfusionMatrix as CM } from "../../api/types";

/**
 * Confusion matrix heatmap. Rows = actual class, columns = predicted class.
 * Diagonal cells (correct) are tinted green; off-diagonal (errors) red, with
 * opacity scaled to the row-normalized value so mistakes stand out. Pure
 * CSS/SVG — no chart dependency.
 */
export function ConfusionMatrix({ cm }: { cm: CM }) {
  const { labels, matrix } = cm;
  const rowTotals = matrix.map((row) => row.reduce((a, b) => a + b, 0));

  return (
    <div className="cm">
      <div className="cm__scroll">
        <table className="cm__table">
          <thead>
            <tr>
              <th className="cm__corner">
                <span className="cm__corner-actual">actual ↓</span>
                <span className="cm__corner-pred">predicted →</span>
              </th>
              {labels.map((l) => (
                <th key={l} className="cm__collabel">
                  <span>{l}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={labels[i]}>
                <th className="cm__rowlabel">{labels[i]}</th>
                {row.map((v, j) => {
                  const total = rowTotals[i] || 1;
                  const frac = v / total;
                  const correct = i === j;
                  const bg = correct
                    ? `rgba(52, 211, 153, ${0.12 + frac * 0.7})`
                    : v === 0
                      ? "transparent"
                      : `rgba(248, 113, 113, ${0.12 + frac * 0.7})`;
                  return (
                    <td
                      key={j}
                      className={`cm__cell ${correct ? "cm__cell--diag" : ""} ${
                        v > 0 && !correct ? "cm__cell--err" : ""
                      }`}
                      style={{ background: bg }}
                      title={`actual ${labels[i]} → predicted ${labels[j]}: ${v} (${(
                        frac * 100
                      ).toFixed(1)}%)`}
                    >
                      <span className="cm__v">{v}</span>
                      <span className="cm__pct">{(frac * 100).toFixed(0)}%</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cm__legend">
        <span className="cm__legend-item">
          <span className="cm__swatch cm__swatch--ok" /> correct
        </span>
        <span className="cm__legend-item">
          <span className="cm__swatch cm__swatch--err" /> misclassified
        </span>
        <span className="cm__legend-note">cell % is row-normalized (per actual class)</span>
      </div>
    </div>
  );
}
