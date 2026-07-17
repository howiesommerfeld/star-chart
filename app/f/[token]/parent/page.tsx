"use client";

import { use, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  useAppState,
  postPin,
  postConfirm,
  endParentSession,
  ApiError,
} from "@/lib/clientApi";
import { LoadingStars } from "@/components/ErrorBanner";
import type { KidState } from "@/lib/types";

/*
 * Parent flow (design doc confirm flow):
 *   PIN ──▶ per-kid rows for today + any unlogged past days
 *        ──▶ tap a night ──▶ Yes / No (+grace prompt) + behaviour toggles ──▶ save
 * Retro-logging: any past day is editable from the day selector.
 * Session: 15-min idle server-side; "Done" ends it early.
 */

export default function ParentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { data, isLoading, mutate } = useAppState(token);
  const [authed, setAuthed] = useState(false);

  if (isLoading && !data) return <LoadingStars />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6 select-text">
      <div className="mb-5 flex items-center gap-3">
        <Link href={`/f/${token}`} className="text-2xl active:scale-90">
          ←
        </Link>
        <h1 className="text-xl font-extrabold">🔒 Grown-ups</h1>
        {authed && (
          <button
            onClick={async () => {
              await endParentSession(token).catch(() => {});
              setAuthed(false);
            }}
            className="ml-auto rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold"
          >
            Done
          </button>
        )}
      </div>

      {!authed ? (
        <PinPad token={token} onSuccess={() => setAuthed(true)} />
      ) : data?.period && data.kids ? (
        <ConfirmPanel
          token={token}
          kids={data.kids}
          behaviours={data.behaviours ?? []}
          today={data.period.today}
          lengthDays={data.period.lengthDays}
          onSaved={() => mutate()}
          onSessionExpired={() => setAuthed(false)}
        />
      ) : (
        <p className="text-white/70">No active period.</p>
      )}
    </main>
  );
}

function PinPad({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(0);

  async function submit(next: string) {
    setPin(next);
    if (next.length < 4) return;
    try {
      await postPin(token, next);
      onSuccess();
    } catch {
      setShake((s) => s + 1);
    }
    setPin("");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <motion.div
        key={shake}
        animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}}
        className="flex gap-3"
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full ${i < pin.length ? "bg-white" : "bg-white/20"}`}
          />
        ))}
      </motion.div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k) =>
          k === "" ? (
            <span key="pad" />
          ) : (
            <button
              key={k}
              onClick={() =>
                k === "⌫" ? setPin((p) => p.slice(0, -1)) : submit(pin + k)
              }
              className="h-16 w-16 rounded-full bg-white/10 text-2xl font-bold active:bg-white/25"
            >
              {k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function ConfirmPanel({
  token,
  kids,
  behaviours,
  today,
  lengthDays,
  onSaved,
  onSessionExpired,
}: {
  token: string;
  kids: KidState[];
  behaviours: { id: number; label: string; emoji: string }[];
  today: number;
  lengthDays: number;
  onSaved: () => void;
  onSessionExpired: () => void;
}) {
  const [editing, setEditing] = useState<{ kid: KidState; dayNo: number } | null>(null);
  const [showAllDays, setShowAllDays] = useState(false);

  if (today === 0)
    return (
      <p className="text-white/70">
        First morning is tomorrow — nothing to confirm yet. 🌙
      </p>
    );

  return (
    <div className="flex flex-col gap-6">
      {kids.map((kid) => {
        const pending = Array.from({ length: today }, (_, i) => i + 1).filter(
          (d) => !kid.nightStatuses[d],
        );
        return (
          <section key={kid.id}>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold">
              <span>{kid.avatar}</span> {kid.name}
              <span className="ml-auto text-xs font-semibold text-white/50">
                🛟 {kid.graceLeft} left
              </span>
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-white/50">All nights confirmed ✓</p>
            ) : (
              <div className="flex flex-col gap-2">
                {pending.map((dayNo) => (
                  <button
                    key={dayNo}
                    onClick={() => setEditing({ kid, dayNo })}
                    className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-left font-semibold active:scale-[0.98]"
                  >
                    <span>
                      Night {dayNo}
                      {dayNo === today && " (last night)"}
                    </span>
                    <span className="text-white/50">confirm →</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <button
        onClick={() => setShowAllDays((s) => !s)}
        className="text-left text-sm font-semibold text-white/50"
      >
        {showAllDays ? "▾ Hide" : "▸ Edit any past night"}
      </button>
      {showAllDays && (
        <div className="flex flex-col gap-4">
          {kids.map((kid) => (
            <div key={kid.id}>
              <p className="mb-1 text-sm font-bold">
                {kid.avatar} {kid.name}
              </p>
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: Math.min(today, lengthDays) }, (_, i) => i + 1).map(
                  (dayNo) => {
                    const st = kid.nightStatuses[dayNo];
                    return (
                      <button
                        key={dayNo}
                        onClick={() => setEditing({ kid, dayNo })}
                        className={`rounded-lg py-2 text-xs font-bold ${
                          !st
                            ? "bg-white/10 text-white/60"
                            : st.status === "yes"
                              ? "bg-emerald-500/70"
                              : st.graced
                                ? "bg-sky-500/60"
                                : "bg-rose-500/60"
                        }`}
                      >
                        {dayNo}
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <ConfirmSheet
            token={token}
            kid={editing.kid}
            dayNo={editing.dayNo}
            behaviours={behaviours}
            onClose={() => setEditing(null)}
            onSaved={onSaved}
            onSessionExpired={onSessionExpired}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ConfirmSheet({
  token,
  kid,
  dayNo,
  behaviours,
  onClose,
  onSaved,
  onSessionExpired,
}: {
  token: string;
  kid: KidState;
  dayNo: number;
  behaviours: { id: number; label: string; emoji: string }[];
  onClose: () => void;
  onSaved: () => void;
  onSessionExpired: () => void;
}) {
  const existing = kid.nightStatuses[dayNo];
  const [status, setStatus] = useState<"yes" | "no" | null>(
    existing?.status ?? null,
  );
  const [grace, setGrace] = useState(existing?.graced ?? false);
  const [selected, setSelected] = useState<number[]>(
    kid.behaviourDays[dayNo] ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!status) return;
    setSaving(true);
    setError(null);
    try {
      await postConfirm(token, {
        kidId: kid.id,
        dayNo,
        status,
        grace: status === "no" ? grace : undefined,
        behaviourIds: selected,
      });
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        onSessionExpired();
      } else if (e instanceof ApiError && e.code === "NO_GRACE_TOKENS") {
        setError("No grace tokens left for this period.");
      } else {
        setError("Couldn't save — try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-end bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", bounce: 0.15 }}
        className="w-full rounded-t-3xl bg-night-soft p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-extrabold">
          {kid.avatar} {kid.name} — night {dayNo}
        </h3>
        <p className="mb-3 font-semibold">
          Did {kid.name} sleep in their own bed?
        </p>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => setStatus("yes")}
            className={`rounded-2xl py-4 text-lg font-extrabold ${
              status === "yes" ? "bg-emerald-500" : "bg-white/10"
            }`}
          >
            ✅ Yes
          </button>
          <button
            onClick={() => setStatus("no")}
            className={`rounded-2xl py-4 text-lg font-extrabold ${
              status === "no" ? "bg-rose-500" : "bg-white/10"
            }`}
          >
            ❌ No
          </button>
        </div>

        {status === "no" && (
          <button
            onClick={() => setGrace((g) => !g)}
            disabled={!grace && kid.graceLeft === 0}
            className={`mb-4 flex w-full items-center justify-between rounded-2xl px-4 py-3 font-bold ${
              grace ? "bg-sky-500" : "bg-white/10"
            } disabled:opacity-40`}
          >
            <span>🛟 Use a grace token?</span>
            <span className="text-sm font-semibold">
              {grace ? "Yes — night still counts" : `${kid.graceLeft} left`}
            </span>
          </button>
        )}

        <p className="mb-2 text-sm font-semibold text-white/70">
          Bonus behaviours (each earns a peek 👁️)
        </p>
        <div className="mb-5 flex flex-col gap-2">
          {behaviours.map((b) => (
            <button
              key={b.id}
              onClick={() =>
                setSelected((s) =>
                  s.includes(b.id) ? s.filter((x) => x !== b.id) : [...s, b.id],
                )
              }
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left font-semibold ${
                selected.includes(b.id) ? "bg-amber-400 text-night" : "bg-white/10"
              }`}
            >
              <span className="text-xl">{b.emoji}</span> {b.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="mb-3 text-sm font-bold text-rose-300">{error}</p>
        )}

        <button
          onClick={save}
          disabled={!status || saving}
          className="w-full rounded-2xl bg-white py-4 text-lg font-extrabold text-night disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </motion.div>
    </motion.div>
  );
}
