"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import type { KidState, PeriodInfo } from "@/lib/types";

/*
 * Celebration moments (eng plan T8). The server's ledger events are the
 * source of truth (checkpoint rows, the unique grand_reward event); this
 * component fires each celebration ONCE PER DEVICE via a localStorage ack —
 * a second device celebrating again is a feature, not a bug (eng plan D7).
 */

type Overlay =
  | { kind: "checkpoint"; day: number }
  | { kind: "grand"; reward: string };

const ackKey = (kidId: number, periodId: number, what: string) =>
  `sc-ack-${periodId}-${kidId}-${what}`;

export function Celebrations({
  kid,
  period,
}: {
  kid: KidState;
  period: PeriodInfo;
}) {
  const [overlay, setOverlay] = useState<Overlay | null>(null);

  useEffect(() => {
    // Grand reward outranks checkpoints if both are pending.
    if (
      kid.grandRewardEarned &&
      !localStorage.getItem(ackKey(kid.id, period.id, "grand"))
    ) {
      localStorage.setItem(ackKey(kid.id, period.id, "grand"), "1");
      setOverlay({ kind: "grand", reward: period.grandReward });
      const burst = () =>
        confetti({ particleCount: 120, spread: 100, origin: { y: 0.5 } });
      burst();
      const t1 = setTimeout(burst, 600);
      const t2 = setTimeout(burst, 1300);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    for (const cp of kid.checkpointsGranted) {
      if (cp == null) continue;
      if (!localStorage.getItem(ackKey(kid.id, period.id, `cp-${cp}`))) {
        localStorage.setItem(ackKey(kid.id, period.id, `cp-${cp}`), "1");
        setOverlay({ kind: "checkpoint", day: cp });
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.55 } });
        break;
      }
    }
  }, [kid, period]);

  return (
    <AnimatePresence>
      {overlay && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid={`celebration-${overlay.kind}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-night/85 p-8"
          onClick={() => setOverlay(null)}
        >
          <motion.div
            initial={{ scale: 0.5, rotate: -6 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", bounce: 0.55 }}
            className="flex flex-col items-center gap-4 rounded-3xl bg-white/10 p-8 text-center backdrop-blur"
          >
            {overlay.kind === "grand" ? (
              <>
                <motion.span
                  className="text-7xl"
                  animate={{ scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 1.6 }}
                >
                  🏆
                </motion.span>
                <span className="text-2xl font-extrabold">
                  {kid.name} DID IT!
                </span>
                <span className="text-lg font-bold text-amber-300">
                  {overlay.reward}
                </span>
              </>
            ) : (
              <>
                <motion.span
                  className="text-6xl"
                  animate={{ y: [0, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 0.9 }}
                >
                  🎁
                </motion.span>
                <span className="text-xl font-extrabold">
                  Day {overlay.day} checkpoint!
                </span>
                <span className="font-bold text-amber-300">
                  Bonus stars & a peek! ⭐👁️
                </span>
              </>
            )}
            <span className="mt-2 text-xs text-white/50">tap anywhere</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
