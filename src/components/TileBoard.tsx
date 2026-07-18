"use client";

import { useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { postFlip, postPeek, ApiError } from "@/lib/clientApi";
import type { DayView, KidState } from "@/lib/types";

/*
 * The daily tile board — the centrepiece. Flip UX (eng plan D5): the tap
 * starts the flip animation immediately; the server round-trip resolves
 * DURING the animation, so the value is there when the face shows. On
 * failure the tile flips back with a retry toast. One flip per board,
 * then the roads-not-taken reveal greys out everything else.
 *
 *   tap ──▶ rotate 0→90° ──▶ [server responds] ──▶ rotate 90→180° face up
 *                └── error ──▶ rotate back ──▶ toast
 */

type TileFace = { value: number | null; state: "covered" | "chosen" | "rest" };

/*
 * A gold coin with the value stamped on it. `spin` gives the chosen coin a
 * little celebratory wobble; `muted` greys the roads-not-taken.
 */
export function Coin({
  value,
  muted = false,
  spin = false,
}: {
  value: number;
  muted?: boolean;
  spin?: boolean;
}) {
  const rim = muted ? "#475569" : "#b45309";
  const face = muted ? "#64748b" : "#fbbf24";
  const inner = muted ? "#94a3b8" : "#fcd34d";
  const text = muted ? "#1e293b" : "#92400e";
  return (
    <motion.svg
      viewBox="0 0 64 64"
      className="h-[72%] w-[72%]"
      animate={
        spin
          ? { rotateY: [0, 360], scale: [1, 1.15, 1] }
          : undefined
      }
      transition={
        spin ? { duration: 0.9, delay: 0.1, ease: "easeOut" } : undefined
      }
    >
      <circle cx="32" cy="32" r="30" fill={rim} />
      <circle cx="32" cy="32" r="26.5" fill={face} />
      <circle cx="32" cy="32" r="21" fill={inner} />
      {/* gloss */}
      <ellipse cx="24" cy="20" rx="12" ry="7" fill="#ffffff" opacity={muted ? 0.15 : 0.35} />
      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={value >= 100 ? 20 : 24}
        fontWeight="800"
        fill={text}
      >
        {value}
      </text>
    </motion.svg>
  );
}

export function TileBoard({
  token,
  kid,
  day,
  onBanked,
}: {
  token: string;
  kid: KidState;
  day: DayView;
  onBanked: (points: number) => void;
}) {
  const played = day.state === "played";
  const playable = day.state === "playable";

  const [tiles, setTiles] = useState<TileFace[]>(() =>
    Array.from({ length: 16 }, (_, i) =>
      played
        ? {
            value: day.tiles![i],
            state: i === day.flippedIndex ? "chosen" : "rest",
          }
        : { value: null, state: "covered" },
    ),
  );
  const [flipping, setFlipping] = useState<number | null>(null);
  const [peekMode, setPeekMode] = useState(false);
  const [peeking, setPeeking] = useState<{ index: number; value: number } | null>(null);
  const [peeksLeft, setPeeksLeft] = useState(kid.peeks);
  const [toast, setToast] = useState<string | null>(null);
  const busy = useRef(false);
  // Boards that mount already-played render their faces statically — history
  // must never depend on the animation loop (backgrounded tabs, slow devices).
  const mountedPlayed = useMemo(() => played, // eslint-disable-line react-hooks/exhaustive-deps
    []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  async function handleTap(index: number) {
    if (!playable || busy.current || tiles[index].state !== "covered") return;

    if (peekMode) {
      busy.current = true;
      try {
        const res = await postPeek(token, kid.id, day.dayNo, index);
        setPeeksLeft(res.peeksLeft);
        setPeeking({ index, value: res.value });
        setTimeout(() => setPeeking(null), 2000); // flip-and-back (~2s per design)
      } catch (e) {
        showToast(e instanceof ApiError && e.code === "NO_PEEKS" ? "No peeks left!" : "Try again!");
      } finally {
        setPeekMode(false);
        busy.current = false;
      }
      return;
    }

    // THE flip
    busy.current = true;
    setFlipping(index);
    try {
      const res = await postFlip(token, kid.id, day.dayNo, index);
      // Reveal: chosen tile face-up, everything else follows staggered
      setTiles(
        res.tiles.map((v, i) => ({
          value: v,
          state: i === res.flippedIndex ? "chosen" : "rest",
        })),
      );
      confetti({
        particleCount: res.points >= 50 ? 160 : res.points >= 20 ? 90 : 45,
        spread: 75,
        origin: { y: 0.6 },
      });
      onBanked(res.points);
    } catch {
      setFlipping(null); // flip back
      showToast("📡 Try that flip again!");
      busy.current = false;
      return;
    }
    busy.current = false;
  }

  return (
    <div className="relative">
      {/* Peek control */}
      {playable && peeksLeft > 0 && (
        <button
          data-testid="peek-btn"
          onClick={() => setPeekMode((p) => !p)}
          className={`mb-3 w-full rounded-2xl px-4 py-3 text-sm font-bold transition active:scale-95 ${
            peekMode ? "bg-sky-400 text-night" : "bg-white/10 text-white"
          }`}
        >
          {peekMode
            ? "👁️ Now tap a tile for a sneaky look…"
            : `👁️ Sneak a peek (${peeksLeft} left)`}
        </button>
      )}

      <div className="grid grid-cols-4 gap-2.5" data-testid="board">
        {tiles.map((tile, i) => (
          <Tile
            key={i}
            tile={tile}
            color={kid.color}
            lifting={flipping === i && tile.state === "covered"}
            peekValue={peeking?.index === i ? peeking.value : null}
            covered={tile.state === "covered"}
            staticFace={mountedPlayed && tile.state !== "covered"}
            dimmed={
              day.state === "locked" ||
              day.state === "graced" ||
              day.state === "missed"
            }
            revealDelay={tile.state === "rest" && !played ? 0.4 + (i % 8) * 0.08 : 0}
            onTap={() => handleTap(i)}
          />
        ))}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            data-testid="flip-toast"
            className="absolute inset-x-0 -bottom-14 rounded-2xl bg-rose-500/95 px-4 py-2.5 text-center text-sm font-bold text-white"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Tile({
  tile,
  color,
  lifting,
  peekValue,
  covered,
  staticFace,
  dimmed,
  revealDelay,
  onTap,
}: {
  tile: TileFace;
  color: string;
  lifting: boolean;
  peekValue: number | null;
  covered: boolean;
  staticFace: boolean;
  dimmed: boolean;
  revealDelay: number;
  onTap: () => void;
}) {
  const showingFace = tile.state !== "covered" || peekValue !== null;
  const faceValue = peekValue ?? tile.value;

  if (staticFace) {
    return (
      <div
        className={`flex aspect-square items-center justify-center rounded-2xl ${
          tile.state === "chosen" ? "" : "bg-white/10"
        }`}
        style={tile.state === "chosen" ? { backgroundColor: color } : undefined}
      >
        {faceValue !== null && (
          <Coin value={faceValue} muted={tile.state !== "chosen"} />
        )}
      </div>
    );
  }

  return (
    <button
      data-covered={covered}
      onClick={onTap}
      disabled={!covered || dimmed}
      className="aspect-square [perspective:600px]"
    >
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        animate={{
          rotateY: showingFace ? 180 : lifting ? 90 : 0,
        }}
        transition={{
          duration: showingFace ? 0.45 : 0.35,
          delay: showingFace && tile.state === "rest" ? revealDelay : 0,
          ease: "easeInOut",
        }}
      >
        {/* Back (covered) */}
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-2xl text-2xl [backface-visibility:hidden] ${
            dimmed ? "bg-white/5 text-white/20" : "bg-white/15 text-white/70"
          }`}
        >
          {dimmed ? "🌙" : "⭐"}
        </div>
        {/* Face (value on a coin) */}
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-2xl [backface-visibility:hidden] [transform:rotateY(180deg)] ${
            tile.state === "chosen"
              ? ""
              : peekValue !== null
                ? "bg-sky-400"
                : "bg-white/10"
          }`}
          style={
            tile.state === "chosen" ? { backgroundColor: color } : undefined
          }
        >
          {faceValue !== null && (
            <Coin
              value={faceValue}
              muted={tile.state === "rest" && peekValue === null}
              spin={tile.state === "chosen"}
            />
          )}
        </div>
      </motion.div>
    </button>
  );
}
