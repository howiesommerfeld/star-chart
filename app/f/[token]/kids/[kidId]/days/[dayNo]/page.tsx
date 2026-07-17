"use client";

import { use, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAppState } from "@/lib/clientApi";
import { ErrorBanner, LoadingStars } from "@/components/ErrorBanner";
import { TileBoard } from "@/components/TileBoard";

/* One day's board: live flip for playable days, as-played history otherwise. */
export default function BoardPage({
  params,
}: {
  params: Promise<{ token: string; kidId: string; dayNo: string }>;
}) {
  const { token, kidId, dayNo } = use(params);
  const { data, error, isLoading, mutate } = useAppState(token);
  const [justBanked, setJustBanked] = useState<number | null>(null);
  // Optimistic points shown between the flip and the state refetch; cleared
  // once the server total (which then includes the flip) arrives — otherwise
  // the chip would double-count.
  const [pendingPoints, setPendingPoints] = useState(0);

  if (isLoading && !data) return <LoadingStars />;
  const kid = data?.kids?.find((k) => k.id === Number(kidId));
  const day = kid?.days.find((d) => d.dayNo === Number(dayNo));
  if (!kid || !day || !data?.period)
    return (
      <main className="flex min-h-dvh items-center justify-center">
        {error ? <ErrorBanner retry={() => mutate()} /> : <span>🌙</span>}
      </main>
    );

  const headline = {
    playable: "You slept in your bed! Tap a tile! 🎉",
    played: justBanked !== null ? `+${justBanked} banked! 🎊` : "What you won that day",
    locked: "Ask a grown-up to check this night ❔",
    graced: "Rescue night — no worries 🛟",
    missed: "A sleepy miss — tomorrow's a new star 🌙",
    future: "Not yet!",
  }[day.state];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
      {error && <ErrorBanner retry={() => mutate()} />}

      <div className="mb-5 flex items-center gap-3">
        <Link
          href={`/f/${token}/kids/${kid.id}`}
          className="text-2xl active:scale-90"
        >
          ←
        </Link>
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full text-2xl"
          style={{ backgroundColor: `${kid.color}33` }}
        >
          {kid.avatar}
        </span>
        <span className="text-lg font-extrabold">Day {day.dayNo}</span>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={kid.points + pendingPoints}
            data-testid="points"
            initial={{ scale: 1.4, color: "#fbbf24" }}
            animate={{ scale: 1, color: "#ffffff" }}
            className="ml-auto rounded-2xl bg-white/10 px-3 py-1.5 font-bold"
          >
            ⭐ {kid.points + pendingPoints}
          </motion.span>
        </AnimatePresence>
      </div>

      <motion.p
        key={headline}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 text-center text-lg font-bold"
      >
        {headline}
      </motion.p>

      <TileBoard
        token={token}
        kid={kid}
        day={day}
        onBanked={(points) => {
          setJustBanked(points); // headline keeps celebrating
          setPendingPoints(points); // chip shows it immediately…
          setTimeout(async () => {
            await mutate(); // …server total now includes the flip
            setPendingPoints(0); // stop counting it twice
          }, 1200);
        }}
      />

      {day.state === "played" && (
        <p className="mt-4 text-center text-xs text-white/50">
          The bright tile is the one {kid.name} picked ✨
        </p>
      )}
    </main>
  );
}
