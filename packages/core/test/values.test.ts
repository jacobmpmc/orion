import { describe, expect, it } from "vitest";
import { booleanOption, listOption, numberOption, stringOption } from "../src/index.js";
import type { OptionValues } from "../src/index.js";

// A host other than the CLI supplies these without coercing first, so each
// reader is exercised against the wrong type as well as the right one.
const values: OptionValues = {
  path: "./reports",
  blank: "   ",
  depth: 3,
  nan: Number.NaN,
  verbose: true,
  quiet: false,
  tags: ["a", "b"],
  mixed: ["a", 2, "c"] as unknown as readonly string[],
  one: "solo",
};

describe("stringOption", () => {
  it("reads a string", () => {
    expect(stringOption(values, "path")).toBe("./reports");
  });

  it("treats a blank string as absent", () => {
    expect(stringOption(values, "blank")).toBeUndefined();
  });

  it("ignores a value of the wrong type", () => {
    expect(stringOption(values, "depth")).toBeUndefined();
  });

  it("returns undefined for a missing option", () => {
    expect(stringOption(values, "nope")).toBeUndefined();
  });
});

describe("numberOption", () => {
  it("reads a number", () => {
    expect(numberOption(values, "depth")).toBe(3);
  });

  it("rejects NaN", () => {
    expect(numberOption(values, "nan")).toBeUndefined();
  });

  it("ignores a numeric string", () => {
    expect(numberOption(values, "path")).toBeUndefined();
  });
});

describe("booleanOption", () => {
  it("reads true and false alike", () => {
    expect(booleanOption(values, "verbose")).toBe(true);
    expect(booleanOption(values, "quiet")).toBe(false);
  });

  it("distinguishes an absent option from false", () => {
    expect(booleanOption(values, "nope")).toBeUndefined();
  });

  it("ignores a value of the wrong type", () => {
    expect(booleanOption(values, "path")).toBeUndefined();
  });
});

describe("listOption", () => {
  it("reads a list", () => {
    expect(listOption(values, "tags")).toEqual(["a", "b"]);
  });

  it("wraps a lone scalar, which is how a config file often supplies one", () => {
    expect(listOption(values, "one")).toEqual(["solo"]);
  });

  it("drops entries of the wrong type", () => {
    expect(listOption(values, "mixed")).toEqual(["a", "c"]);
  });

  it("returns an empty list for a missing option", () => {
    expect(listOption(values, "nope")).toEqual([]);
  });
});
