import type { DesignDocument } from "@flowmind/shared";
import { z } from "zod";

export const imageGenerationItemSchema = z.object({
  assetId: z.string().min(1),
  elementId: z.string().min(1),
  targetElementId: z.string().min(1),
  kind: z.enum(["content_image", "background_image"]),
  role: z.enum(["hero", "section", "thumbnail", "illustration"]),
  priority: z.enum(["required", "recommended", "optional"]),
  purpose: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  aspectRatio: z.enum(["wide", "square", "portrait"]),
  prompt: z.string().min(1),
  attempts: z.number().int().min(1).max(2),
  status: z.enum(["generated", "failed"]),
  url: z.string().url().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  revisedPrompt: z.string().optional(),
  error: z.string().optional(),
}).strict();

export const imageGenerationOutputSchema = z.object({
  document: z.unknown(),
  images: z.array(imageGenerationItemSchema),
  generatedCount: z.number().int().nonnegative(),
  minimumGeneratedAssets: z.union([z.literal(0), z.literal(3)]),
  imagePolicy: z.enum(["required", "none"]),
}).strict();

export type ImageGenerationItem = z.infer<typeof imageGenerationItemSchema>;
export type ImageGenerationOutput = Omit<z.infer<typeof imageGenerationOutputSchema>, "document"> & {
  document: DesignDocument;
};