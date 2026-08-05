import { describe, expect, it } from "vitest";
import {
  clampChainToCeiling,
  CODING_PRIMARY,
  CODING_SECONDARY,
  PREMIUM_MODELS,
  TIER_CHAINS,
} from "./model-tiers";
import { estimateCost, actionForMode } from "./credits";

describe("plan-aware routing", () => {
  it("keeps build routing limited to the two vetted engines", () => {
    expect(TIER_CHAINS.code).toEqual([CODING_PRIMARY, CODING_SECONDARY]);
    expect(TIER_CHAINS.fix).toEqual([CODING_PRIMARY, CODING_SECONDARY]);
    expect(TIER_CHAINS.code.some((model) => model.endsWith(":free"))).toBe(false);
  });


  it("premium ceiling keeps the full chain", () => {
    expect(clampChainToCeiling(TIER_CHAINS.code, "premium")[0]).toBe(CODING_PRIMARY);
  });

  it("free ceiling still returns a runnable model", () => {
    expect(clampChainToCeiling(TIER_CHAINS.code, "free").length).toBeGreaterThan(0);
  });
});

describe("credit rules", () => {
  it("charges coding more than chat", () => {
    expect(estimateCost("code")).toBeGreaterThan(estimateCost("chat"));
  });

  it("scales with input size", () => {
    expect(estimateCost("code", 4000)).toBeGreaterThan(estimateCost("code", 0));
  });

  it("maps composer modes to actions", () => {
    expect(actionForMode("Plan")).toBe("plan");
    expect(actionForMode("Chat")).toBe("chat");
    expect(actionForMode("Build")).toBe("code");
  });
});
