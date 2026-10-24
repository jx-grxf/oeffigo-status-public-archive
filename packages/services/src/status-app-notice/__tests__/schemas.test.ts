import { expect } from "@std/expect";
import { describe, test } from "@std/testing/bdd";

import { UpsertStatusAppNoticeInput, parseRegions } from "../index";

describe("status app notice input", () => {
  test("keeps regions in canonical order without duplicates", () => {
    const parsed = UpsertStatusAppNoticeInput.parse({
      kind: "report",
      refId: 3,
      showInApp: true,
      regions: ["Steiermark", "Wien", "Steiermark"],
    });
    expect(parsed.regions).toEqual(["Wien", "Steiermark"]);
  });

  test("rejects a region the app cannot match", () => {
    expect(() =>
      UpsertStatusAppNoticeInput.parse({
        kind: "report",
        refId: 3,
        showInApp: true,
        regions: ["Graz"],
      }),
    ).toThrow();
  });
});

describe("stored regions", () => {
  test("unreadable values count as all of Austria", () => {
    expect(parseRegions("not json")).toEqual([]);
    expect(parseRegions('{"a":1}')).toEqual([]);
    expect(parseRegions('["Tirol","Mars"]')).toEqual(["Tirol"]);
  });
});
