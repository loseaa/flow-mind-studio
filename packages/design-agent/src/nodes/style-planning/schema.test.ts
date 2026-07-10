import { describe, expect, it } from "vitest";

import { stylePlanSchema } from "./schema.js";

const validPlan = {
  theme: "data_dense" as const,
  tone: "operational" as const,
  assignments: [
    { elementId: "page_title", preset: "heading" as const },
    { elementId: "results_table", preset: "data_table" as const },
  ],
  notes: [],
};

describe("stylePlanSchema", () => {
  it("accepts bounded preset assignments", () => {
    expect(stylePlanSchema.parse(validPlan)).toEqual(validPlan);
  });

  it("rejects duplicate element assignments", () => {
    expect(() => stylePlanSchema.parse({
      ...validPlan,
      assignments: [...validPlan.assignments, validPlan.assignments[0]],
    })).toThrow(/duplicate style assignment/i);
  });

  it("rejects more than 80 assignments", () => {
    expect(() => stylePlanSchema.parse({
      ...validPlan,
      assignments: Array.from({ length: 81 }, (_, index) => ({
        elementId: `element_${index}`,
        preset: "body",
      })),
    })).toThrow();
  });
});
