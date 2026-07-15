import { describe, expect, it } from "vitest";

import { visualReviewModelOutputSchema } from "./schema.js";

describe("visualReviewModelOutputSchema", () => {
  it("normalizes common severity and description fields", () => {
    expect(visualReviewModelOutputSchema.parse({
      issues: [
        { severity: "error", description: "Missing primary action", elementId: "hero" },
        { severity: "warning", description: "Color contrast could improve", elementId: null },
        { severity: "info", description: "No images requested", elementId: null },
      ],
      notes: ["Model review"],
    })).toEqual({
      issues: [
        { code: "MODEL_VISUAL_HIGH_1", severity: "high", suggestion: "Missing primary action", elementId: "hero" },
        { code: "MODEL_VISUAL_MEDIUM_2", severity: "medium", suggestion: "Color contrast could improve" },
        { code: "MODEL_VISUAL_LOW_3", severity: "low", suggestion: "No images requested" },
      ],
      notes: ["Model review"],
    });
  });
});
