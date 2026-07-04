import { useState } from "react";
import type { BoundingBox, Check, ModelResult } from "../../api/types";
import { isDetection } from "../../api/types";

interface Box {
  key: string;
  label: string;
  box: BoundingBox;
  kind: "pass" | "fail" | "missing" | "warn" | "detection";
}

/**
 * Renders the inspected image with bounding-box overlays. Boxes come from two
 * sources, both optional:
 *   - Verdict checks that carry a box (locates the failed part/screw)
 *   - raw detections from a detection ModelResult
 * Coordinates are in source-image pixels; the SVG viewBox is the image's natural
 * size (the contract's ModelResult carries no dimensions), so overlays stay
 * aligned at any rendered width.
 */
export function AnnotatedImage({
  imageUrl,
  result,
  checks,
  activeCheck,
  onHoverCheck,
}: {
  imageUrl?: string | null;
  result: ModelResult;
  checks?: Check[];
  activeCheck?: string | null;
  onHoverCheck?: (name: string | null) => void;
}) {
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const w = imgSize?.w ?? 640;
  const h = imgSize?.h ?? 480;

  const boxes: Box[] = [];
  for (const c of checks ?? []) {
    if (c.box) {
      boxes.push({
        key: `check-${c.name}`,
        label: c.name.replace(/[_-]+/g, " "),
        box: c.box,
        kind: c.status,
      });
    }
  }
  // Only surface raw detections when checks don't already localize things.
  if (isDetection(result) && boxes.length === 0) {
    result.payload.detections.forEach((d, i) => {
      boxes.push({
        key: `det-${i}`,
        label: `${d.label} ${(d.confidence * 100).toFixed(0)}%`,
        box: d.box,
        kind: "detection",
      });
    });
  }

  if (!imageUrl) {
    return <div className="annotated annotated--noimg">No image for this inspection.</div>;
  }

  return (
    <div className="annotated" style={{ aspectRatio: `${w} / ${h}` }}>
      <img
        src={imageUrl}
        alt="Inspected unit"
        onLoad={(e) =>
          setImgSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
        }
      />
      <svg className="annotated__overlay" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {boxes.map((b) => {
          const { x, y, width, height } = b.box;
          const active = activeCheck != null && b.key === `check-${activeCheck}`;
          return (
            <g
              key={b.key}
              className={`box box--${b.kind} ${active ? "box--active" : ""}`}
              onMouseEnter={() => onHoverCheck?.(b.key.replace(/^check-/, ""))}
              onMouseLeave={() => onHoverCheck?.(null)}
            >
              <rect x={x} y={y} width={width} height={height} rx={4} />
              <text x={x + 4} y={y - 6}>
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
