# TODOS

Deferred work with context. Each item was explicitly deferred during review — not forgotten.

## 1. Parent settings/config UI
- **What:** In-app UI (behind the PIN gate) to edit period config: grid size, tile economy, X-of-M threshold, grace-token frequency, behaviours list, checkpoint bonus, grand reward.
- **Why:** Removes the need to edit the seeded config row via script/SQL between periods.
- **Pros:** Tune the economy without a laptop; safer than hand-run SQL.
- **Cons:** A whole admin surface for an audience of one household.
- **Context:** Deferred at /plan-eng-review D2 (2026-07-17) to hit MVP ASAP. Config lives as a snapshot row in `periods`; `scripts/seed.ts` + `scripts/new-period.ts` are the current editing path. Start with the period-creation form — it's where config changes take effect anyway (config is snapshotted per period).
- **Depends on:** MVP shipped; `scripts/new-period.ts` exists (T12).

## 2. Period-restart UI (in-app)
- **What:** In-app "start new period" flow behind the parent gate: completion/celebration state → choose length/reward → new period with fresh boards.
- **Why:** Day-22 restart currently requires running `scripts/new-period.ts` from a machine.
- **Pros:** Restart from a phone at the breakfast table.
- **Cons:** Duplicates what the CLI script already does.
- **Context:** The CLI script ships in the MVP (D8, codex tension 1). This TODO is only the UI wrapper. Natural to build together with TODO 1 (same form).
- **Depends on:** TODO 1 (shares the config form).

## 3. Visual design system pass
- **What:** Run `/design-consultation` against the live app: typography, colour system, motion language, age-scaled presentation (3yo icon-first vs 7yo numbers).
- **Why:** Design doc defers age-scaling to this pass; MVP ships with built-in delight (flip animation, celebrations) but no formal system.
- **Pros:** Design decisions made against real screens and real kid reactions, not wireframes.
- **Cons:** First-period kids see pre-system visuals.
- **Context:** Kept deferred at D10 (2026-07-17) against a codex challenge — rationale: T6/T8 already budget craft; kids' reactions during period 1 are the design review input.
- **Depends on:** MVP live; ideally 1+ week of real use.

## 4. Nightly automated DB backup
- **What:** Scheduled export of the Turso DB (dated dump to a private repo or local disk) via GitHub Actions cron or launchd.
- **Why:** The settings UI is deferred, so config edits happen via hand-run SQL — human error is the realistic data-loss vector, and Turso durability doesn't cover it. Design doc promises "zero data loss" for a full period.
- **Pros:** Caps any mistake at one day of family history; ~20 lines.
- **Cons:** One more scheduled job to own.
- **Context:** Accepted at D11 (2026-07-17). MVP already includes pre-migration dumps (D7); this is the standing version. `turso db shell <db> .dump > backup-$(date).sql` piped from a cron is the whole job.
- **Depends on:** T10 (Turso provisioned).
