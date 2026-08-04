import { describe, expect, it } from "vitest";
import { REAL_MODULES } from "./preview-externals";
import { validateProject } from "./validate";

describe("preview dependency validation", () => {
  it("accepts every package that the preview runtime can resolve", async () => {
    const imports = Object.keys(REAL_MODULES)
      .map((id, index) => `import * as module${index} from ${JSON.stringify(id)};`)
      .join("\n");
    const result = await validateProject(
      {
        "src/App.tsx": `${imports}\nexport default function App(){ return <main>Ready</main> }`,
      },
      "src/App.tsx",
    );

    const unavailable = result.issues.filter((issue) =>
      issue.message.includes("is not available in the live preview"),
    );
    expect(unavailable).toEqual([]);
  });
});