import { describe, expect, it } from "vitest";
import type { IntentDimension } from "../state.js";
import { createInitialDimensions } from "../state.js";
import { evaluateCompleteness, generateClarificationPlan, recordQuestionsAsked, updateDimensionState } from "./dimensions.js";

describe("intent nodes", () => {
  it("marks initial dimensions as incomplete", () => {
    const result = evaluateCompleteness(createInitialDimensions());

    expect(result.allComplete).toBe(false);
    expect(result.completedDimensions).toHaveLength(0);
    expect(result.incompleteDimensions.map((item) => item.key)).toEqual([
      "page_context",
      "content_structure",
      "data_requirements",
      "interaction_flow",
      "presentation_rules"
    ]);
    expect(result.blockingReasons).toContain("page_context is missing");
  });

  it("marks all dimensions complete only when every dimension is complete", () => {
    const dimensions = createInitialDimensions().map((dimension): IntentDimension => ({
      ...dimension,
      status: "complete",
      completeness: 1,
      confidence: 0.9,
      value: { confirmed: true }
    }));

    const result = evaluateCompleteness(dimensions);

    expect(result.allComplete).toBe(true);
    expect(result.completedDimensions).toHaveLength(5);
    expect(result.incompleteDimensions).toHaveLength(0);
    expect(result.conflictingDimensions).toHaveLength(0);
  });

  it("generates questions only for blocking incomplete dimensions", () => {
    const dimensions = createInitialDimensions().map((dimension): IntentDimension => {
      if (dimension.key === "page_context") {
        return { ...dimension, status: "complete", completeness: 1, confidence: 0.9, value: { pageType: "list" } };
      }
      return dimension;
    });

    const result = evaluateCompleteness(dimensions);
    const plan = generateClarificationPlan(result);

    expect(plan.questions).toHaveLength(3);
    expect(plan.questions.map((item) => item.dimensionKey)).toEqual([
      "content_structure",
      "data_requirements",
      "interaction_flow"
    ]);
    expect(plan.questions[0].question).toContain("页面需要哪些核心区块");
  });

  it("merges recognized dimension updates into existing dimension state", () => {
    const dimensions = createInitialDimensions();
    const next = updateDimensionState(dimensions, [
      {
        key: "page_context",
        status: "complete",
        completeness: 0.9,
        confidence: 0.8,
        value: { businessGoal: "客户管理", pageType: "列表页" },
        evidence: ["用户说要做客户管理列表页"],
        missingFields: [],
        assumptions: ["目标用户默认后台运营"]
      }
    ]);

    const pageContext = next.find((dimension) => dimension.key === "page_context");
    const contentStructure = next.find((dimension) => dimension.key === "content_structure");

    expect(pageContext).toMatchObject({
      status: "complete",
      completeness: 0.9,
      confidence: 0.8,
      value: { businessGoal: "客户管理", pageType: "列表页" },
      evidence: ["用户说要做客户管理列表页"],
      assumptions: ["目标用户默认后台运营"]
    });
    expect(contentStructure?.status).toBe("missing");
  });

  it("deduplicates evidence and keeps previous questions when merging updates", () => {
    const dimensions = createInitialDimensions().map((dimension): IntentDimension => {
      if (dimension.key !== "data_requirements") return dimension;
      return {
        ...dimension,
        questionsAsked: ["页面里最核心要展示或录入哪些字段？"],
        evidence: ["用户提到客户表格"]
      };
    });

    const next = updateDimensionState(dimensions, [
      {
        key: "data_requirements",
        status: "partial",
        completeness: 0.6,
        confidence: 0.7,
        value: { fields: ["客户名", "负责人"] },
        evidence: ["用户提到客户表格", "用户补充客户名和负责人"],
        missingFields: ["状态"],
        assumptions: []
      }
    ]);

    const dataRequirements = next.find((dimension) => dimension.key === "data_requirements");
    expect(dataRequirements?.evidence).toEqual(["用户提到客户表格", "用户补充客户名和负责人"]);
    expect(dataRequirements?.questionsAsked).toEqual(["页面里最核心要展示或录入哪些字段？"]);
    expect(dataRequirements?.missingFields).toEqual(["状态"]);
  });

  it("records generated questions on their target dimensions", () => {
    const dimensions = createInitialDimensions();
    const result = evaluateCompleteness(dimensions);
    const plan = generateClarificationPlan(result);

    const next = recordQuestionsAsked(dimensions, plan);
    const contentStructure = next.find((dimension) => dimension.key === "content_structure");

    expect(contentStructure?.questionsAsked).toContain("页面需要哪些核心区块？例如筛选区、指标卡、表格、表单或操作区。");
  });
});
