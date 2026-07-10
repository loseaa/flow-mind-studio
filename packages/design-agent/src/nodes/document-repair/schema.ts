import type { DesignDocument } from "@flowmind/shared";
import type { ArtifactRef } from "../../state.js";

export type DocumentRepairOutput = {
  document: DesignDocument;
  repaired: boolean;
  appliedOperations: Array<{
    target: string;
    action: string;
    reason: string;
  }>;
  sourceArtifacts: {
    schemaValidation: ArtifactRef;
    reflectionRepair?: ArtifactRef;
    visualReview?: ArtifactRef;
  };
};
