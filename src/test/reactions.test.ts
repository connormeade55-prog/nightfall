import { describe, expect, it } from "vitest";

import { summarizeReactions } from "@/lib/reactions";

const r = (message_id: string, user_id: string, emoji: string) => ({ message_id, user_id, emoji });

describe("summarizeReactions", () => {
  it("counts each person once per emoji", () => {
    const list = [r("m1", "a", "👍"), r("m1", "b", "👍"), r("m1", "a", "👍")];
    expect(summarizeReactions(list, "m1", "a")).toEqual([{ emoji: "👍", count: 2, mine: true }]);
  });
  it("only counts reactions on the given message", () => {
    const list = [r("m1", "a", "🔥"), r("m2", "b", "🔥")];
    expect(summarizeReactions(list, "m1", "z")).toEqual([{ emoji: "🔥", count: 1, mine: false }]);
  });
});

describe("summarizeReactions with any emoji", () => {
  it("counts emoji outside the quick list", () => {
    const list = [r("m1", "a", "🦄"), r("m1", "b", "🦄")];
    expect(summarizeReactions(list, "m1", "b")).toEqual([{ emoji: "🦄", count: 2, mine: true }]);
  });
});
