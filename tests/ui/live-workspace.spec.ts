import { test, expect, type Page } from "@playwright/test";
import { installMockBackend, openWorkspace, openLiveWorkspace } from "./fixtures/mock-backend";

/**
 * Live Workspace (right-hand preview pane) visual + layout regression suite.
 * Runs fully offline against mocked backend content, so tab and viewport
 * switching is verified on every run — desktop and mobile.
 */
test.beforeEach(async ({ page }) => {
  await installMockBackend(page);
});

async function box(page: Page, locator: ReturnType<Page["getByTestId"]>) {
  const b = await locator.boundingBox();
  expect(b, "element should be laid out").not.toBeNull();
  return b!;
}

test.describe("Live Workspace", () => {
  test("loading /admin never overwrites the / home page", async ({ page }) => {
    await openWorkspace(page);
    await openLiveWorkspace(page);

    const composer = page.getByTestId("composer").getByRole("textbox");
    const fullProject = `<nexusArtifact id="route-safe-site" title="Route Safe Site">
<nexusAction type="file" filePath="src/App.tsx">import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Admin from './pages/Admin';
export default function App(){ return <BrowserRouter><Routes><Route path="/" element={<Home />} /><Route path="/admin" element={<Admin />} /></Routes></BrowserRouter> }</nexusAction>
<nexusAction type="file" filePath="src/pages/Home.tsx">export default function Home(){ return <main><h1>Permanent Home Page</h1><p>Public website remains intact.</p></main> }</nexusAction>
<nexusAction type="file" filePath="src/pages/Admin.tsx">export default function Admin(){ return <main><h1>Private Admin Dashboard</h1><p>Admin route is isolated.</p></main> }</nexusAction>
</nexusArtifact>`;

    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: fullProject,
          model: "ui-test/mock-model",
          tokens: 128,
          latencyMs: 10,
          credits: { charged: 1, remaining: 456, total: 500, used: 44, plan: "pro" },
        }),
      }),
    );

    await composer.fill("Add an admin dashboard as a separate route");
    await page.getByRole("button", { name: "Send message" }).click();
    const frame = page.frameLocator('iframe[title="Live preview"]');
    await expect(frame.getByRole("heading", { name: "Permanent Home Page" })).toBeVisible({
      timeout: 20_000,
    });

    const path = page.getByLabel("Preview path");
    await path.fill("/admin");
    await path.press("Enter");
    await expect(frame.getByRole("heading", { name: "Private Admin Dashboard" })).toBeVisible({
      timeout: 20_000,
    });

    await path.fill("/");
    await path.press("Enter");
    await expect(frame.getByRole("heading", { name: "Permanent Home Page" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(frame.getByRole("heading", { name: "Private Admin Dashboard" })).toHaveCount(0);
    await expect(page.getByText(/Build failed/i)).toHaveCount(0);
  });

  test("header, tabs and stage match the baseline", async ({ page }) => {
    await openWorkspace(page);
    await openLiveWorkspace(page);
    await expect(page.getByTestId("live-workspace")).toHaveScreenshot("live-workspace-preview.png");
  });

  test("switches between Preview, Code and Console tabs", async ({ page }) => {
    await openWorkspace(page);
    await openLiveWorkspace(page);

    for (const tab of ["Code", "Console", "Preview"] as const) {
      const btn = page.getByRole("button", { name: new RegExp(`^${tab}$`, "i") }).first();
      await btn.dispatchEvent("click");
      await expect(btn).toHaveAttribute("aria-pressed", "true");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("workspace-stage")).toHaveScreenshot(
        `live-workspace-tab-${tab.toLowerCase()}.png`,
      );
    }
  });

  test("viewport toggles resize the stage without clipping", async ({ page }) => {
    await openWorkspace(page);
    await openLiveWorkspace(page);

    const panel = await box(page, page.getByTestId("live-workspace"));
    for (const device of ["Tablet", "Mobile", "Desktop"] as const) {
      const btn = page.getByRole("button", { name: new RegExp(`^${device} viewport$`, "i") }).first();
      if (!(await btn.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: /workspace options/i }).click();
        await page.getByRole("button", { name: new RegExp(`^${device} viewport$`, "i") }).first().click();
        await page.keyboard.press("Escape");
      } else {
        await btn.click();
      }
      await page.waitForTimeout(250);

      const stage = await box(page, page.getByTestId("workspace-stage"));
      expect(stage.x).toBeGreaterThanOrEqual(panel.x - 1);
      expect(stage.x + stage.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
    }
  });
});

test.describe("Live Workspace on mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("header never wraps and controls stay inside the panel", async ({ page }) => {
    await openWorkspace(page);
    await openLiveWorkspace(page);

    const panel = await box(page, page.getByTestId("live-workspace"));
    const viewport = page.viewportSize()!;
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width + 1);

    for (const name of ["Preview", "Code", "Console", "Reload preview", "Workspace options"]) {
      const el = page.getByRole("button", { name: new RegExp(`^${name}$`, "i") }).first();
      if (!(await el.isVisible().catch(() => false))) continue;
      const b = await el.boundingBox();
      expect(b, `${name} laid out`).not.toBeNull();
      expect(b!.x + b!.width, `${name} inside panel`).toBeLessThanOrEqual(panel.x + panel.width + 1);
      expect(b!.y, `${name} inside header row`).toBeGreaterThanOrEqual(panel.y - 1);
    }

    await expect(page.getByTestId("live-workspace")).toHaveScreenshot("live-workspace-mobile.png");
  });

  test("mobile viewport switching works from the overflow menu", async ({ page }) => {
    await openWorkspace(page);
    await openLiveWorkspace(page);

    await page.getByRole("button", { name: /workspace options/i }).click();
    const mobileBtn = page.getByRole("button", { name: /^mobile viewport$/i }).first();
    await expect(mobileBtn).toBeVisible();
    await mobileBtn.click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    await expect(page.getByTestId("workspace-stage")).toBeVisible();
  });
});
