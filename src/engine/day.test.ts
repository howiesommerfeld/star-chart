import { describe, it, expect } from "vitest";
import { currentDayNo } from "./day";

// Period: first night Jul 17, Johannesburg (UTC+2, no DST), wake 05:00.
const config = {
  startsOn: "2026-07-17",
  lengthDays: 21,
  timezone: "Africa/Johannesburg",
  wakeHour: 5,
};

const at = (iso: string) => new Date(iso);

describe("currentDayNo (server-side day identity)", () => {
  it("is 0 during the first night — nothing unlocked yet", () => {
    expect(currentDayNo(config, at("2026-07-17T20:00:00+02:00"))).toBe(0);
  });

  it("stays 0 the next morning BEFORE wake hour", () => {
    expect(currentDayNo(config, at("2026-07-18T04:59:00+02:00"))).toBe(0);
  });

  it("becomes 1 exactly at wake hour the morning after night 1", () => {
    expect(currentDayNo(config, at("2026-07-18T05:00:00+02:00"))).toBe(1);
  });

  it("wake-hour boundary applies every day (day 2 at Jul 19 05:00)", () => {
    expect(currentDayNo(config, at("2026-07-19T04:59:00+02:00"))).toBe(1);
    expect(currentDayNo(config, at("2026-07-19T05:00:00+02:00"))).toBe(2);
  });

  it("computes in the FAMILY timezone, not UTC (03:00 UTC = 05:00 SAST)", () => {
    expect(currentDayNo(config, at("2026-07-18T03:00:00Z"))).toBe(1);
    expect(currentDayNo(config, at("2026-07-18T02:59:00Z"))).toBe(0);
  });

  it("clamps at lengthDays after the period ends", () => {
    expect(currentDayNo(config, at("2026-09-01T09:00:00+02:00"))).toBe(21);
  });

  it("clamps at 0 before the period starts", () => {
    expect(currentDayNo(config, at("2026-07-10T09:00:00+02:00"))).toBe(0);
  });
});
