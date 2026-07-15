import { describe, expect, it } from "vitest";

import { interactionPlanningModelOutputSchema, interactionPlanSchema } from "./schema.js";

const validPlan = {
  interactions: [{
    id: "refresh_monitoring_data",
    sourceElementId: "refresh_button",
    event: "click" as const,
    action: "refresh" as const,
    targetElementId: "monitoring_table",
    description: "Refresh the monitoring results",
    payload: [{ key: "scope", value: "current-region" }],
  }],
  notes: [],
};

describe("interactionPlanSchema", () => {
  it("accepts a bounded interaction plan", () => {
    expect(interactionPlanSchema.parse(validPlan)).toEqual(validPlan);
  });

  it("rejects duplicate interaction ids", () => {
    expect(() => interactionPlanSchema.parse({
      ...validPlan,
      interactions: [...validPlan.interactions, { ...validPlan.interactions[0] }],
    })).toThrow(/duplicate interaction id/i);
  });

  it("rejects plans larger than 50 interactions", () => {
    const interactions = Array.from({ length: 51 }, (_, index) => ({
      ...validPlan.interactions[0],
      id: `interaction_${index}`,
    }));
    expect(() => interactionPlanSchema.parse({ ...validPlan, interactions })).toThrow();
  });
});

describe("interactionPlanningModelOutputSchema", () => {
  it("normalizes trigger, business action, null target, and missing payload", () => {
    expect(interactionPlanningModelOutputSchema.parse({
      interactionPlan: {
        id: "start_trial",
        sourceElementId: "refresh_button",
        targetElementId: null,
        trigger: "click",
        action: "startTrial",
        description: "Start trial",
      },
    })).toEqual({
      interactionPlan: {
        interactions: [{
          id: "start_trial",
          sourceElementId: "refresh_button",
          event: "click",
          action: "submit",
          description: "Start trial",
          payload: [],
        }],
        notes: [],
      },
    });
  });
});
