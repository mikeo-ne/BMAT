import { describe, expect, it } from "vitest";

import {
  checkIsrc,
  generateIsrc,
  isValidIsrc,
  normaliseIsrc,
  padDesignation,
  parseIsrc,
  registrantCode,
  twoDigitYear,
} from "@/lib/isrc";

describe("registrantCode", () => {
  it("uses the leading letter of the first three words", () => {
    expect(registrantCode("Nyege Nyege Tapes")).toBe("NNT");
  });

  it("falls back to the first three characters for a single word", () => {
    expect(registrantCode("Kadogo")).toBe("KAD");
  });

  it("pads short names with X", () => {
    expect(registrantCode("Ab")).toBe("ABX");
  });

  it("returns the BMAT placeholder block when nothing is supplied", () => {
    expect(registrantCode()).toBe("BMT");
    expect(registrantCode("")).toBe("BMT");
    expect(registrantCode("   ")).toBe("BMT");
  });

  it("is deterministic", () => {
    expect(registrantCode("Ray Bwete")).toBe(registrantCode("ray bwete"));
  });
});

describe("twoDigitYear", () => {
  it("reduces a four digit year", () => {
    expect(twoDigitYear(2026)).toBe("26");
  });

  it("pads and accepts two digit input", () => {
    expect(twoDigitYear(6)).toBe("06");
    expect(twoDigitYear(26)).toBe("26");
  });
});

describe("padDesignation", () => {
  it("left pads to five digits", () => {
    expect(padDesignation(1)).toBe("00001");
    expect(padDesignation(412)).toBe("00412");
  });

  it("clamps to the valid range", () => {
    expect(padDesignation(0)).toBe("00001");
    expect(padDesignation(-5)).toBe("00001");
    expect(padDesignation(1_000_000)).toBe("99999");
  });
});

describe("generateIsrc", () => {
  it("produces a canonical Ugandan ISRC", () => {
    expect(generateIsrc({ registrant: "Nyege Nyege Tapes", year: 2026, designation: 7 })).toBe(
      "UG-NNT-26-00007",
    );
  });

  it("takes the year block from the release year", () => {
    const isrc = generateIsrc({ registrant: "Ray Bwete", year: 2031, designation: 1 });
    expect(parseIsrc(isrc)?.year).toBe("31");
  });

  it("always yields a code that validates", () => {
    const isrc = generateIsrc({ registrant: "Kasese Sound System", year: 2026, designation: 42 });
    expect(isValidIsrc(isrc)).toBe(true);
    expect(parseIsrc(isrc)).toEqual({
      country: "UG",
      registrant: "KSS",
      year: "26",
      designation: "00042",
    });
  });
});

describe("isValidIsrc / normaliseIsrc", () => {
  it.each([
    "UG-BMT-26-00001",
    "UGBMT2600001",
    " ug-bmt-26-00001 ",
    "GB-ABC-99-12345",
  ])("accepts %s", (value) => {
    expect(isValidIsrc(value)).toBe(true);
  });

  it.each([
    "",
    "UG-BMT-26-0001", // designation too short
    "UG-BM-26-00001", // registrant too short
    "U-BMT-26-00001", // country too short
    "UG-BMT-2A-00001", // non-numeric year
    "not-an-isrc",
  ])("rejects %s", (value) => {
    expect(isValidIsrc(value)).toBe(false);
  });

  it("normalises to the hyphenated form", () => {
    expect(normaliseIsrc("ugbmt2600001")).toBe("UG-BMT-26-00001");
    expect(normaliseIsrc("nope")).toBeNull();
  });
});

describe("checkIsrc", () => {
  it("explains what to do when the field is empty", () => {
    const result = checkIsrc("");
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/Generate/);
  });

  it("accepts a Ugandan code", () => {
    const result = checkIsrc("UG-NNY-26-00004");
    expect(result.valid).toBe(true);
    expect(result.canonical).toBe("UG-NNY-26-00004");
  });

  it("flags a valid code registered in another country", () => {
    const result = checkIsrc("GB-ABC-99-12345");
    expect(result.valid).toBe(true);
    expect(result.message).toMatch(/outside Uganda/);
  });

  it("rejects a malformed code with the expected shape", () => {
    const result = checkIsrc("UG-NNY-26-0004");
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/CC-XXX-YY-NNNNN/);
  });
});
