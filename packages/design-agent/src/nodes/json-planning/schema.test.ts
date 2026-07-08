import { describe, expect, it } from "vitest";

import { pageStructurePlanSchema } from "./schema.js";

const validPlan = {
  document: {
    id: "environment_dashboard",
    name: "Environment Dashboard",
    viewport: "desktop" as const,
    width: 1440,
    background: "muted" as const,
  },
  nodes: [
    {
      id: "page_root",
      parentId: null,
      order: 0,
      type: "page" as const,
      name: "Page",
      purpose: "Application root",
    },
    {
      id: "header",
      parentId: "page_root",
      order: 0,
      type: "section" as const,
      name: "Header",
      purpose: "Page context",
    },
    {
      id: "content",
      parentId: "page_root",
      order: 1,
      type: "section" as const,
      name: "Content",
      purpose: "Primary workspace",
    },
  ],
};

describe("pageStructurePlanSchema", () => {
  it("accepts a valid flat page structure", () => {
    expect(pageStructurePlanSchema.parse(validPlan)).toEqual(validPlan);
  });

  it("rejects duplicate node ids", () => {
    expect(() => pageStructurePlanSchema.parse({
      ...validPlan,
      nodes: [...validPlan.nodes, { ...validPlan.nodes[1] }],
    })).toThrow(/duplicate node id/i);
  });

  it("rejects multiple roots", () => {
    expect(() => pageStructurePlanSchema.parse({
      ...validPlan,
      nodes: [
        ...validPlan.nodes,
        { ...validPlan.nodes[1], id: "second_root", parentId: null, type: "page" as const },
      ],
    })).toThrow(/exactly one root/i);
  });

  it("rejects missing parent references", () => {
    expect(() => pageStructurePlanSchema.parse({
      ...validPlan,
      nodes: validPlan.nodes.map((node) => node.id === "header" ? { ...node, parentId: "missing" } : node),
    })).toThrow(/missing parent/i);
  });

  it("rejects parent cycles", () => {
    expect(() => pageStructurePlanSchema.parse({
      ...validPlan,
      nodes: [
        validPlan.nodes[0],
        { ...validPlan.nodes[1], parentId: "content" },
        { ...validPlan.nodes[2], parentId: "header" },
      ],
    })).toThrow(/cycle/i);
  });

  it("rejects plans larger than the node limit", () => {
    const nodes = [validPlan.nodes[0]];
    for (let index = 1; index <= 40; index += 1) {
      nodes.push({
        ...validPlan.nodes[1],
        id: `section_${index}`,
        order: index,
      });
    }

    expect(() => pageStructurePlanSchema.parse({ ...validPlan, nodes })).toThrow();
  });
});
