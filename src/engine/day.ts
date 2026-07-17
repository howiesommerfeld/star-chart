/*
 * Day identity (design doc Day Model): a "day" is the night just passed.
 * Night N happens the evening of startsOn+(N−1); its board unlocks the next
 * morning at wakeHour in the family timezone. The client clock is NEVER
 * consulted — API routes compute this server-side.
 *
 *   startsOn=Jul 17, wakeHour=5
 *   night 1: evening Jul 17 → board 1 unlocks Jul 18 05:00
 *   currentDayNo: 0 until Jul 18 05:00, then 1 until Jul 19 05:00, …
 */

export interface DayConfig {
  startsOn: string; // ISO date of the first night
  lengthDays: number;
  timezone: string; // IANA
  wakeHour: number;
}

/** E2E tests freeze time via STAR_CHART_FAKE_NOW (ISO datetime). */
export function getNow(): Date {
  const fake = process.env.STAR_CHART_FAKE_NOW;
  return fake ? new Date(fake) : new Date();
}

function tzParts(d: Date, timeZone: string): { ymd: string; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  );
  // Intl yields hour "24" for midnight in some environments; normalise.
  const hour = Number(parts.hour) % 24;
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, hour };
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

/**
 * Highest unlocked day number: 0 = no boards yet, clamped to lengthDays after
 * the period ends. Days 1..currentDayNo are confirmable/playable; anything
 * above is future (API rejects it).
 */
export function currentDayNo(config: DayConfig, now: Date = getNow()): number {
  const { ymd, hour } = tzParts(now, config.timezone);
  const sinceStart = daysBetween(config.startsOn, ymd);
  const unlocked = hour >= config.wakeHour ? sinceStart : sinceStart - 1;
  return Math.max(0, Math.min(config.lengthDays, unlocked));
}
