import { useRef, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAsync } from "../../lib/useAsync";
import { AsyncBoundary } from "../../components/States";
import { PageHeader, Card } from "../../components/ui";
import { SkuSubnav } from "../skus/SkuSubnav";
import type { DatasetImage } from "../../api/types";

type Filter = "all" | "annotated" | "unannotated";

interface Annotation {
  bbox: [number, number, number, number];
  category_id: number;
  label?: string;
}

interface CocoAnnotations {
  images: Array<{ id: number; file_name: string; [key: string]: any }>;
  annotations: Array<{ image_id: number; bbox: [number, number, number, number]; category_id: number; [key: string]: any }>;
  categories?: Array<{ id: number; name: string }>;
}

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
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragActiveAnnotations, setDragActiveAnnotations] = useState(false);

  // Load annotations from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(`annotations-${skuId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setAnnotations(parsed);
      } catch (e) {
        console.error("Failed to parse stored annotations:", e);
      }
    }
  }, [skuId]);
  const [previewImage, setPreviewImage] = useState<DatasetImage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [annotations, setAnnotations] = useState<Record<string, Annotation[]>>({});
  const [splitDistribution, setSplitDistribution] = useState({ train: 70, val: 15, test: 15 });
  const [imageAssignedSplits, setImageAssignedSplits] = useState<Record<string, string>>({});

  const handleUploadDataset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) {
      setUploadMsg({ type: "error", text: "No files selected" });
      return;
    }

    setUploading(true);
    setUploadMsg(null);
    setDragActive(false);
    try {
      console.log(`Uploading ${files.length} file(s) to ${skuId}`);
      const result = await api.proposed.uploadDataset(skuId, Array.from(files));
      console.log("Upload result:", result);
      setUploadMsg({ type: "success", text: `✓ Uploaded ${result.files_uploaded} image(s)` });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Upload error:", errorMsg);
      setUploadMsg({ type: "error", text: `✗ ${errorMsg}` });
    } finally {
      setUploading(false);
      e.currentTarget.value = "";
    }
  };

  const handleUploadAnnotatedDataset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) {
      setUploadMsg({ type: "error", text: "No files selected" });
      return;
    }

    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name));
    const jsonFiles = fileArray.filter(f => f.name.endsWith('.json'));

    if (imageFiles.length === 0) {
      setUploadMsg({ type: "error", text: "No image files found" });
      return;
    }

    setUploading(true);
    setUploadMsg(null);
    try {
      // Parse JSON annotations if present
      if (jsonFiles.length > 0) {
        const jsonContent = await jsonFiles[0].text();
        const parsed = parseCocoAnnotations(jsonContent);
        setAnnotations(parsed);
        // Save to localStorage to persist across page reload
        localStorage.setItem(`annotations-${skuId}`, JSON.stringify(parsed));
        console.log("Parsed annotations:", parsed);
      }

      console.log(`Uploading ${imageFiles.length} annotated image(s) to ${skuId}`);
      const result = await api.proposed.uploadDataset(skuId, imageFiles);
      console.log("Upload result:", result);
      setUploadMsg({ type: "success", text: `✓ Uploaded ${result.files_uploaded} annotated image(s)${jsonFiles.length > 0 ? ' with annotations' : ''}` });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Upload error:", errorMsg);
      setUploadMsg({ type: "error", text: `✗ ${errorMsg}` });
    } finally {
      setUploading(false);
      e.currentTarget.value = "";
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDragAnnotations = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActiveAnnotations(true);
    } else if (e.type === "dragleave") {
      setDragActiveAnnotations(false);
    }
  };

  const parseCocoAnnotations = (jsonContent: string): Record<string, Annotation[]> => {
    try {
      const coco: CocoAnnotations = JSON.parse(jsonContent);
      const annotationsByFile: Record<string, Annotation[]> = {};
      const categoryMap = new Map(coco.categories?.map(c => [c.id, c.name]) || []);

      for (const img of coco.images) {
        const fileName = img.file_name;
        annotationsByFile[fileName] = [];
      }

      for (const ann of coco.annotations) {
        const img = coco.images.find(i => i.id === ann.image_id);
        if (img) {
          annotationsByFile[img.file_name]?.push({
            bbox: ann.bbox,
            category_id: ann.category_id,
            label: categoryMap.get(ann.category_id),
          });
        }
      }

      return annotationsByFile;
    } catch (err) {
      console.error("Failed to parse COCO annotations:", err);
      return {};
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const items = e.dataTransfer.items;
    if (!items) return;

    const files: File[] = [];
    const queue = Array.from(items).map((item) => item.webkitGetAsEntry());

    const processEntry = async (entry: any): Promise<File[]> => {
      const results: File[] = [];
      if (entry.isFile) {
        return new Promise((resolve) => {
          entry.file((file: File) => {
            results.push(file);
            resolve(results);
          });
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        return new Promise((resolve) => {
          reader.readEntries(async (entries: any[]) => {
            for (const e of entries) {
              const subFiles = await processEntry(e);
              results.push(...subFiles);
            }
            resolve(results);
          });
        });
      }
      return results;
    };

    for (const entry of queue) {
      const entryFiles = await processEntry(entry);
      files.push(...entryFiles);
    }

    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name));

    if (imageFiles.length === 0) {
      setUploadMsg({ type: "error", text: "No image files found in dropped items" });
      return;
    }

    setUploading(true);
    setUploadMsg(null);
    try {
      console.log(`Uploading ${imageFiles.length} image(s) from drag-drop to ${skuId}`);
      const result = await api.proposed.uploadDataset(skuId, imageFiles);
      console.log("Upload result:", result);
      setUploadMsg({ type: "success", text: `✓ Uploaded ${result.files_uploaded} image(s)` });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Upload error:", errorMsg);
      setUploadMsg({ type: "error", text: `✗ ${errorMsg}` });
    } finally {
      setUploading(false);
    }
  };

  const handleDropAnnotations = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveAnnotations(false);

    const items = e.dataTransfer.items;
    if (!items) return;

    const files: File[] = [];
    const queue = Array.from(items).map((item) => item.webkitGetAsEntry());

    const processEntry = async (entry: any): Promise<File[]> => {
      const results: File[] = [];
      if (entry.isFile) {
        return new Promise((resolve) => {
          entry.file((file: File) => {
            results.push(file);
            resolve(results);
          });
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        return new Promise((resolve) => {
          reader.readEntries(async (entries: any[]) => {
            for (const e of entries) {
              const subFiles = await processEntry(e);
              results.push(...subFiles);
            }
            resolve(results);
          });
        });
      }
      return results;
    };

    for (const entry of queue) {
      const entryFiles = await processEntry(entry);
      files.push(...entryFiles);
    }

    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name));
    const jsonFiles = files.filter(f => f.name.endsWith('.json'));

    if (imageFiles.length === 0) {
      setUploadMsg({ type: "error", text: "No image files found in dropped items" });
      return;
    }

    setUploading(true);
    setUploadMsg(null);
    try {
      // Parse JSON annotations if present
      if (jsonFiles.length > 0) {
        const jsonContent = await jsonFiles[0].text();
        const parsed = parseCocoAnnotations(jsonContent);
        setAnnotations(parsed);
        // Save to localStorage to persist across page reload
        localStorage.setItem(`annotations-${skuId}`, JSON.stringify(parsed));
        console.log("Parsed annotations:", parsed);
      }

      console.log(`Uploading ${imageFiles.length} annotated image(s) from drag-drop to ${skuId}`);
      const result = await api.proposed.uploadDataset(skuId, imageFiles);
      console.log("Upload result:", result);
      setUploadMsg({ type: "success", text: `✓ Uploaded ${result.files_uploaded} annotated image(s)${jsonFiles.length > 0 ? ' with annotations' : ''}` });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Upload error:", errorMsg);
      setUploadMsg({ type: "error", text: `✗ ${errorMsg}` });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (_imageId: string, imagePath: string) => {
    setDeleting(true);
    try {
      const response = await fetch(
        `http://100.79.59.103:8000/api/skus/${skuId}/dataset/delete`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_path: imagePath }),
        }
      );

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.statusText}`);
      }

      setUploadMsg({ type: "success", text: "✓ Image deleted" });
      setPreviewImage(null);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setUploadMsg({ type: "error", text: `✗ Failed to delete: ${errorMsg}` });
    } finally {
      setDeleting(false);
    }
  };

  const assignSplits = (images: DatasetImage[]) => {
    const splits: Record<string, string> = {};
    const total = images.length;
    const trainCount = Math.floor((splitDistribution.train / 100) * total);
    const valCount = Math.floor((splitDistribution.val / 100) * total);

    let currentTrain = 0;
    let currentVal = 0;

    images.forEach((img) => {
      if (currentTrain < trainCount) {
        splits[img.id] = "train";
        currentTrain++;
      } else if (currentVal < valCount) {
        splits[img.id] = "val";
        currentVal++;
      } else {
        splits[img.id] = "test";
      }
    });

    setImageAssignedSplits(splits);
    localStorage.setItem(`imageSplits-${skuId}`, JSON.stringify(splits));
  };

  // Load and assign splits when images or distribution change
  useEffect(() => {
    if (state.data?.images && state.data.images.length > 0) {
      assignSplits(state.data.images);
    }
  }, [state.data?.images, skuId, splitDistribution.train, splitDistribution.val, splitDistribution.test]);

  const handleDeleteAll = async () => {
    if (!confirm(`Delete all ${state.data?.images.length || 0} images? This action cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    const images = state.data?.images || [];
    let deleted = 0;
    let failed = 0;

    try {
      for (const img of images) {
        try {
          const response = await fetch(
            `http://100.79.59.103:8000/api/skus/${skuId}/dataset/delete`,
            {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ file_path: img.url }),
            }
          );

          if (response.ok) {
            deleted++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      if (deleted > 0) {
        setUploadMsg({
          type: failed === 0 ? "success" : "error",
          text: `✓ Deleted ${deleted} image(s)${failed > 0 ? `, failed to delete ${failed}` : ''}`
        });
        setPreviewImage(null);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setUploadMsg({ type: "error", text: "Failed to delete images" });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setUploadMsg({ type: "error", text: `✗ Error: ${errorMsg}` });
    } finally {
      setDeleting(false);
    }
  };

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
      <div className="dataset__upload">
        <Card className="dataset__upload-card">
          <h3 className="dataset__upload-title">Upload Dataset</h3>
          {uploadMsg && (
            <div className={`dataset__upload-msg dataset__upload-msg--${uploadMsg.type}`}>
              {uploadMsg.text}
            </div>
          )}
          <div className="dataset__upload-grid">
            <div
              className={`dataset__upload-field dataset__upload-dropzone ${dragActive ? "dataset__upload-dropzone--active" : ""}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <label className="dataset__upload-label">Raw Dataset Images</label>
              <input
                type="file"
                multiple
                disabled={uploading}
                onChange={handleUploadDataset}
                className="dataset__upload-input"
                accept="image/*"
              />
              <div className="dataset__upload-dropzone-hint">
                <p className="dataset__upload-hint">
                  📁 Drag folder or files here, or click to select
                </p>
                <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: "0.25rem" }}>
                  ✓ Automatically extracts images from folders
                </p>
              </div>
            </div>
            <div
              className={`dataset__upload-field dataset__upload-dropzone ${dragActiveAnnotations ? "dataset__upload-dropzone--active" : ""}`}
              onDragEnter={handleDragAnnotations}
              onDragLeave={handleDragAnnotations}
              onDragOver={handleDragAnnotations}
              onDrop={handleDropAnnotations}
            >
              <label className="dataset__upload-label">Annotated Dataset (Images + COCO JSON)</label>
              <input
                type="file"
                multiple
                disabled={uploading}
                onChange={handleUploadAnnotatedDataset}
                className="dataset__upload-input"
                accept="image/*,.json"
              />
              <div className="dataset__upload-dropzone-hint">
                <p className="dataset__upload-hint">
                  📁 Drag images + COCO JSON here, or click to select
                </p>
                <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: "0.25rem" }}>
                  ✓ Automatically extracts images from folders & parses COCO .json
                </p>
              </div>
            </div>
          </div>
          {uploading && <p className="dataset__upload-status">Uploading...</p>}
        </Card>
      </div>
      <AsyncBoundary state={state} empty={(d) => d.images.length === 0}>
        {(ds) => {
          const total = ds.counts?.total ?? ds.images.length;
          const annotated = ds.images.filter((i) =>
            i.annotated || annotations[i.id]?.length > 0 || annotations[i.url?.split('/').pop() || '']?.length > 0
          ).length;
          const pct = total ? Math.round((annotated / total) * 100) : 0;
          const shown = ds.images.filter((i) => {
            const hasAnnotations = i.annotated || annotations[i.id]?.length > 0 || annotations[i.url?.split('/').pop() || '']?.length > 0;
            return filter === "all" ? true : filter === "annotated" ? hasAnnotations : !hasAnnotations;
          });
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
                <SplitBreakdown
                  distribution={splitDistribution}
                  onDistributionChange={setSplitDistribution}
                />
              </div>

              <div className="dataset__toolbar">
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  {(["all", "annotated", "unannotated"] as Filter[]).map((f) => (
                    <button
                      key={f}
                      className={`pill-btn ${filter === f ? "pill-btn--active" : ""}`}
                      onClick={() => setFilter(f)}
                    >
                      {f} {f !== "all" && `(${ds.images.filter((i) => (f === "annotated" ? i.annotated : !i.annotated)).length})`}
                    </button>
                  ))}
                  <button
                    className="pill-btn pill-btn--danger"
                    onClick={handleDeleteAll}
                    disabled={deleting || ds.images.length === 0}
                    title="Delete all images in this dataset"
                    style={{ marginLeft: "auto" }}
                  >
                    🗑️ Delete All
                  </button>
                </div>
              </div>

              <div className="dataset__grid">
                {shown.map((img) => (
                  <figure key={img.id} className="thumb thumb--interactive">
                    <div
                      onClick={() => setPreviewImage(img)}
                      style={{ cursor: "pointer", width: "100%", height: "100%", position: "relative" }}
                      title="Click to preview"
                    >
                      <ImageWithAnnotations
                        imageUrl={img.url}
                        annotations={annotations[img.id] || annotations[img.url?.split('/').pop() || ''] || []}
                      />
                      {(imageAssignedSplits[img.id] || img.split) && (
                        <div
                          style={{
                            position: "absolute",
                            top: "4px",
                            right: "4px",
                            padding: "4px 10px",
                            borderRadius: "4px",
                            backgroundColor:
                              (imageAssignedSplits[img.id] || img.split) === "train"
                                ? "rgba(76, 175, 80, 0.95)"
                                : (imageAssignedSplits[img.id] || img.split) === "val"
                                  ? "rgba(156, 39, 176, 0.95)"
                                  : "rgba(33, 150, 243, 0.95)",
                            color: "#fff",
                            fontSize: "11px",
                            fontWeight: "700",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            pointerEvents: "none",
                            zIndex: 10,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                          }}
                        >
                          {imageAssignedSplits[img.id] || img.split}
                        </div>
                      )}
                    </div>
                    <figcaption>
                      <span className={`thumb__dot thumb__dot--${img.annotated ? "on" : "off"}`} />
                      {img.split && <span className="thumb__split">{img.split}</span>}
                      <span className="thumb__label">
                        {(img.annotated || annotations[img.id]?.length > 0 || annotations[img.url?.split('/').pop() || '']?.length > 0)
                          ? img.label_summary ?? "labeled"
                          : "unlabeled"}
                      </span>
                      <button
                        className="thumb__delete"
                        onClick={() => handleDeleteImage(img.id, img.url)}
                        disabled={deleting}
                        title="Delete image"
                      >
                        ✕
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>

              {previewImage && (
                <div
                  className="dataset__preview-modal"
                  onClick={() => setPreviewImage(null)}
                >
                  <div className="dataset__preview-content" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="dataset__preview-close"
                      onClick={() => setPreviewImage(null)}
                    >
                      ✕
                    </button>
                    <AnnotationCanvas
                      imageUrl={previewImage.url}
                      imageId={previewImage.id}
                      annotations={annotations[previewImage.id] || annotations[previewImage.url?.split('/').pop() || ''] || []}
                    />
                    <div className="dataset__preview-info">
                      <p>
                        <strong>File:</strong> {previewImage.id}
                      </p>
                      <p>
                        <strong>Status:</strong>{" "}
                        {(previewImage.annotated ||
                          annotations[previewImage.id]?.length > 0 ||
                          annotations[previewImage.url?.split('/').pop() || '']?.length > 0)
                          ? "Labeled"
                          : "Unlabeled"}
                      </p>
                      {previewImage.label_summary && (
                        <p>
                          <strong>Label:</strong> {previewImage.label_summary}
                        </p>
                      )}
                      <button
                        className="dataset__preview-delete-btn"
                        onClick={() => {
                          setPreviewImage(null);
                          handleDeleteImage(previewImage.id, previewImage.url);
                        }}
                        disabled={deleting}
                      >
                        {deleting ? "Deleting..." : "Delete Image"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        }}
      </AsyncBoundary>
    </div>
  );
}

function ImageWithAnnotations({
  imageUrl,
  annotations,
}: {
  imageUrl: string;
  annotations: Annotation[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F"];

  useEffect(() => {
    if (!annotations || annotations.length === 0) return;

    const img = imgRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!img || !canvas || !container) return;

    const drawAnnotations = () => {
      // Get the displayed dimensions of the image
      const displayWidth = img.offsetWidth;
      const displayHeight = img.offsetHeight;
      const imageWidth = img.naturalWidth;
      const imageHeight = img.naturalHeight;

      // Set canvas to display dimensions
      canvas.width = displayWidth;
      canvas.height = displayHeight;

      // Calculate scale factors
      const scaleX = displayWidth / imageWidth;
      const scaleY = displayHeight / imageHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      annotations.forEach((ann, idx) => {
        const [x, y, w, h] = ann.bbox;
        const color = colors[idx % colors.length];

        // Scale coordinates to match display size
        const displayX = x * scaleX;
        const displayY = y * scaleY;
        const displayW = w * scaleX;
        const displayH = h * scaleY;

        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, 1.5 * Math.min(scaleX, scaleY));
        ctx.strokeRect(displayX, displayY, displayW, displayH);

        if (ann.label) {
          ctx.fillStyle = color;
          const fontSize = Math.max(8, 10 * Math.min(scaleX, scaleY));
          ctx.font = `${fontSize}px sans-serif`;
          const textWidth = ctx.measureText(ann.label).width;
          const labelHeight = fontSize + 2;
          ctx.fillRect(displayX, Math.max(0, displayY - labelHeight - 2), textWidth + 4, labelHeight);
          ctx.fillStyle = "white";
          ctx.fillText(ann.label, displayX + 2, displayY - 4);
        }
      });
    };

    if (img.complete && img.naturalWidth > 0) {
      drawAnnotations();
    } else {
      img.onload = drawAnnotations;
    }

    // Redraw on window resize
    const handleResize = () => drawAnnotations();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [imageUrl, annotations]);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <img
        ref={imgRef}
        src={imageUrl}
        alt="thumbnail"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      {annotations && annotations.length > 0 && (
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        />
      )}
    </div>
  );
}

function AnnotationCanvas({
  imageUrl,
  annotations,
}: {
  imageUrl: string;
  imageId?: string;
  annotations: Annotation[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F"];

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);

      annotations.forEach((ann, idx) => {
        const [x, y, w, h] = ann.bbox;
        const color = colors[idx % colors.length];

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        if (ann.label) {
          ctx.fillStyle = color;
          ctx.font = "12px sans-serif";
          const textWidth = ctx.measureText(ann.label).width;
          ctx.fillRect(x, y - 20, textWidth + 4, 18);
          ctx.fillStyle = "white";
          ctx.fillText(ann.label, x + 2, y - 6);
        }
      });
    };
    img.src = imageUrl;
  }, [imageUrl, annotations]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        maxWidth: "100%",
        maxHeight: "400px",
        border: "1px solid #333",
        borderRadius: "4px",
      }}
    />
  );
}

function SplitBreakdown({
  distribution,
  onDistributionChange
}: {
  distribution: { train: number; val: number; test: number };
  onDistributionChange: (dist: { train: number; val: number; test: number }) => void;
}) {
  const handleChange = (key: "train" | "val" | "test", value: number) => {
    const newDist = { ...distribution, [key]: Math.max(0, Math.min(100, value)) };
    // Ensure total equals 100 by adjusting other values
    const total = newDist.train + newDist.val + newDist.test;
    if (total > 100) {
      const excess = total - 100;
      const others = (Object.keys(newDist) as Array<"train" | "val" | "test">).filter(k => k !== key);
      for (const other of others) {
        if (newDist[other] >= excess) {
          newDist[other] -= excess;
          break;
        }
      }
    }
    onDistributionChange(newDist);
  };

  return (
    <Card className="dataset__splits">
      <div className="dataset__progress-head">
        <span>Split Distribution</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {(["train", "val", "test"] as const).map((s) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ minWidth: "45px", textTransform: "capitalize", fontWeight: 600 }}>{s}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={distribution[s]}
              onChange={(e) => handleChange(s, parseInt(e.target.value))}
              style={{ flex: 1, cursor: "pointer" }}
              title={`${s}: ${distribution[s]}%`}
            />
            <div style={{ minWidth: "50px", display: "flex", alignItems: "center", gap: "4px" }}>
              <input
                type="number"
                min="0"
                max="100"
                value={distribution[s]}
                onChange={(e) => handleChange(s, parseInt(e.target.value) || 0)}
                style={{
                  width: "40px",
                  padding: "4px",
                  borderRadius: "3px",
                  border: "1px solid var(--border)",
                  background: "var(--panel)",
                  color: "var(--text)",
                  textAlign: "center",
                  cursor: "pointer",
                }}
              />
              <span>%</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--text-dim)" }}>
        <strong>Total: {distribution.train + distribution.val + distribution.test}%</strong>
      </div>
    </Card>
  );
}
