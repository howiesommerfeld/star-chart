import { describe, it, expect } from "vitest";
import {
  mintSession,
  verifySession,
  verifyPin,
  SESSION_IDLE_MS,
} from "@/lib/session";

describe("parent session", () => {
  it("a fresh session verifies", () => {
    expect(verifySession(mintSession())).toBe(true);
  });

  it("expires after the 15-minute idle window", () => {
    const t0 = Date.now();
    const token = mintSession(t0);
    expect(verifySession(token, t0 + SESSION_IDLE_MS - 1000)).toBe(true);
    expect(verifySession(token, t0 + SESSION_IDLE_MS + 1000)).toBe(false);
  });

  it("rejects tampered tokens (kid edits the expiry)", () => {
    const token = mintSession();
    const [, sig] = token.split(".");
    const forged = `${Date.now() + 999_999_999}.${sig}`;
    expect(verifySession(forged)).toBe(false);
  });

  it("rejects garbage and empty tokens", () => {
    expect(verifySession(undefined)).toBe(false);
    expect(verifySession("")).toBe(false);
    expect(verifySession("not.a.token")).toBe(false);
  });
});

describe("verifyPin", () => {
  it("accepts the configured PIN and rejects others", () => {
    process.env.PARENT_PIN = "1234";
    expect(verifyPin("1234")).toBe(true);
    expect(verifyPin("0000")).toBe(false);
    expect(verifyPin("")).toBe(false);
    expect(verifyPin("12345")).toBe(false);
  });
});
