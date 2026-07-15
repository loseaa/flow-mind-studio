import type { DesignDocument } from "@flowmind/shared";
import type { ArtifactRef } from "../../state.js";

export type DocumentAssemblyOutput = {
  document: DesignDocument;
  sourcePlans: {
    contentPlanning?: unknown;
    structurePlanning: unknown;
    layoutPlanning: unknown;
    visualSlotReview: unknown;
    elementPlanning: unknown;
    interactionPlanning: unknown;
    stylePlanning: unknown;
    imagePlanning: unknown;
  };
  sourceArtifacts: {
    contentPlanning?: ArtifactRef;
    structurePlanning: ArtifactRef;
    layoutPlanning: ArtifactRef;
    visualSlotReview: ArtifactRef;
    elementPlanning: ArtifactRef;
    interactionPlanning: ArtifactRef;
    stylePlanning: ArtifactRef;
    imagePlanning: ArtifactRef;
  };
};
