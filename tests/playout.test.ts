import { describe, expect, it } from "vitest";

import {
  adDelivery,
  adShortfallCount,
  playoutMinutes,
  playoutShare,
  playoutTotals,
} from "@/lib/playout";

const s = (start: number, end: number, kind: "music" | "ad" | "talk" | string) => ({
  start,
  end,
  kind,
});

describe("playoutTotals", () => {
  it("sums minutes per kind", () => {
    expect(
      playoutTotals([s(0, 3, "music"), s(3, 5, "ad"), s(5, 15, "talk"), s(15, 19, "music")]),
    ).toEqual({ music: 7, ad: 2, talk: 10 });
  });

  it("starts at zero when nothing is logged", () => {
    expect(playoutTotals([])).toEqual({ music: 0, ad: 0, talk: 0 });
    expect(playoutTotals(null)).toEqual({ music: 0, ad: 0, talk: 0 });
    expect(playoutTotals(undefined)).toEqual({ music: 0, ad: 0, talk: 0 });
  });

  it("ignores unknown kinds instead of inventing a bucket", () => {
    expect(playoutTotals([s(0, 60, "sponsorship")])).toEqual({ music: 0, ad: 0, talk: 0 });
  });

  it("never counts a backwards segment as negative airtime", () => {
    expect(playoutTotals([s(100, 90, "music")])).toEqual({ music: 0, ad: 0, talk: 0 });
  });

  it("does not mutate its input", () => {
    const input = [s(30, 33, "music"), s(0, 10, "ad")];
    const snapshot = JSON.stringify(input);
    playoutTotals(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("playoutShare", () => {
  it("returns whole percentages that sum to about 100", () => {
    const share = playoutShare({ music: 660, ad: 220, talk: 120 });
    expect(share.music).toBe(66);
    expect(share.ad).toBe(22);
    expect(share.talk).toBe(12);
    expect(share.music + share.ad + share.talk).toBe(100);
  });

  it("reports 0% for an empty day instead of dividing by zero", () => {
    expect(playoutShare({ music: 0, ad: 0, talk: 0 })).toEqual({ music: 0, ad: 0, talk: 0 });
    for (const v of Object.values(playoutShare(playoutTotals([]))))
      expect(Number.isFinite(v)).toBe(true);
  });

  it("handles a music-only day", () => {
    expect(playoutShare({ music: 1440, ad: 0, talk: 0 })).toEqual({ music: 100, ad: 0, talk: 0 });
  });

  it("total minutes feed straight into the share", () => {
    const totals = playoutTotals([s(0, 60, "music"), s(60, 240, "talk")]);
    expect(playoutMinutes(totals)).toBe(240);
    expect(playoutShare(totals)).toEqual({ music: 25, ad: 0, talk: 75 });
  });
});

describe("adDelivery", () => {
  it("marks a fully delivered booking", () => {
    expect(adDelivery({ booked: 12, aired: 12 })).toEqual({
      status: "delivered",
      delta: 0,
      label: "Delivered",
    });
  });

  it("flags a shortfall with the make-good note", () => {
    const v = adDelivery({ booked: 12, aired: 9 });
    expect(v.status).toBe("short");
    expect(v.delta).toBe(-3);
    expect(v.label).toBe("3 short · make-good due");
  });

  it("flags over-delivery as extra", () => {
    const v = adDelivery({ booked: 10, aired: 13 });
    expect(v.status).toBe("extra");
    expect(v.label).toBe("3 extra");
  });

  it("treats a missing or junk line as delivered-at-zero, not as a crash", () => {
    expect(adDelivery(null)).toEqual({ status: "delivered", delta: 0, label: "Delivered" });
    expect(adDelivery(undefined).status).toBe("delivered");
    expect(adDelivery({ booked: NaN, aired: "12" as never }).status).toBe("extra");
  });
});

describe("adShortfallCount", () => {
  it("counts only under-delivered lines", () => {
    expect(
      adShortfallCount([
        { booked: 10, aired: 10 },
        { booked: 10, aired: 7 },
        { booked: 10, aired: 12 },
        { booked: 4, aired: 3 },
      ]),
    ).toBe(2);
  });

  it("is zero for a clean book or no ads", () => {
    expect(adShortfallCount([{ booked: 3, aired: 3 }])).toBe(0);
    expect(adShortfallCount([])).toBe(0);
    expect(adShortfallCount(null)).toBe(0);
  });
});
