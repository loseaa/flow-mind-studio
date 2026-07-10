import { describe, expect, it } from "vitest";
import type { DesignBaseStyle, DesignDocument } from "@flowmind/shared";
import { compileVisualAssetPlan } from "./compiler.js";
import type { VisualAssetPlan } from "./schema.js";

describe("compileVisualAssetPlan", () => {
  it("writes metadata only to existing slot targets", () => {
    const document=baseDocument(); const tree=structuredClone(document.tree); const layouts=document.elements.map(e=>({id:e.id,layout:structuredClone(e.layout)}));
    const compiled=compileVisualAssetPlan(document,plan());
    expect(compiled.tree).toEqual(tree); expect(compiled.elements).toHaveLength(document.elements.length); expect(compiled.elements.map(e=>({id:e.id,layout:e.layout}))).toEqual(layouts);
    expect(compiled.elements.find(e=>e.id==="slot_inline")?.props).toMatchObject({imageSlotId:"slot_inline",visualAssetId:"asset_inline",purpose:"Feature",promptBrief:"Feature image",generationPriority:"required"});
  });
  it("rejects a target that does not own the slot", () => { const p=plan(); p.assets[0]={...p.assets[0],slotId:"wrong"}; expect(()=>compileVisualAssetPlan(baseDocument(),p)).toThrow(/does not own slot/i); });
});
function plan():VisualAssetPlan { return {imagePolicy:"required",visualMode:"standard",minimumGeneratedAssets:3,notes:[],assets:[
  {id:"asset_bg",slotId:"slot_bg",kind:"background_image",role:"hero",targetElementId:"hero",purpose:"Backdrop",promptBrief:"Hero background",width:1440,height:800,aspectRatio:"wide",priority:"required",foregroundTone:"light"},
  {id:"asset_inline",slotId:"slot_inline",kind:"content_image",role:"section",targetElementId:"slot_inline",purpose:"Feature",promptBrief:"Feature image",width:1200,height:800,aspectRatio:"wide",priority:"required"},
  {id:"asset_card",slotId:"slot_card",kind:"content_image",role:"thumbnail",targetElementId:"slot_card",purpose:"Card",promptBrief:"Card image",width:800,height:800,aspectRatio:"square",priority:"recommended"},
]}; }
function baseDocument():DesignDocument { return {schemaVersion:"fm-design/v1",id:"doc",name:"Doc",canvas:{viewport:"desktop",width:1440,background:"muted"},tree:{id:"page",children:[{id:"hero",children:[{id:"slot_inline",children:[]},{id:"slot_card",children:[]}]}]},elements:[container("page","page"),{...container("hero","section"),props:{imageSlotId:"slot_bg"}},image("slot_inline"),image("slot_card")],variables:{}}; }
function image(id:string){return {id,name:id,type:"image" as const,layout:{width:"fill" as const,height:"hug" as const},props:{imageSlotId:id},style:{base:base(),image:{aspectRatio:"wide" as const,objectFit:"cover" as const}}};}
function container(id:string,type:"page"|"section"){return{id,name:id,type,props:{},style:{base:base(),container:{shadow:"none" as const,overflow:"visible" as const,surface:"flat" as const}}};}
function base():DesignBaseStyle{return{backgroundColor:"surface",radius:"md",border:{width:"none",style:"none",color:"border"},text:{color:"textPrimary",fontFamily:"sans",fontSize:"md",fontWeight:"regular",lineHeight:"normal",align:"left"}};}