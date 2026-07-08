import { describe, expect, it } from "vitest";

import { createInitialState } from "../state.js";
import { routeAfterReflectionRepair, routeAfterSchemaValidation } from "./routing.js";

describe("routing", () => {
  it("routes failed schema validation to reflection repair", () => {
    expect(routeAfterSchemaValidation({
      ...createInitialState("thread_route_failed"),
      stage: "failed",
      validationErrors: ["elements: Array must contain at least 1 element(s)"],
    })).toBe("reflection_repair");
  });

  it("routes successful schema validation to final output", () => {
    expect(routeAfterSchemaValidation({
      ...createInitialState("thread_route_success"),
      stage: "schema_validation",
      validationErrors: [],
    })).toBe("final_output");
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
