import { describe, expect, it } from "vitest";

import { classifyAgentStep } from "./AgentTranscript";

describe("agent transcript classification", () => {
  it("labels navigation, interaction, DOM and screenshot steps", () => {
    expect(classifyAgentStep({ kind: "navigate", label: "Opened https://site.dev/login" })).toBe(
      "navigation",
    );
    expect(classifyAgentStep({ kind: "step", label: "Clicked Sign in" })).toBe("action");
    expect(classifyAgentStep({ kind: "dom", label: "Form fields mutated" })).toBe("dom");
    expect(classifyAgentStep({ kind: "screenshot", label: "Captured page" })).toBe("shot");
    expect(classifyAgentStep({ kind: "note", label: "Waiting" })).toBe("other");
  });
});
