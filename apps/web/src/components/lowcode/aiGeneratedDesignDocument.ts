import { designDocumentSchema } from "@flowmind/shared";
import snapshot from "./aiGeneratedDesignDocument.snapshot.json";

export const aiGeneratedDesignDocument = designDocumentSchema.parse(snapshot);