# ⭐ Star Chart

A bedtime reward game for three kids, on the family's phones. One flip per
confirmed night on a 4×4 mystery-tile board; points bank forever; an N-of-M
night count earns the grand reward. Design doc and engineering plan live in
`~/.gstack/projects/howiesommerfeld-star-chart/`.

## Stack

Next.js (App Router) on Vercel · Turso (libSQL/SQLite) + Drizzle · Framer
Motion · Vitest + Playwright. Everything interesting lives in:

- `src/engine/` — pure game logic: deterministic boards, the reward invariant,
  day identity. No I/O, 100% unit-tested.
- `src/db/` — schema, the one confirm transaction, flip/peek actions, state
  assembly. The `ledger` table is **append-only**: every balance is Σ(deltas).
- `app/f/[token]/` — all pages AND api routes live under the family token;
  `middleware.ts` 404s everything else.

## Dev

```bash
cp .env.example .env.local   # defaults work out of the box
npm install
npm run db:migrate           # creates file:local.db (+ pre-migration backup)
npm run db:seed              # EDIT scripts/seed.ts first: kid names/avatars/colours
npm run dev                  # http://localhost:3000/f/dev  (PIN 1234)
```

Tests: `npm test` (engine + db, 64 tests) · `npm run test:e2e` (6 Playwright
flows against a frozen-clock fixture) · `npm run lint`.

## Deploy runbook (one-time, ~15 min)

1. **Turso**: `turso db create star-chart` in the region nearest home
   (`turso db locations`), then `turso db show star-chart --url` and
   `turso db tokens create star-chart`.
2. **Migrate + seed prod**:
   `TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:migrate && ... npm run db:seed`
3. **Vercel**: import the GitHub repo. Set env vars: `TURSO_DATABASE_URL`,
   `TURSO_AUTH_TOKEN`, `FAMILY_TOKEN` (`openssl rand -hex 16`), `PARENT_PIN`,
   `SESSION_SECRET` (`openssl rand -hex 32`). Function region: nearest
   available on your plan (cpt1 is Pro-only; else fra1/lhr1).
4. Open `https://<app>.vercel.app/f/<FAMILY_TOKEN>` on both parents' phones →
   Share → **Add to Home Screen**. Done: auto-deploys on every push to `main`.

## Operating the game

- **Morning check-in**: 🔒 grown-ups → PIN → confirm each kid's night
  (yes/no, grace token on a no, behaviour toggles for peeks). Retro-logging:
  "Edit any past night".
- **Day 22**: `npm run db:new-period` (optionally `SEED_GRAND_REWARD=...`,
  `SEED_LENGTH=14|21|28`). Points carry; grace and boards reset.
- **Config changes** (tile economy, X, tokens): edit the next period's values
  in `scripts/new-period.ts` env overrides or SQL on the `periods` row —
  config is snapshotted per period and never changes mid-period.

## Rules the code enforces (from the design doc)

- `grand_reward_earned ⟺ count(confirmed-yes) + count(graced) ≥ X` (18/21 default)
- Achievable ⟺ `length − plain_misses ≥ X`; unlogged days never kill the summit.
- Banked points are NEVER removed; retro-edits only recompute eligibility forward.
- Checkpoint grants are monotonic (unique ledger events, granted at edit time).
- Boards are `hmac(period_seed, kid, day)`-deterministic; same prize multiset
  every day, positions shuffle.
