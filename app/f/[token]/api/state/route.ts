import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { buildState } from "@/db/state";
import { getNow } from "@/engine/day";
import { handleDomainError } from "@/lib/api";

export async function GET() {
  try {
    const state = await buildState(getDb(), getNow());
    return NextResponse.json(state);
  } catch (e) {
    return handleDomainError(e);
  }
}
