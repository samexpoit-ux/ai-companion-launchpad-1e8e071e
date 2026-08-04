import { beforeEach, describe, expect, it } from "vitest";

import {
  clearRunTimeline,
  finishRun,
  getRun,
  mergeTimelineSteps,
  recordStep,
  recordedSteps,
  startRun,
} from "./run-timeline";

describe("run timeline", () => {
  beforeEach(() => clearRunTimeline());

  it("records every step of a run in order", () => {
    startRun({ runId: "run-1", threadId: "t1", title: "Build a dashboard" });
    recordStep("run-1", { kind: "prompt", label: "Understood the request" });
    recordStep("run-1", { kind: "route", label: "Selected the engine", ms: 12 });
    recordStep("run-1", { kind: "artifact", label: "Merged 2 artifacts", detail: "9 files" });

    const run = getRun("run-1");
    expect(run?.steps.map((s) => s.label)).toEqual([
      "Understood the request",
      "Selected the engine",
      "Merged 2 artifacts",
    ]);
    expect(recordedSteps("run-1")[1]?.detail).toBe("12ms");
    expect(recordedSteps("run-1")[2]?.detail).toBe("9 files");
  });

  it("links a finished run to the assistant message it produced", () => {
    startRun({ runId: "run-2" });
    recordStep("run-2", { kind: "delivery", label: "Generated the response" });
    finishRun("run-2", { messageId: "msg-42" });

    expect(getRun("msg-42")?.runId).toBe("run-2");
    expect(recordedSteps("msg-42")).toHaveLength(1);
    expect(getRun("run-2")?.endedAt).toBeTypeOf("number");
  });

  it("ignores steps for unknown runs and unknown lookups", () => {
    recordStep("missing", { kind: "error", label: "nope" });
    expect(getRun("missing")).toBeNull();
    expect(recordedSteps(undefined)).toEqual([]);
  });

  it("merges recorded steps ahead of derived ones without duplicates", () => {
    const merged = mergeTimelineSteps(
      [
        { label: "Understood the request", detail: "build workflow" },
        { label: "Validated the project", detail: "0 errors" },
      ],
      [
        { label: "Understood the request", detail: "build workflow" },
        { label: "Charged credits", detail: "1 credits" },
      ],
    );
    expect(merged.map((s) => s.label)).toEqual([
      "Understood the request",
      "Validated the project",
      "Charged credits",
    ]);
  });
});
