import { describe, expect, it } from "vitest";

import { checkAssetImports } from "./asset-check";

describe("asset import validation", () => {
  it("resolves local, aliased and missing asset imports", () => {
    const result = checkAssetImports({
      "src/App.tsx": `import logo from "./assets/logo.png";
import hero from "@/assets/hero.jpg";
import gone from "./assets/missing.svg";
import Home from "./pages/Home";`,
      "src/assets/logo.png": "data:image/png;base64,AAA",
      "src/assets/hero.jpg": "data:image/jpeg;base64,BBB",
      "src/pages/Home.tsx": "export default function Home(){ return null }",
    });

    expect(result.ok).toBe(false);
    expect(result.missing.map((m) => m.specifier)).toEqual(["./assets/missing.svg"]);
    expect(result.imports.filter((i) => i.status === "ok")).toHaveLength(2);
  });

  it("marks remote and data urls as external instead of missing", () => {
    const result = checkAssetImports({
      "src/styles.css": `body { background: url("https://cdn.example.com/bg.png"); }`,
    });
    expect(result.ok).toBe(true);
    expect(result.external).toHaveLength(1);
  });

  it("ignores non-asset module imports", () => {
    const result = checkAssetImports({
      "src/App.tsx": `import React from "react";\nimport { cn } from "@/lib/utils";`,
    });
    expect(result.imports).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
