import { describe, expect, it } from "vitest";

import { validateBuildDeliverySyntax } from "./build-delivery.server";

function artifact(path: string, source: string) {
  return `<nexusArtifact id="app" title="App"><nexusAction type="file" filePath="${path}">
${source}
</nexusAction></nexusArtifact>`;
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
});