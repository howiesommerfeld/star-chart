"use client";

import { use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAppState } from "@/lib/clientApi";
import { ErrorBanner, LoadingStars } from "@/components/ErrorBanner";
import { KidAvatar } from "@/components/KidAvatar";

/* Entry screen: tap your face. No reading required. */
export default function EntryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { data, error, isLoading, mutate } = useAppState(token);

  if (isLoading && !data) return <LoadingStars />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      {error && !data && <ErrorBanner retry={() => mutate()} />}
      <h1 className="mb-8 text-center text-3xl font-extrabold tracking-tight">
        ⭐ Star Chart
      </h1>

      <div className="flex flex-1 flex-col justify-center gap-5">
        {data?.kids?.map((kid, i) => {
          const flipWaiting = kid.days.some(
            (d) => d.state === "playable",
          );
          return (
            <motion.div
              key={kid.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.12, type: "spring", bounce: 0.4 }}
            >
              <Link
                href={`/f/${token}/kids/${kid.id}`}
                className="flex items-center gap-4 rounded-3xl bg-white/10 p-4 backdrop-blur transition active:scale-[0.97]"
                style={{ boxShadow: `inset 0 0 0 3px ${kid.color}` }}
              >
                <span
                  className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full text-5xl"
                  style={{ backgroundColor: `${kid.color}33` }}
                >
                  <KidAvatar avatar={kid.avatar} />
                </span>
                <span className="flex flex-col">
                  <span className="text-2xl font-extrabold">{kid.name}</span>
                  <span className="text-sm text-white/70">
                    ⭐ {kid.points} · night {Math.min((data.period?.today ?? 0) + 1, data.period?.lengthDays ?? 0)} of{" "}
                    {data.period?.lengthDays}
                  </span>
                </span>
                {flipWaiting && (
                  <motion.span
                    className="ml-auto text-3xl"
                    animate={{ scale: [1, 1.25, 1] }}
                    transition={{ repeat: Infinity, duration: 1.4 }}
                  >
                    🎁
                  </motion.span>
                )}
              </Link>
            </motion.div>
          );
        })}

        {data && !data.period && (
          <p className="text-center text-white/70">
            No game running — a grown-up needs to start one. 🌙
          </p>
        )}
      </div>

      <Link
        href={`/f/${token}/parent`}
        className="mt-8 text-center text-sm text-white/40"
      >
        🔒 grown-ups
      </Link>
    </main>
  );
}
