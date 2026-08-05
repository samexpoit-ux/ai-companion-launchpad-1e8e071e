import { describe, expect, it } from "vitest";

import { validateBuildDeliverySyntax } from "./build-delivery.server";

function artifact(path: string, source: string) {
  return `<nexusArtifact id="app" title="App"><nexusAction type="file" filePath="${path}">
${source}
</nexusAction></nexusArtifact>`;
}

function project(files: Record<string, string>) {
  return `<nexusArtifact id="app" title="App">${Object.entries(files)
    .map(([path, source]) => `<nexusAction type="file" filePath="${path}">\n${source}\n</nexusAction>`)
    .join("\n")}</nexusArtifact>`;
}

describe("generated build preflight", () => {
  it("accepts compilable TSX", () => {
    expect(
      validateBuildDeliverySyntax(
        artifact("src/App.tsx", "export default function App(){ return <main>Ready</main> }"),
      ),
    ).toEqual([]);
  });

  it("rejects an unterminated string before preview delivery", () => {
    const issues = validateBuildDeliverySyntax(
      artifact("src/pages/Shop.tsx", 'export const Shop = () => <input min="0 max="500" />'),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe("src/pages/Shop.tsx");
    expect(issues[0]?.message).toMatch(/Unterminated string|Unexpected token/i);
  });

  it("rejects missing local modules before preview delivery", () => {
    const issues = validateBuildDeliverySyntax(
      artifact("src/App.tsx", "import Shop from './pages/Shop'; export default function App(){ return <Shop /> }"),
    );
    expect(issues.some((issue) => issue.message.includes('Cannot resolve local import "./pages/Shop"'))).toBe(true);
  });

  it("rejects default/named export mismatches", () => {
    const issues = validateBuildDeliverySyntax(
      project({
        "src/App.tsx": "import Shop, { price } from './pages/Shop'; export default function App(){ return <Shop>{price}</Shop> }",
        "src/pages/Shop.tsx": "export function Shop(){ return <main>Shop</main> }",
      }),
    );
    expect(issues.map((issue) => issue.message)).toContain('"./pages/Shop" has no default export');
    expect(issues.map((issue) => issue.message)).toContain('"./pages/Shop" has no named export "price"');
  });

  it("rejects unavailable external packages", () => {
    const issues = validateBuildDeliverySyntax(
      artifact("src/App.tsx", "import { ToastContainer } from 'react-toastify'; export default function App(){ return <ToastContainer /> }"),
    );
    expect(issues.some((issue) => issue.message.includes('Package "react-toastify" is not available'))).toBe(true);
  });

  it("accepts a complete routed multi-file project", () => {
    expect(
      validateBuildDeliverySyntax(
        project({
          "src/App.tsx": "import Home from './pages/Home'; export default function App(){ return <Home /> }",
          "src/pages/Home.tsx": "export default function Home(){ return <main>Home</main> }",
        }),
      ),
    ).toEqual([]);
  });
});