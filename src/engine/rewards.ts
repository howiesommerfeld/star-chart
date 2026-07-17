/*
 * Reward math (design doc D2 — "implement exactly this").
 *
 *   night status ─┬─ yes ────────────────▶ qualifies
 *                 ├─ no + graced ─────────▶ qualifies (token spent)
 *                 ├─ no (plain) ──────────▶ consumes the inherent miss budget
 *                 └─ not-yet-logged ──────▶ counts as POTENTIALLY qualifying
 *                                           (unlogged weekend never kills the summit)
 *
 *   grand_reward_earned ⟺ count(yes) + count(graced) ≥ X
 *   achievable          ⟺ lengthDays − count(plain no) ≥ X
 */

export interface NightRecord {
  dayNo: number;
  status: "yes" | "no";
  graced: boolean;
}

export function qualifyingCount(nights: readonly NightRecord[]): number {
  return nights.filter((n) => n.status === "yes" || n.graced).length;
}

export function plainMisses(nights: readonly NightRecord[]): number {
  return nights.filter((n) => n.status === "no" && !n.graced).length;
}

export function grandRewardEarned(
  nights: readonly NightRecord[],
  xRequired: number,
): boolean {
  return qualifyingCount(nights) >= xRequired;
}

export function achievable(
  lengthDays: number,
  nights: readonly NightRecord[],
  xRequired: number,
): boolean {
  return lengthDays - plainMisses(nights) >= xRequired;
}

export function graceTokensUsed(nights: readonly NightRecord[]): number {
  return nights.filter((n) => n.graced).length;
}

/**
 * A checkpoint is eligible once its day has arrived and the grand reward is
 * still achievable. Grants are MONOTONIC: the caller (confirm transaction)
 * grants any eligible-but-ungranted checkpoint at edit time and never revokes
 * one — enforced by the unique ledger index, decided here.
 */
export function checkpointEligible(
  checkpointDay: number,
  currentDay: number,
  lengthDays: number,
  nights: readonly NightRecord[],
  xRequired: number,
): boolean {
  return currentDay >= checkpointDay && achievable(lengthDays, nights, xRequired);
}
