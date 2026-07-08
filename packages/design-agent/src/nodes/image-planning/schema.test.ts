import { describe, expect, it } from "vitest";
import { createInitialState } from "../../state.js";
import { imagePlanningModelOutputSchema, validateImagePolicy, visualAssetPlanSchema, type VisualAssetPlan } from "./schema.js";

const draft = () => ({ visualAssetPlan: { imagePolicy: "required" as const, visualMode: "standard" as const, minimumGeneratedAssets: 3 as const, assets: ["a","b","c"].map((id) => ({ id, slotId: `slot_${id}`, purpose: id, promptBrief: `${id} scene`, priority: "required" as const })), notes: [] } });
const resolved = (): VisualAssetPlan => ({ ...draft().visualAssetPlan, assets: draft().visualAssetPlan.assets.map((asset) => ({ ...asset, kind: "content_image" as const, role: "section" as const, targetElementId: asset.slotId, width: 1200, height: 800, aspectRatio: "wide" as const })) });

describe("image planning schemas", () => {
  it("accepts slot-only model drafts", () => expect(imagePlanningModelOutputSchema.parse(draft())).toEqual(draft()));
  it.each(["targetElementId", "parentId", "order", "width", "height", "aspectRatio", "display"])("rejects model-provided %s", (field) => { const input:any=draft(); input.visualAssetPlan.assets[0][field]=field==="width"?1200:"forbidden"; expect(() => imagePlanningModelOutputSchema.parse(input)).toThrow(); });
  it("accepts resolved plans and rejects duplicate slots", () => { expect(visualAssetPlanSchema.parse(resolved()).assets).toHaveLength(3); const plan=resolved(); plan.assets[1]={...plan.assets[1],slotId:plan.assets[0].slotId}; expect(() => visualAssetPlanSchema.parse(plan)).toThrow(/Duplicate image slot/i); });
  it("enforces required and no-image policies", () => { const state=createInitialState("policy"); expect(() => visualAssetPlanSchema.parse({...resolved(),assets:resolved().assets.slice(0,2)})).toThrow(/at least three/i); const none={imagePolicy:"none" as const,visualMode:"none" as const,minimumGeneratedAssets:0 as const,assets:[],notes:[]}; expect(validateImagePolicy(none,{messages:[{role:"user",content:"不要图片",createdAt:"2026-01-01"}],dimensions:state.dimensions})).toEqual(none); });
});