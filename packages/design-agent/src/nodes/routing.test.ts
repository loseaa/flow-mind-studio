import { describe, expect, it } from "vitest";

import { createInitialState } from "../state.js";
import { routeAfterReflectionRepair, routeAfterSchemaValidation, routeAfterVisualReview } from "./routing.js";

describe("routing", () => {
  it("routes failed schema validation to reflection repair", () => {
    expect(routeAfterSchemaValidation({
      ...createInitialState("thread_route_failed"),
      stage: "failed",
      validationErrors: ["elements: Array must contain at least 1 element(s)"],
    })).toBe("reflection_repair");
  });

  it("routes successful schema validation to visual review", () => {
    expect(routeAfterSchemaValidation({
      ...createInitialState("thread_route_success"),
      stage: "schema_validation",
      validationErrors: [],
    })).toBe("visual_review");
  });

  it("routes visual review issues to document repair while attempts remain", () => {
    expect(routeAfterVisualReview({
      ...createInitialState("thread_visual_route_retry"),
      validationErrors: ["IMAGE_SLOT_METADATA_MISSING: Restore deterministic image slot metadata."],
      repairAttempts: 0,
    })).toBe("document_repair");
  });

  it("stops visual review repair loops when max attempts are reached", () => {
    expect(routeAfterVisualReview({
      ...createInitialState("thread_visual_route_stop"),
      validationErrors: ["IMAGE_SLOT_METADATA_MISSING: Restore deterministic image slot metadata."],
      repairAttempts: 2,
    })).toBe("failed");
  });

  it("routes reflection repair to document repair while attempts remain", () => {
    expect(routeAfterReflectionRepair({
      ...createInitialState("thread_reflection_route_retry"),
      repairAttempts: 0,
    })).toBe("document_repair");
  });

  it("stops reflection repair when max attempts are reached", () => {
    expect(routeAfterReflectionRepair({
      ...createInitialState("thread_reflection_route_stop"),
      repairAttempts: 2,
    })).toBe("failed");
  });
});
