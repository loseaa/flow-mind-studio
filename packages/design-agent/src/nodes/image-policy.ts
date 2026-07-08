import type { AgentMessage, IntentDimension } from "../state.js";

export type ImagePolicyContext = {
  messages: AgentMessage[];
  dimensions: IntentDimension[];
};

export function hasExplicitNoImageIntent(context: ImagePolicyContext): boolean {
  const userMessages = context.messages.filter((message) => message.role === "user");
  for (let index = userMessages.length - 1; index >= 0; index -= 1) {
    const policy = classifyImagePolicy(userMessages[index].content);
    if (policy !== undefined) return policy === "none";
  }

  const presentation = context.dimensions.find((dimension) => dimension.key === "presentation_rules");
  if (!presentation) return false;
  for (const text of collectStrings([
    presentation.value,
    presentation.evidence,
    presentation.assumptions,
  ])) {
    const policy = classifyImagePolicy(text);
    if (policy !== undefined) return policy === "none";
  }
  return false;
}

type ImagePolicy = "required" | "none";

type PolicyMatch = { index: number; end: number; policy: ImagePolicy };

function classifyImagePolicy(text: string): ImagePolicy | undefined {
  const positiveMatches: PolicyMatch[] = [];
  const noImageMatches: PolicyMatch[] = [];
  collectMatches(text, POSITIVE_IMAGE_PATTERNS, "required", positiveMatches);
  collectMatches(text, NO_IMAGE_PATTERNS, "none", noImageMatches);

  const matches = [
    ...positiveMatches,
    ...noImageMatches.filter(
      (negative) => !positiveMatches.some(
        (positive) => negative.index >= positive.index && negative.end <= positive.end,
      ),
    ),
  ];
  return matches.sort((left, right) => left.index - right.index).at(-1)?.policy;
}

function collectMatches(
  text: string,
  patterns: RegExp[],
  policy: ImagePolicy,
  matches: PolicyMatch[],
) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) matches.push({ index: match.index, end: match.index + match[0].length, policy });
  }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}

const POSITIVE_IMAGE_PATTERNS = [
  /不是不要(?:使用|生成|放置)?图片/iu,
  /还是(?:需要|使用|生成|加入|添加)图片/iu,
  /改为(?:需要|使用|生成|加入|添加)?图片/iu,
  /(?<!不要)(?<!不)(?:需要|使用|生成|加入|添加|放置)图片/iu,
  /\bwith images?\b/iu,
  /\b(?:use|include|add|generate) images?\b/iu,
];

const NO_IMAGE_PATTERNS = [
  /不要(?:使用|生成|放置)?图片/iu,
  /不需要图片/iu,
  /不使用(?:背景)?图(?:片)?/iu,
  /不要背景图(?:片)?/iu,
  /无图片(?:页面|设计|模式)?/iu,
  /\bno images?\b/iu,
  /\bwithout images?\b/iu,
];