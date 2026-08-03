import { describe, expect, it } from "vitest";
import { framerMotion } from "@/lib/preview-shims";

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
