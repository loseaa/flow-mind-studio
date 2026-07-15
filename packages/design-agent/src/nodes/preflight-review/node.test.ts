import { describe, expect, it } from "vitest";
import type { DesignDocument } from "@flowmind/shared";

import { reviewPreflight } from "./node.js";
import type { ContentPlan } from "../content-planning/schema.js";

describe("reviewPreflight", () => {
  it("accepts product narrative structures with non-canonical ids when semantic regions are present", () => {
    const errors = reviewPreflight(productDocument(), productContentPlan(), { dimensions: [] });
    expect(errors).toEqual([]);
  });
});

function productContentPlan(): ContentPlan {
  return {
    archetype: "product_marketing",
    subject: "Football Introduction",
    narrative: "Introduce the product with a launch story.",
    sections: [
      { id: "hero", role: "hero", purpose: "Hero", requiredBlocks: ["headline", "body", "primary_action"] },
      { id: "proof", role: "proof", purpose: "Proof", requiredBlocks: ["section_heading", "metric"] },
      { id: "features", role: "features", purpose: "Features", requiredBlocks: ["section_heading", "feature_card"] },
      { id: "story", role: "story", purpose: "Story", requiredBlocks: ["section_heading", "body"] },
      { id: "specifications", role: "specifications", purpose: "Specifications", requiredBlocks: ["section_heading", "specification"] },
      { id: "social_proof", role: "social_proof", purpose: "Social proof", requiredBlocks: ["section_heading", "testimonial"] },
      { id: "cta", role: "cta", purpose: "CTA", requiredBlocks: ["headline", "body", "primary_action"] },
    ],
    qualityTargets: {
      minimumSections: 7,
      minimumTreeDepth: 4,
      minimumTextElements: 15,
      minimumActions: 2,
      minimumStats: 3,
      maximumImages: 5,
    },
  };
}

function productDocument(): DesignDocument {
  const container = (id: string, name: string, type: "page" | "section" | "stack", purpose: string) => ({
    id,
    name,
    type,
    props: { purpose },
    layout: { display: "flex", direction: "vertical", gap: "md", width: "fill" },
    style: {
      base: {
        backgroundColor: "muted",
        radius: "none",
        border: { width: "none", style: "none", color: "border" },
        text: {
          color: "textPrimary",
          fontFamily: "sans",
          fontSize: "md",
          fontWeight: "regular",
          lineHeight: "normal",
          align: "left",
        },
      },
      container: { shadow: "none", overflow: "visible", surface: "flat" },
    },
  });
  const text = (id: string, parentId: string, textContent: string, role: "heading" | "body" | "subheading" = "body") => ({
    id,
    name: textContent,
    type: "text" as const,
    props: { purpose: textContent, text: textContent, parentId },
    style: {
      base: {
        backgroundColor: "transparent",
        radius: "none",
        border: { width: "none", style: "none", color: "border" },
        text: {
          color: "textPrimary",
          fontFamily: "sans",
          fontSize: "md",
          fontWeight: "regular",
          lineHeight: "normal",
          align: "left",
        },
      },
      text: { role, decoration: "none", transform: "none" },
    },
  });
  const button = (id: string, parentId: string, label: string, emphasis: "primary" | "secondary") => ({
    id,
    name: label,
    type: "button" as const,
    props: { purpose: label, text: label, parentId },
    style: {
      base: {
        backgroundColor: "brand",
        radius: "md",
        border: { width: "none", style: "none", color: "border" },
        text: {
          color: "textOnBrand",
          fontFamily: "sans",
          fontSize: "md",
          fontWeight: "medium",
          lineHeight: "normal",
          align: "center",
        },
      },
      button: { emphasis, size: "md" },
    },
  });

  return {
    schemaVersion: "fm-design/v1",
    id: "root",
    name: "Football Introduction",
    canvas: { viewport: "desktop", width: 1440, background: "muted" },
    tree: { id: "root", children: [] },
    elements: [
      container("root", "Football Introduction", "page", "Introduce football."),
      container("sec-hero", "Hero", "section", "Hero section"),
      container("stk-hero-copy", "Hero Copy", "stack", "Contains hero text content."),
      container("sec-features", "Features", "section", "Features section"),
      container("stk-features-grid", "Feature Grid", "stack", "Grid container for feature cards."),
      container("sec-cta", "CTA", "section", "Close the page with a clear final decision and action."),
      text("hero_title", "stk-hero-copy", "Football, reimagined", "heading"),
      text("text_1", "stk-hero-copy", "body 1"),
      text("text_2", "stk-hero-copy", "body 2"),
      text("text_3", "stk-hero-copy", "body 3"),
      text("text_4", "stk-hero-copy", "body 4"),
      text("text_5", "stk-hero-copy", "body 5"),
      text("text_6", "stk-hero-copy", "body 6"),
      text("text_7", "stk-hero-copy", "body 7"),
      text("text_8", "stk-hero-copy", "body 8"),
      text("text_9", "stk-features-grid", "body 9"),
      text("text_10", "stk-features-grid", "body 10"),
      text("text_11", "stk-features-grid", "body 11"),
      text("text_12", "stk-features-grid", "body 12"),
      text("text_13", "stk-features-grid", "body 13"),
      text("text_14", "stk-features-grid", "body 14"),
      button("primary_cta", "sec-cta", "Buy now", "primary"),
      button("secondary_cta", "sec-cta", "Learn more", "secondary"),
    ],
    variables: {},
  } as DesignDocument;
}
