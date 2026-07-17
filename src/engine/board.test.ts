import { describe, it, expect } from "vitest";
import { generateBoard } from "./board";

const TILES = [50, 20, 20, 20, 10, 10, 10, 10, 5, 5, 5, 5, 5, 5, 5, 5];
const SEED = "test-seed-abc";

describe("generateBoard", () => {
  it("is deterministic: same (seed, kid, day) always yields the same board", () => {
    const a = generateBoard(SEED, 1, 3, TILES);
    const b = generateBoard(SEED, 1, 3, TILES);
    expect(a).toEqual(b);
  });

  it("is a permutation of the configured multiset (no values invented or lost)", () => {
    const board = generateBoard(SEED, 2, 7, TILES);
    expect([...board].sort((x, y) => x - y)).toEqual(
      [...TILES].sort((x, y) => x - y),
    );
  });

  it("differs across days for the same kid (prize placement shuffles daily)", () => {
    const boards = new Set(
      Array.from({ length: 21 }, (_, i) =>
        generateBoard(SEED, 1, i + 1, TILES).join(","),
      ),
    );
    // 16! arrangements; 21 draws colliding would indicate a broken PRNG
    expect(boards.size).toBeGreaterThan(18);
  });

  it("differs across kids for the same day (no copying your sibling's peek)", () => {
    const k1 = generateBoard(SEED, 1, 5, TILES);
    const k2 = generateBoard(SEED, 2, 5, TILES);
    const k3 = generateBoard(SEED, 3, 5, TILES);
    expect(new Set([k1.join(","), k2.join(","), k3.join(",")]).size).toBe(3);
  });

  it("differs across period seeds (a new period reshuffles everything)", () => {
    const a = generateBoard("seed-period-1", 1, 1, TILES);
    const b = generateBoard("seed-period-2", 1, 1, TILES);
    expect(a.join(",")).not.toBe(b.join(","));
  });

  it("does not mutate the input multiset", () => {
    const input = [...TILES];
    generateBoard(SEED, 1, 1, input);
    expect(input).toEqual(TILES);
  });
});
