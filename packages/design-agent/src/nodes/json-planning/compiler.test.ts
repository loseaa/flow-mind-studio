import { designDocumentSchema } from "@flowmind/shared";
import { describe, expect, it } from "vitest";

import { compilePageStructurePlan } from "./compiler.js";
import type { PageStructurePlan } from "./schema.js";

const plan: PageStructurePlan = {
  document: {
    id: "environment_dashboard",
    name: "Environment Dashboard",
    viewport: "desktop",
    width: 1440,
    background: "muted",
  },
  nodes: [
    {
      id: "content",
      parentId: "page_root",
      order: 1,
      type: "section",
      name: "Content",
      purpose: "Primary workspace",
    },
    {
      id: "page_root",
      parentId: null,
      order: 0,
      type: "page",
      name: "Page",
      purpose: "Application root",
    },
    {
      id: "sidebar",
      parentId: "page_root",
      order: 0,
      type: "section",
      name: "Sidebar",
      purpose: "Filters and layers",
    },
    {
      id: "map_stack",
      parentId: "content",
      order: 0,
      type: "stack",
      name: "Map Stack",
      purpose: "Map and overlays",
    },
  ],
};

describe("compilePageStructurePlan", () => {
  it("builds a deterministic tree ordered by order and id", () => {
    const document = compilePageStructurePlan(plan);

    expect(document.tree.id).toBe("page_root");
    expect(document.tree.children?.map((node) => node.id)).toEqual(["sidebar", "content"]);
    expect(document.tree.children?.[1]?.children?.map((node) => node.id)).toEqual(["map_stack"]);
  });

  it("creates exactly one complete element for every tree node", () => {
    const document = compilePageStructurePlan(plan);

    expect(document.elements.map((element) => element.id).sort()).toEqual(
      ["page_root", "sidebar", "content", "map_stack"].sort(),
    );
    expect(document.elements.find((element) => element.id === "sidebar")?.props).toEqual({
      purpose: "Filters and layers",
    });
  });

  it("returns an fm-design/v1 document", () => {
    const document = compilePageStructurePlan(plan);

    expect(designDocumentSchema.parse(document)).toEqual(document);
    expect(document).toMatchObject({
      schemaVersion: "fm-design/v1",
      id: "environment_dashboard",
      name: "Environment Dashboard",
      canvas: { viewport: "desktop", width: 1440, background: "muted" },
    });
  });
});
