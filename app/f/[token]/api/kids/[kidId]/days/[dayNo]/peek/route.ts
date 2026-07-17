import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { spendPeek } from "@/db/actions";
import { getNow } from "@/engine/day";
import { handleDomainError, jsonError } from "@/lib/api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kidId: string; dayNo: string }> },
) {
  const { kidId, dayNo } = await params;
  let tileIndex: unknown;
  try {
    ({ tileIndex } = await request.json());
  } catch {
    return jsonError("BAD_BODY", "Expected JSON body with tileIndex", 400);
  }
  if (typeof tileIndex !== "number" || !Number.isInteger(tileIndex)) {
    return jsonError("BAD_BODY", "tileIndex must be an integer", 400);
  }
  try {
    const result = await spendPeek(
      getDb(),
      { kidId: Number(kidId), dayNo: Number(dayNo), tileIndex },
      getNow(),
    );
    return NextResponse.json(result);
  } catch (e) {
    return handleDomainError(e);
  }
}
