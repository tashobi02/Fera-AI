// COMP-031 render run (TASK-024): share text → font → layout → paint → PNG → object URL.
// Pure orchestration with injected browser pieces, so the stale-run rules are tested in
// Node. A run is stale when the parent changed the contact choice, unticked the
// acknowledgement, started another run or left the page while it was waiting on the
// font or the PNG encoder: a stale run publishes nothing and revokes any URL it made.
import {
  layoutPoster,
  type Measure,
  type PosterLayout,
  type ShareText,
} from "./poster";

export type RenderOutcome =
  | { status: "ready"; url: string }
  | { status: "font" | "too-long" | "blocked" | "failed" }
  | { status: "stale" };

export type PosterRenderDeps = {
  family: () => Promise<string | null>; // null: the Bangla font did not load
  measure: Measure;
  paint: (layout: Extract<PosterLayout, { kind: "ok" }>) => void;
  toBlob: () => Promise<Blob | null>;
  createUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
};

export async function renderPoster(
  share: ShareText,
  deps: PosterRenderDeps,
  isCurrent: () => boolean,
): Promise<RenderOutcome> {
  if (share.kind === "blocked") return { status: "blocked" };
  try {
    const family = await deps.family();
    if (!isCurrent()) return { status: "stale" };
    if (!family) return { status: "font" };
    const layout = layoutPoster(share.text, family, deps.measure);
    if (layout.kind === "too-long") return { status: "too-long" };
    deps.paint(layout);
    const blob = await deps.toBlob();
    if (!isCurrent()) return { status: "stale" };
    if (!blob) return { status: "failed" };
    const url = deps.createUrl(blob);
    if (!isCurrent()) {
      deps.revokeUrl(url);
      return { status: "stale" };
    }
    return { status: "ready", url };
  } catch {
    return isCurrent() ? { status: "failed" } : { status: "stale" };
  }
}
