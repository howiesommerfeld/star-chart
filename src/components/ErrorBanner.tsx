"use client";

export function ErrorBanner({ retry }: { retry: () => void }) {
  return (
    <div className="fixed inset-x-3 top-3 z-50 flex items-center justify-between rounded-2xl bg-rose-500/95 px-4 py-3 text-white shadow-lg">
      <span className="text-sm font-semibold">
        📡 Can&apos;t reach the star chart
      </span>
      <button
        onClick={retry}
        className="rounded-xl bg-white/25 px-3 py-1.5 text-sm font-bold active:scale-95"
      >
        Try again
      </button>
    </div>
  );
}

export function LoadingStars() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <span className="animate-pulse text-5xl">✨</span>
    </main>
  );
}
