"use client";

import { use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAppState } from "@/lib/clientApi";
import { ErrorBanner, LoadingStars } from "@/components/ErrorBanner";
import { Celebrations } from "@/components/Celebration";
import type { DayView } from "@/lib/types";

/*
 * Journey screen — the hub (design doc D6). The calendar IS the streak:
 * played days show points, 🛟 grace, 🎁 checkpoints, today glows, ? unlogged,
 * 🏆 on the final day. Tap any day to open its board.
 */
export default function JourneyPage({
  params,
}: {
  params: Promise<{ token: string; kidId: string }>;
}) {
  const { token, kidId } = use(params);
  const { data, error, isLoading, mutate } = useAppState(token);

  if (isLoading && !data) return <LoadingStars />;
  const kid = data?.kids?.find((k) => k.id === Number(kidId));
  const period = data?.period;
  if (!kid || !period)
    return (
      <main className="flex min-h-dvh items-center justify-center">
        {error ? <ErrorBanner retry={() => mutate()} /> : <span>🌙</span>}
      </main>
    );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
      {error && <ErrorBanner retry={() => mutate()} />}
      <Celebrations kid={kid} period={period} />

      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Link href={`/f/${token}`} className="text-2xl active:scale-90">
          ←
        </Link>
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full text-3xl"
          style={{ backgroundColor: `${kid.color}33` }}
        >
          {kid.avatar}
        </span>
        <span className="text-2xl font-extrabold">{kid.name}</span>
        <span className="ml-auto rounded-2xl bg-white/10 px-3 py-1.5 font-bold">
          ⭐ {kid.points}
        </span>
      </div>

      {/* Progress toward the grand reward */}
      <div className="mb-1 flex items-center justify-between text-sm font-semibold">
        <span>
          🌟 {kid.qualifying} of {period.xRequired} nights
        </span>
        <span className="flex gap-1">
          {Array.from({ length: kid.graceLeft }).map((_, i) => (
            <span key={i}>🛟</span>
          ))}
          {Array.from({ length: kid.peeks }).map((_, i) => (
            <span key={i}>👁️</span>
          ))}
        </span>
      </div>
      <div className="mb-1 h-3 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: kid.achievable ? kid.color : "#64748b" }}
          initial={{ width: 0 }}
          animate={{
            width: `${Math.min(100, (kid.qualifying / period.xRequired) * 100)}%`,
          }}
          transition={{ type: "spring", bounce: 0.2 }}
        />
      </div>
      <p className="mb-5 text-xs text-white/60">
        {kid.grandRewardEarned
          ? `🏆 ${period.grandReward} — EARNED!`
          : kid.achievable
            ? `🏆 ${period.grandReward}`
            : `Keep flipping for stars! ⭐`}
      </p>

      {/* The day grid */}
      <div className="grid grid-cols-4 gap-2.5">
        {kid.days.map((day) => (
          <DayTile
            key={day.dayNo}
            day={day}
            token={token}
            kidId={kid.id}
            color={kid.color}
            finalDay={period.lengthDays}
            achievable={kid.achievable}
          />
        ))}
      </div>
    </main>
  );
}

function DayTile({
  day,
  token,
  kidId,
  color,
  finalDay,
  achievable,
}: {
  day: DayView;
  token: string;
  kidId: number;
  color: string;
  finalDay: number;
  achievable: boolean;
}) {
  const base =
    "relative flex aspect-square flex-col items-center justify-center rounded-2xl text-sm font-bold transition active:scale-95";

  let look = "";
  let content: React.ReactNode;
  switch (day.state) {
    case "played":
      look = "text-white";
      content = (
        <>
          <span className="text-xs opacity-80">{day.dayNo}</span>
          <span className="text-base">+{day.pointsWon}</span>
        </>
      );
      break;
    case "playable":
      look = "bg-amber-400/90 text-night";
      content = (
        <>
          <span className="text-xs">{day.dayNo}</span>
          <motion.span
            className="text-xl"
            animate={{ scale: [1, 1.3, 1], rotate: [0, 8, -8, 0] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
          >
            ⭐
          </motion.span>
        </>
      );
      break;
    case "graced":
      look = "bg-white/15 text-white/80";
      content = (
        <>
          <span className="text-xs">{day.dayNo}</span>
          <span className="text-lg">🛟</span>
        </>
      );
      break;
    case "missed":
      look = "bg-white/5 text-white/50";
      content = (
        <>
          <span className="text-xs">{day.dayNo}</span>
          <span className="text-lg">🌙</span>
        </>
      );
      break;
    case "locked":
      look = "bg-white/10 text-white/70 border-2 border-dashed border-white/30";
      content = (
        <>
          <span className="text-xs">{day.dayNo}</span>
          <span className="text-lg">❔</span>
        </>
      );
      break;
    case "future":
      look = "bg-white/5 text-white/30";
      content = (
        <>
          <span className="text-xs">{day.dayNo}</span>
          {day.dayNo === finalDay && (
            <span className={achievable ? "text-lg" : "text-lg opacity-30"}>
              🏆
            </span>
          )}
          {day.checkpoint && <span className="text-sm">🎁</span>}
        </>
      );
      break;
  }

  const tile = (
    <div
      data-testid={`day-${day.dayNo}`}
      data-state={day.state}
      className={`${base} ${look}`}
      style={
        day.state === "played"
          ? { backgroundColor: `${color}cc` }
          : day.isToday
            ? { boxShadow: "0 0 0 3px #fbbf24" }
            : undefined
      }
    >
      {content}
      {day.checkpoint && day.state !== "future" && (
        <span className="absolute -right-1 -top-1 text-sm">🎁</span>
      )}
    </div>
  );

  // Future days aren't tappable; everything else opens the day's board.
  if (day.state === "future") return tile;
  return (
    <Link href={`/f/${token}/kids/${kidId}/days/${day.dayNo}`}>{tile}</Link>
  );
}
