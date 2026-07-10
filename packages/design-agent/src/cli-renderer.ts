import { createColors } from "picocolors";

import type { RunManifest } from "./artifacts/store.js";
import type { ClarificationPlan, DesignAgentState } from "./state.js";

export type CliRenderer = {
  writeRunHeader(input: { runDir: string; llmSummary: string }): void;
  writeStep(node: string): void;
  writeResult(state: DesignAgentState, manifest: RunManifest, runDir: string): void;
  writeFailure(manifest: RunManifest, runDir: string, error: unknown): void;
  writeClarification(plan: ClarificationPlan, runDir: string, interactive: boolean): void;
  writeManifestSummary(manifest: RunManifest): void;
  writeArtifactSummary(manifest: RunManifest): void;
};

export function createCliRenderer(options: { write: (line: string) => void; color?: boolean }): CliRenderer {
  const color = createColors(options.color ?? true);
  const write = options.write;

  return {
    writeRunHeader(input) {
      write(color.bold("FlowMind Design Agent"));
      write(`Run directory: ${color.dim(input.runDir)}`);
      write(`LLM: ${input.llmSummary}`);
    },
    writeStep(node) {
      const label = nodeLabel(node);
      write(`Step: ${node}${label ? ` - ${label}` : ""}`);
    },
    writeResult(state, manifest, runDir) {
      write(`Stage: ${statusText(state.stage)}`);
      if (state.stage === "completed") {
        const finalArtifact = manifest.artifacts.final_output;
        if (finalArtifact) {
          write(`Final artifact: ${color.dim(finalArtifact.path)}`);
          write(`Inspect: ${inspectCommand(runDir, "final_output")}`);
        }
      }
      if (state.stage === "failed") {
        write(`Failed node: ${manifest.currentNode}`);
        write(`Inspect: ${inspectCommand(runDir, manifest.currentNode)}`);
      }
    },
    writeFailure(manifest, runDir, error) {
      const message = (error instanceof Error ? error.message : String(error)).split(/\r?\n/, 1)[0].slice(0, 500);
      const artifact = manifest.artifacts[manifest.currentNode];
      write(color.red(color.bold("Run failed")));
      write(`Failed node: ${manifest.currentNode}`);
      write(`Error: ${message}`);
      if (artifact) write(`Failure artifact: ${color.dim(artifact.path)}`);
      write(`Inspect: ${inspectCommand(runDir, manifest.currentNode)}`);
    },    writeClarification(plan, runDir, interactive) {
      write(color.yellow("Clarification required"));
      write(`Reason: ${plan.reason}`);
      if (interactive) {
        const suffix = plan.questions.length === 1 ? "question" : "questions";
        write(`${plan.questions.length} ${suffix} will be asked one by one.`);
        return;
      }
      plan.questions.forEach((question, index) => {
        write(`${index + 1}. ${question.question}`);
        write(`   Answer shape: ${question.expectedAnswerShape}`);
        (question.options ?? []).forEach((option, optionIndex) => {
          write(`   ${optionIndex + 1}. ${option}`);
        });
      });
      write(`Resume: agent resume --run ${runDir} --answer "<your answer>"`);
    },
    writeManifestSummary(manifest) {
      write(`Run status: ${manifest.status}`);
      write(`Current node: ${manifest.currentNode}`);
      write(`Completed nodes: ${manifest.completedNodes.length}`);
      this.writeArtifactSummary(manifest);
    },
    writeArtifactSummary(manifest) {
      const artifacts = Object.entries(manifest.artifacts);
      if (artifacts.length === 0) return;
      write("Artifacts:");
      for (const [name, artifact] of artifacts) {
        write(`- ${name} v${artifact.version}: ${artifact.path}`);
      }
    },
  };

  function statusText(stage: DesignAgentState["stage"]) {
    if (stage === "completed") return color.green(stage);
    if (stage === "failed") return color.red(stage);
    if (stage === "clarification") return color.yellow(stage);
    return stage;
  }
}

function nodeLabel(node: string) {
  const labels: Record<string, string> = {
    intent_recognition: "意图识别",
    completeness_check: "完整度判断",
    question_generation: "生成反问",
    clarification: "等待用户确认",
    intent_compaction: "意图收敛",
    json_planning: "JSON 规划",
    layout_planning: "布局规划",
    element_planning: "元素规划",
    interaction_planning: "交互规划",
    style_planning: "样式规划",
    image_planning: "图片规划",
    document_assembly: "设计图组装",
    image_generation: "图片生成",
    schema_validation: "Schema 校验",
    reflection_repair: "反思修复",
    document_repair: "文档修复",
    final_output: "最终输出",
    completed: "完成",
  };
  return labels[node];
}

function inspectCommand(runDir: string, node: string) {
  return `agent inspect --run ${runDir} --node ${node}`;
}
