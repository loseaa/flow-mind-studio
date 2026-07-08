import { describe, expect, it } from "vitest";

import { semanticElementPlanSchema } from "./schema.js";

const validPlan = {
  elements: [
    {
      id: "page_title",
      parentId: "header_section",
      order: 0,
      type: "text" as const,
      name: "Page Title",
      purpose: "Identify the monitoring workspace",
      content: "区域环境监测",
      attributes: [],
    },
    {
      id: "environment_map",
      parentId: "main_section",
      order: 0,
      type: "image" as const,
      name: "Environment Map",
      purpose: "Show monitoring points and regional risk",
      content: "区域环境监测地图",
      attributes: [
        { key: "imagePrompt", value: "GIS map with environmental monitoring markers" },
      ],
    },
  ],
  notes: ["Keep the primary map visible."],
};

describe("semanticElementPlanSchema", () => {
  it("accepts a bounded semantic element plan", () => {
    expect(semanticElementPlanSchema.parse(validPlan)).toEqual(validPlan);
  });

  it("rejects duplicate element ids", () => {
    expect(() => semanticElementPlanSchema.parse({
      ...validPlan,
      elements: [...validPlan.elements, { ...validPlan.elements[0] }],
    })).toThrow(/duplicate element id/i);
  });

  it("rejects structural container types", () => {
    expect(() => semanticElementPlanSchema.parse({
      ...validPlan,
      elements: [{ ...validPlan.elements[0], type: "section" }],
    })).toThrow();
  });

  it("rejects plans larger than 80 elements", () => {
    const elements = Array.from({ length: 81 }, (_, index) => ({
      ...validPlan.elements[0],
      id: `text_${index}`,
      order: index,
    }));

    expect(() => semanticElementPlanSchema.parse({ ...validPlan, elements })).toThrow();
  });

  it("rejects more than 12 attributes per element", () => {
    const attributes = Array.from({ length: 13 }, (_, index) => ({
      key: `attribute_${index}`,
      value: String(index),
    }));

    expect(() => semanticElementPlanSchema.parse({
      ...validPlan,
      elements: [{ ...validPlan.elements[0], attributes }],
    })).toThrow();
  });
});
