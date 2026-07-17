/* Client-side mirror of the /api/state payload (src/db/state.ts). */

export type BoardState =
  | "future"
  | "locked"
  | "playable"
  | "played"
  | "graced"
  | "missed";

export interface DayView {
  dayNo: number;
  state: BoardState;
  isToday: boolean;
  checkpoint: boolean;
  tiles?: number[];
  flippedIndex?: number;
  pointsWon?: number;
}

export interface KidState {
  id: number;
  name: string;
  avatar: string;
  color: string;
  points: number;
  periodPoints: number;
  peeks: number;
  qualifying: number;
  plainMisses: number;
  achievable: boolean;
  graceUsed: number;
  graceLeft: number;
  checkpointsGranted: (number | null)[];
  grandRewardEarned: boolean;
  grandRewardEarnedAt: string | null;
  days: DayView[];
  nightStatuses: Record<number, { status: "yes" | "no"; graced: boolean }>;
  behaviourDays: Record<number, number[]>;
}

export interface Behaviour {
  id: number;
  label: string;
  emoji: string;
  active: boolean;
}

export interface PeriodInfo {
  id: number;
  number: number;
  lengthDays: number;
  xRequired: number;
  graceTokens: number;
  checkpointDays: number[];
  grandReward: string;
  peekCap: number;
  today: number;
  status: string;
}

export interface AppState {
  period: PeriodInfo | null;
  behaviours?: Behaviour[];
  kids?: KidState[];
}

export interface FlipResult {
  alreadyFlipped: boolean;
  flippedIndex: number;
  points: number;
  tiles: number[];
}

export interface PeekResult {
  tileIndex: number;
  value: number;
  peeksLeft: number;
}
