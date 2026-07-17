"use client";

import useSWR from "swr";
import type { AppState, FlipResult, PeekResult } from "./types";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("NETWORK", "Can't reach the star chart", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? "Something went wrong",
      res.status,
    );
  }
  return body as T;
}

const base = (token: string) => `/f/${token}/api`;

export function useAppState(token: string) {
  return useSWR<AppState>(
    `${base(token)}/state`,
    (url: string) => request<AppState>(url),
    { refreshInterval: 30_000, revalidateOnFocus: true },
  );
}

export function postFlip(token: string, kidId: number, dayNo: number, tileIndex: number) {
  return request<FlipResult>(`${base(token)}/kids/${kidId}/days/${dayNo}/flip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tileIndex }),
  });
}

export function postPeek(token: string, kidId: number, dayNo: number, tileIndex: number) {
  return request<PeekResult>(`${base(token)}/kids/${kidId}/days/${dayNo}/peek`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tileIndex }),
  });
}

export function postPin(token: string, pin: string) {
  return request<{ ok: true }>(`${base(token)}/parent/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
}

export function endParentSession(token: string) {
  return request<{ ok: true }>(`${base(token)}/parent/session`, { method: "DELETE" });
}

export interface ConfirmPayload {
  kidId: number;
  dayNo: number;
  status: "yes" | "no";
  grace?: boolean;
  behaviourIds?: number[];
}

export function postConfirm(token: string, payload: ConfirmPayload) {
  return request<{ granted: { checkpoints: number[]; grandReward: boolean } }>(
    `${base(token)}/parent/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}
