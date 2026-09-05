import { describe, it, expect } from "vitest";
import { diffDatasets, diffEntry, type Build } from "./versions.js";

const FROM: Build = { version: "4.9.0-LIVE.12344265", sha: "db00b74983", date: "2026-08-20" };
const TO: Build = { version: "4.10.0-LIVE.12519617", sha: "f6a2b29e77", date: "2026-08-27" };

describe("diffEntry", () => {
  it("finds nested stat changes by dotted path", () => {
    const before = { className: "X", stdItem: { Weapon: { Damage: { DpsTotal: 908.3 } } } };
    const after = { className: "X", stdItem: { Weapon: { Damage: { DpsTotal: 812.5 } } } };
    const changes = diffEntry(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      field: "stdItem.Weapon.Damage.DpsTotal",
      from: 908.3,
      to: 812.5,
    });
  });

  it("returns nothing for an untouched record", () => {
    const entry = { className: "BEHR_BallisticGatling_S5", size: 5, dps: 1537.5 };
    expect(diffEntry(entry, { ...entry })).toHaveLength(0);
  });

  it("treats an added field as a change from undefined", () => {
    const changes = diffEntry({ a: 1 }, { a: 1, b: 2 });
    expect(changes).toEqual([{ field: "b", from: undefined, to: 2 }]);
  });
});

describe("diffDatasets", () => {
  const before = [
    { className: "KEEP_SAME", name: "Unchanged Gun", dps: 100 },
    { className: "GETS_BUFF", name: "Mantis GT-220", dps: 506.7 },
    { className: "GOES_AWAY", name: "Removed Gun", dps: 50 },
  ];
  const after = [
    { className: "KEEP_SAME", name: "Unchanged Gun", dps: 100 },
    { className: "GETS_BUFF", name: "Mantis GT-220", dps: 853.3 },
    { className: "BRAND_NEW", name: "New Gun", dps: 200 },
  ];

  it("summarises adds, removes and changes across a whole dataset", () => {
    const result = diffDatasets("ship-items", FROM, TO, before, after);
    expect(result.summary).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 1 });
    expect(result.added?.[0]).toContain("New Gun");
    expect(result.removed?.[0]).toContain("Removed Gun");
    expect(result.changed?.[0].item).toContain("Mantis GT-220");
  });

  it("gives field-level detail when scoped to one item", () => {
    const result = diffDatasets("ship-items", FROM, TO, before, after, { itemQuery: "Mantis" });
    expect(result.summary.changed).toBe(1);
    expect(result.changed?.[0].changes).toEqual([{ field: "dps", from: 506.7, to: 853.3 }]);
  });

  it("reports zero changes for an item that was not touched", () => {
    const result = diffDatasets("ship-items", FROM, TO, before, after, { itemQuery: "Unchanged" });
    expect(result.summary.changed).toBe(0);
    expect(result.summary.unchanged).toBe(1);
    expect(result.changed).toBeUndefined();
  });

  it("matches on class name as well as display name", () => {
    const result = diffDatasets("ship-items", FROM, TO, before, after, { itemQuery: "GETS_BUFF" });
    expect(result.summary.changed).toBe(1);
  });

  it("throws when the item matches nothing in either build", () => {
    expect(() =>
      diffDatasets("ship-items", FROM, TO, before, after, { itemQuery: "Nonexistent" }),
    ).toThrow(/No entry/);
  });

  it("caps long lists and says so", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      className: `NEW_${i}`,
      name: `Gun ${i}`,
    }));
    const result = diffDatasets("ship-items", FROM, TO, [], many, { limit: 10 });
    expect(result.summary.added).toBe(120);
    expect(result.added).toHaveLength(10);
    expect(result.truncated).toMatch(/capped at 10 of 120/);
  });

  it("orders changed entries by how much moved", () => {
    const a = [
      { className: "SMALL", name: "Small", x: 1 },
      { className: "BIG", name: "Big", x: 1, y: 1, z: 1 },
    ];
    const b = [
      { className: "SMALL", name: "Small", x: 2 },
      { className: "BIG", name: "Big", x: 9, y: 9, z: 9 },
    ];
    const result = diffDatasets("ship-items", FROM, TO, a, b);
    expect(result.changed?.[0].item).toContain("Big");
    expect(result.changed?.[0].change_count).toBe(3);
  });
});
