import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { confirmNight } from "@/db/confirm";
import { getNow } from "@/engine/day";
import { handleDomainError, jsonError, requireParent, slideSession } from "@/lib/api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const denied = await requireParent(request);
  if (denied) return denied;
  const { token } = await params;

  let body: {
    kidId?: unknown;
    dayNo?: unknown;
    status?: unknown;
    grace?: unknown;
    behaviourIds?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("BAD_BODY", "Expected JSON body", 400);
  }

  const { kidId, dayNo, status, grace, behaviourIds } = body;
  if (
    typeof kidId !== "number" ||
    typeof dayNo !== "number" ||
    (status !== "yes" && status !== "no") ||
    (grace !== undefined && typeof grace !== "boolean") ||
    (behaviourIds !== undefined &&
      (!Array.isArray(behaviourIds) ||
        behaviourIds.some((b) => typeof b !== "number")))
  ) {
    return jsonError("BAD_BODY", "Invalid confirm payload", 400);
  }

  try {
    const result = await confirmNight(
      getDb(),
      {
        kidId,
        dayNo,
        status,
        grace: grace as boolean | undefined,
        behaviourIds: behaviourIds as number[] | undefined,
      },
      getNow(),
    );
    // Sliding idle expiry: activity keeps the parent session alive.
    return slideSession(NextResponse.json(result), token);
  } catch (e) {
    return handleDomainError(e);
  }
}
