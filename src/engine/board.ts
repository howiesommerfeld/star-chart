import { createHmac } from "node:crypto";

/*
 * Deterministic board generation (design doc Day Model).
 *
 *   period.seed ──hmac──▶ per-(kid,day) key ──PRNG──▶ Fisher-Yates ──▶ tiles[]
 *
 * The prize multiset is IDENTICAL every day (that's the bank-game mechanic —
 * "prize placement shuffles every day"); only positions change. Same inputs
 * always produce the same board, so a board looks the same whether played on
 * time or retro-confirmed three days later.
 */

/** mulberry32: tiny deterministic PRNG, seeded from 4 hmac bytes. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateBoard(
  periodSeed: string,
  kidId: number,
  dayNo: number,
  tileValues: readonly number[],
): number[] {
  const digest = createHmac("sha256", periodSeed)
    .update(`kid:${kidId}:day:${dayNo}`)
    .digest();
  const rand = mulberry32(digest.readUInt32BE(0));

  const tiles = [...tileValues];
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}
