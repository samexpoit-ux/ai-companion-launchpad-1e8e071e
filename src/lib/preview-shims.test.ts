import { describe, expect, it } from "vitest";
import { framerMotion, previewRouter } from "./preview-shims";

describe("preview router state", () => {
  it("returns to home when a project or version is reset", () => {
    previewRouter.navigate("/admin");
    expect(previewRouter.getPath()).toBe("/admin");
    previewRouter.reset();
    expect(previewRouter.getPath()).toBe("/");
  });
});

describe("framer-motion preview shim", () => {
  it("exposes the hooks generated projects actually import", () => {
    for (const name of [
      "useScroll",
      "useTransform",
      "useMotionValue",
      "useSpring",
      "useMotionTemplate",
      "useMotionValueEvent",
      "useAnimate",
      "useInView",
      "useReducedMotion",
      "useCycle",
      "animate",
      "stagger",
    ]) {
      expect(typeof framerMotion[name], name).toBe("function");
    }
    expect(framerMotion.AnimatePresence).toBeTruthy();
    expect((framerMotion.motion as Record<string, unknown>).div).toBeTruthy();
  });

  it("never returns undefined for an unmodelled export", () => {
    expect(typeof framerMotion.someFutureHook).toBe("function");
  });
});
