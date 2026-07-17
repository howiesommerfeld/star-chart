import { NextRequest, NextResponse } from "next/server";
import { verifyPin } from "@/lib/session";
import { jsonError, slideSession, clearSession } from "@/lib/api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  let pin: unknown;
  try {
    ({ pin } = await request.json());
  } catch {
    return jsonError("BAD_BODY", "Expected JSON body with pin", 400);
  }
  if (typeof pin !== "string" || !verifyPin(pin)) {
    return jsonError("BAD_PIN", "Wrong PIN", 401);
  }
  return slideSession(NextResponse.json({ ok: true }), token);
}

/** The parent "done" button — ends the session early (eng plan D7). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return clearSession(NextResponse.json({ ok: true }), token);
}
