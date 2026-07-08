import type { DesignDocument } from "@flowmind/shared";

export type SchemaValidationOutput = {
  document: DesignDocument | unknown;
  valid: boolean;
  errors: string[];
};
