import { describe, expect, it } from "vitest";
import { acceptsAttachment, attachmentSummary } from "./chat-attachments";

describe("chat attachments", () => {
  it("accepts images and common source files", () => {
    expect(acceptsAttachment(new File(["x"], "screen.png", { type: "image/png" }))).toBe(true);
    expect(acceptsAttachment(new File(["x"], "App.tsx", { type: "" }))).toBe(true);
    expect(acceptsAttachment(new File(["x"], "archive.zip", { type: "application/zip" }))).toBe(false);
  });

  it("creates a customer-safe message summary", () => {
    expect(
      attachmentSummary([
        { id: "1", name: "brief.md", type: "text/markdown", size: 4, kind: "text", content: "test" },
      ]),
    ).toBe("\n\nAttachments: brief.md");
  });
});