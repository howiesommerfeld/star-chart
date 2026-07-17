import { describe, it, expect } from "vitest";
import {
  qualifyingCount,
  plainMisses,
  grandRewardEarned,
  achievable,
  graceTokensUsed,
  checkpointEligible,
  type NightRecord,
} from "./rewards";

const night = (
  dayNo: number,
  status: "yes" | "no",
  graced = false,
): NightRecord => ({ dayNo, status, graced });

const yeses = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => night(from + i, "yes"));

describe("reward invariant (design doc D2)", () => {
  it("earns exactly at the X boundary", () => {
    expect(grandRewardEarned(yeses(18), 18)).toBe(true);
    expect(grandRewardEarned(yeses(17), 18)).toBe(false);
  });

  it("graced nights qualify toward X without being yes", () => {
    const nights = [...yeses(17), night(18, "no", true)];
    expect(qualifyingCount(nights)).toBe(18);
    expect(plainMisses(nights)).toBe(0); // graced ≠ plain miss
    expect(grandRewardEarned(nights, 18)).toBe(true);
  });

  it("plain misses never qualify", () => {
    const nights = [...yeses(17), night(18, "no", false)];
    expect(grandRewardEarned(nights, 18)).toBe(false);
  });

  it("worst-case forgiveness on defaults: 15 yes + 3 graced = earned at 18/21", () => {
    const nights = [
      ...yeses(15),
      night(16, "no", true),
      night(17, "no", true),
      night(18, "no", true),
      night(19, "no"),
      night(20, "no"),
      night(21, "no"),
    ];
    expect(grandRewardEarned(nights, 18)).toBe(true);
    expect(graceTokensUsed(nights)).toBe(3);
  });
});

describe("achievability (unlogged days count as potentially qualifying)", () => {
  it("an unlogged weekend never shows the summit as lost", () => {
    // Day 7 of 21, days 1-6 completely unlogged
    expect(achievable(21, [], 18)).toBe(true);
  });

  it("survives exactly the inherent miss budget (3 plain misses on 18/21)", () => {
    const nights = [night(1, "no"), night(2, "no"), night(3, "no")];
    expect(achievable(21, nights, 18)).toBe(true);
  });

  it("lost on the 4th plain miss", () => {
    const nights = [1, 2, 3, 4].map((d) => night(d, "no"));
    expect(achievable(21, nights, 18)).toBe(false);
  });

  it("graced nights do not consume the miss budget", () => {
    const nights = [
      night(1, "no", true),
      night(2, "no", true),
      night(3, "no", true),
      night(4, "no"),
      night(5, "no"),
      night(6, "no"),
    ];
    expect(achievable(21, nights, 18)).toBe(true); // 21-3 plain = 18 ≥ 18
    expect(achievable(21, [...nights, night(7, "no")], 18)).toBe(false);
  });

  it("other period lengths: 12/14 and 24/28 budgets", () => {
    expect(achievable(14, [night(1, "no"), night(2, "no")], 12)).toBe(true);
    expect(achievable(14, [1, 2, 3].map((d) => night(d, "no")), 12)).toBe(false);
    expect(achievable(28, [1, 2, 3, 4].map((d) => night(d, "no")), 24)).toBe(true);
    expect(achievable(28, [1, 2, 3, 4, 5].map((d) => night(d, "no")), 24)).toBe(false);
  });
});

describe("checkpoint eligibility", () => {
  it("not eligible before its day arrives", () => {
    expect(checkpointEligible(7, 6, 21, yeses(6), 18)).toBe(false);
  });

  it("eligible on its day while achievable", () => {
    expect(checkpointEligible(7, 7, 21, yeses(7), 18)).toBe(true);
  });

  it("retro-eligibility: still true on day 10 (monotonic grant at edit time)", () => {
    expect(checkpointEligible(7, 10, 21, yeses(10), 18)).toBe(true);
  });

  it("not eligible when the summit is lost", () => {
    const lost = [1, 2, 3, 4].map((d) => night(d, "no"));
    expect(checkpointEligible(7, 7, 21, lost, 18)).toBe(false);
  });
});
