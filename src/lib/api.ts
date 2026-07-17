import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  PARENT_COOKIE,
  SESSION_IDLE_MS,
  mintSession,
  verifySession,
} from "./session";
import { ConfirmError } from "@/db/confirm";
import { ActionError } from "@/db/actions";

export function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const ERROR_STATUS: Record<string, number> = {
  FUTURE_DAY: 400,
  INVALID_DAY: 400,
  INVALID_TILE: 400,
  NOT_CONFIRMED: 409,
  NOT_PLAYABLE: 409,
  NO_PEEKS: 409,
  NO_GRACE_TOKENS: 409,
  UNKNOWN_BEHAVIOUR: 400,
  NO_ACTIVE_PERIOD: 404,
};

/** Map domain errors to HTTP; anything else is a 500 with a safe body. */
export function handleDomainError(e: unknown): NextResponse {
  if (e instanceof ConfirmError || e instanceof ActionError) {
    return jsonError(e.code, e.message, ERROR_STATUS[e.code] ?? 400);
  }
  console.error(e);
  return jsonError("INTERNAL", "Something went wrong", 500);
}

/** Parent-route guard: valid session cookie required; slides the expiry. */
export async function requireParent(
  request: NextRequest,
): Promise<NextResponse | null> {
  const token = request.cookies.get(PARENT_COOKIE)?.value;
  if (!verifySession(token)) {
    return jsonError("PARENT_AUTH", "Parent session required", 401);
  }
  return null;
}

/** Attach a fresh (slid) session cookie to a response. */
export async function slideSession(response: NextResponse, familyToken: string) {
  response.cookies.set(PARENT_COOKIE, mintSession(), {
    httpOnly: true,
    sameSite: "lax",
    path: `/f/${familyToken}`,
    maxAge: Math.floor(SESSION_IDLE_MS / 1000),
  });
  return response;
}

export async function clearSession(response: NextResponse, familyToken: string) {
  response.cookies.set(PARENT_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: `/f/${familyToken}`,
    maxAge: 0,
  });
  return response;
}

// cookies import kept for route handlers that need the store directly
export { cookies };
