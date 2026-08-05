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

  it("accepts dependencies declared by an exported project", async () => {
    const result = await validateProject({
      "package.json": JSON.stringify({ dependencies: { "react-toastify": "^11.0.0" } }),
      "src/App.tsx":
        "import { ToastContainer } from 'react-toastify'; export default function App(){ return <ToastContainer /> }",
    }, "src/App.tsx");

    expect(result.issues.filter((issue) => issue.level === "error")).toEqual([]);
  });

  it("still rejects undeclared external packages", async () => {
    const result = await validateProject({
      "src/App.tsx":
        "import { ToastContainer } from 'react-toastify'; export default function App(){ return <ToastContainer /> }",
    }, "src/App.tsx");

    expect(result.issues.some((issue) => issue.message.includes('Package "react-toastify"'))).toBe(true);
  });
});