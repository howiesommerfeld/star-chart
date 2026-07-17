import { request, type APIRequestContext } from "@playwright/test";

const BASE = "http://localhost:3100/f/e2e";

/** Parent API context with a live PIN session (for test setup, not UI flows). */
export async function parentApi(): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: BASE });
  const res = await ctx.post(`${BASE}/api/parent/session`, {
    data: { pin: "1234" },
  });
  if (!res.ok()) throw new Error(`PIN login failed: ${res.status()}`);
  return ctx;
}

export async function apiConfirm(
  ctx: APIRequestContext,
  payload: {
    kidId: number;
    dayNo: number;
    status: "yes" | "no";
    grace?: boolean;
    behaviourIds?: number[];
  },
) {
  const res = await ctx.post(`${BASE}/api/parent/confirm`, { data: payload });
  if (!res.ok())
    throw new Error(`confirm failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

export const kidUrl = (kidId: number, dayNo?: number) =>
  dayNo ? `/f/e2e/kids/${kidId}/days/${dayNo}` : `/f/e2e/kids/${kidId}`;
