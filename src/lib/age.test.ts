import { describe, expect, it } from "vitest";
import { ageFromDob, isUnder } from "./age";

const day = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };

describe("ageFromDob — consent boundaries", () => {
  const dob = "2010-05-01";
  it("day before 16th birthday is 15", () => {
    expect(ageFromDob(dob, day("2026-04-30"))).toBe(15);
    expect(isUnder(dob, 16, day("2026-04-30"))).toBe(true);
  });
  it("16th birthday is 16", () => {
    expect(ageFromDob(dob, day("2026-05-01"))).toBe(16);
    expect(isUnder(dob, 16, day("2026-05-01"))).toBe(false);
  });
  it("day before 18th birthday is 17", () => {
    expect(ageFromDob(dob, day("2028-04-30"))).toBe(17);
    expect(isUnder(dob, 18, day("2028-04-30"))).toBe(true);
  });
  it("18th birthday is 18", () => {
    expect(ageFromDob(dob, day("2028-05-01"))).toBe(18);
    expect(isUnder(dob, 18, day("2028-05-01"))).toBe(false);
  });
  it("year-end birthday across new year", () => {
    expect(ageFromDob("2010-12-31", day("2028-12-30"))).toBe(17);
    expect(ageFromDob("2010-12-31", day("2028-12-31"))).toBe(18);
  });
  it("29 February birthday counts from 1 March in non-leap years", () => {
    expect(ageFromDob("2012-02-29", day("2028-02-28"))).toBe(15);
    expect(ageFromDob("2012-02-29", day("2028-02-29"))).toBe(16);
    expect(ageFromDob("2012-02-29", day("2030-02-28"))).toBe(17);
    expect(ageFromDob("2012-02-29", day("2030-03-01"))).toBe(18);
  });
  it("blank or invalid is null", () => {
    expect(ageFromDob(null)).toBeNull();
    expect(ageFromDob("")).toBeNull();
    expect(ageFromDob("not a date")).toBeNull();
    expect(isUnder(null, 18)).toBe(false);
  });
});
