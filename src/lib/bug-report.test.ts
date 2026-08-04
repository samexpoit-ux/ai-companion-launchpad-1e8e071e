import { describe, expect, it } from "vitest";

import {
  bugReportDigest,
  bugReportFilename,
  buildBugReport,
  pathsFromMessages,
  replayUrl,
} from "./bug-report";

const files = {
  "src/App.tsx": "export default function App(){ return <Home /> }",
  "src/pages/Home.tsx": `${"// home\n".repeat(10)}export default function Home(){ return <h1>Hi</h1> }`,
};

describe("bug reports", () => {
  it("captures thread, preview route, console and failing artifact context", () => {
    const report = buildBugReport({
      threadId: "af63c2ef-41f2-49f5-97c0-cca01103e117",
      threadTitle: "Premium admin dashboard",
      prompts: ["build a dashboard", "add an admin route"],
      previewRoute: "/admin",
      previewTab: "preview",
      device: "desktop",
      revision: 4,
      entry: "src/App.tsx",
      files,
      buildError: "src/pages/Home.tsx: Unexpected token (12:3)",
      runtimeErrors: ["TypeError: x is not a function"],
      consoleEntries: [{ level: "error", message: "boom" }],
      fixLog: [{ attempt: 1, summary: "patched Home.tsx", ok: false, at: 1_700_000_000_000 }],
      fixStatus: "exhausted",
      validation: { ok: false, errors: 1, warnings: 2 },
      appUrl: "https://nexuraai.dev",
    });

    expect(report.thread.id).toBe("af63c2ef-41f2-49f5-97c0-cca01103e117");
    expect(report.preview.route).toBe("/admin");
    expect(report.preview.fileCount).toBe(2);
    expect(report.failure.runtimeErrors).toHaveLength(1);
    expect(report.failure.fixLog[0]?.at).toBe(new Date(1_700_000_000_000).toISOString());
    expect(report.console).toEqual([{ level: "error", message: "boom" }]);
    expect(report.artifactContext.map((f) => f.path)).toEqual(["src/pages/Home.tsx"]);
    expect(report.replayUrl).toBe(
      "https://nexuraai.dev/workspace?thread=af63c2ef-41f2-49f5-97c0-cca01103e117&route=%2Fadmin",
    );
  });

  it("falls back to the entry file when no path is named in the failure", () => {
    const report = buildBugReport({ files, entry: "src/App.tsx", buildError: "Build failed" });
    expect(report.artifactContext.map((f) => f.path)).toEqual(["src/App.tsx"]);
    expect(report.replayUrl).toBeNull();
  });

  it("names the download file after the thread and timestamp", () => {
    const report = buildBugReport({ threadId: "abcdef123456", files });
    expect(bugReportFilename(report)).toMatch(/^nexura-bug-abcdef12-.*\.json$/);
    expect(bugReportDigest(report)).toContain("Nexura bug report");
  });

  it("finds suspect files from error text", () => {
    expect(
      pathsFromMessages(["oops in src/App.tsx line 2"], ["src/App.tsx", "src/pages/Home.tsx"]),
    ).toEqual(["src/App.tsx"]);
  });

  it("keeps the replay url on the default route clean", () => {
    expect(replayUrl({ threadId: "t1", previewRoute: "/" })).toBe("/workspace?thread=t1");
  });
});
