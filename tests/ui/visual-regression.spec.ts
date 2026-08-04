import { test, expect } from "@playwright/test";

import { installMockBackend, openWorkspace, openLiveWorkspace } from "./fixtures/mock-backend";

/**
 * Visual regression for the preview surface.
 *
 * Baselines live in tests/ui/__snapshots__ — re-baseline deliberately with
 * `bun run test:visual:update` after an intentional design change. Any
 * unintentional break in the preview chrome, the address bar, the code view or
 * the diagnostics panel fails here before it reaches a user.
 */
const PROJECT = `<nexusArtifact id="visual-baseline" title="Visual Baseline Site">
<nexusAction type="file" filePath="src/App.tsx">import Home from './pages/Home';
export default function App(){ return <Home /> }</nexusAction>
<nexusAction type="file" filePath="src/pages/Home.tsx">export default function Home(){
  return (
    <main style={{ fontFamily: 'system-ui', padding: 32 }}>
      <h1 style={{ margin: 0 }}>Visual Baseline Home</h1>
      <p>Stable content used for screenshot comparison.</p>
    </main>
  );
}</nexusAction>
</nexusArtifact>`;

test.beforeEach(async ({ page }) => {
  await installMockBackend(page, {
    content: PROJECT,
    model: "ui-test/mock-model",
    tokens: 64,
    latencyMs: 10,
    credits: { charged: 1, remaining: 456, total: 500, used: 44, plan: "pro" },
  });
});

async function buildPreview(page: import("@playwright/test").Page) {
  await openWorkspace(page);
  await openLiveWorkspace(page);
  const composer = page.getByPlaceholder("Ask Nexura to build something…");
  await composer.fill("Build the visual baseline site");
  const send = page.getByRole("button", { name: "Send message" });
  await expect(send).toBeEnabled();
  await send.click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await expect(frame.getByRole("heading", { name: "Visual Baseline Home" })).toBeVisible({
    timeout: 20_000,
  });
  return frame;
}

test.describe("Preview visual regression", () => {
  test("preview stage matches the saved baseline", async ({ page }) => {
    await buildPreview(page);
    const stage = page.getByTestId("workspace-stage");
    await expect(stage).toHaveScreenshot("preview-stage.png");
  });

  test("code view matches the saved baseline", async ({ page }) => {
    await buildPreview(page);
    await page.getByRole("button", { name: "Code" }).click();
    const stage = page.getByTestId("workspace-stage");
    await expect(stage.getByText("Home.tsx").first()).toBeVisible();
    await expect(stage).toHaveScreenshot("preview-code.png");
  });

  test("diagnostics panel matches the saved baseline", async ({ page }) => {
    await buildPreview(page);
    await page.getByRole("button", { name: "Diagnostics" }).click();
    const diagnostics = page.getByTestId("preview-diagnostics");
    await expect(diagnostics).toBeVisible();
    await expect(diagnostics.getByText("Build status")).toBeVisible();
    // Wait for the async lint/build pass to settle so the shot is stable.
    await expect(diagnostics.getByText(/clean|error/).first()).toBeVisible({ timeout: 20_000 });
    await expect(diagnostics).toHaveScreenshot("preview-diagnostics.png");
  });

  test("diagnostics reports build status, assets, console and bug report actions", async ({
    page,
  }) => {
    await buildPreview(page);
    await page.getByRole("button", { name: "Diagnostics" }).click();
    const diagnostics = page.getByTestId("preview-diagnostics");
    await expect(diagnostics.getByText("Asset imports")).toBeVisible();
    await expect(diagnostics.getByText("Console errors")).toBeVisible();
    await expect(diagnostics.getByText("Auto-fix attempts")).toBeVisible();
    await expect(page.getByTestId("bug-report-copy")).toBeVisible();
    await expect(page.getByTestId("bug-report-download")).toBeVisible();
  });
});
