import { describe, it, expect } from "vitest";
import {
  parseNaraHistory,
  parseBabycareHistory,
} from "../src/lib/importers/family-history";
import { externalImportLocalTimeToUtc } from "../src/lib/importers/timezone";
import { externalImportProvenanceKey } from "../src/lib/importers/provenance";
const csv = (rows: Record<string, string>[]) => {
  const keys = [...new Set(rows.flatMap(Object.keys))];
  return [keys, ...rows.map((r) => keys.map((k) => r[k] || ""))]
    .map((a) => a.map((v) => '"' + v.replaceAll('"', '""') + '"').join(","))
    .join("\n");
};
const profile = {
  Type: "Profile",
  "Profile Name": "Test",
  "[Profile] Birth Date": "2026-02-18",
  _profileKey: "child",
  _activityKey: "",
};
const base = {
  _profileKey: "child",
  _activityKey: "record",
  "Start Date/time (Epoch)": "1775001600123",
  Note: "",
};
describe("loss-preserving family-history adapters", () => {
  it("keeps authoritative Nara epoch milliseconds and splits growth without changing ambiguous units", () => {
    const records = parseNaraHistory(
      csv([
        profile,
        {
          ...base,
          Type: "Growth",
          "[Growth] Head Size": "39",
          "[Growth] Head Size Unit": "IN",
          "[Growth] Weight": "4",
          "[Growth] Weight Unit": "KG",
        },
      ]),
    );
    expect(records).toHaveLength(3);
    const measure = records.find(
      (r) => r.targetType === "measurement" && r.type === "HEAD_CIRCUMFERENCE",
    )!;
    expect(measure).toMatchObject({
      value: 39,
      unit: "in",
      date: "2026-04-01T00:00:00.123Z",
    });
    expect(measure.source.reviewFlags).toHaveLength(1);
    expect(JSON.parse(measure.source.rawSource!)).toMatchObject({
      "[Growth] Head Size Unit": "IN",
    });
  });
  it("retains unknown mixed-feed amount and dose-free medicine rather than inventing values", () => {
    const records = parseNaraHistory(
      csv([
        profile,
        {
          ...base,
          Type: "Bottle Feed",
          "[Bottle Feed] Type": "Breast Milk Formula",
          "[Bottle Feed] Breast Milk Volume": "60",
          "[Bottle Feed] Breast Milk Volume Unit": "ML",
        },
        {
          ...base,
          _activityKey: "med",
          Type: "Medical",
          "[Medical] Medication": "Iron",
        },
      ]),
    );
    expect(records[1]).toMatchObject({
      targetType: "feed",
      bottleType: "Formula/Breast",
    });
    expect((records[1] as any).amount).toBeUndefined();
    expect(records[2]).toMatchObject({ targetType: "note" });
  });
  it("uses Toronto wall-clock for Babycare literal Z and does not fabricate pump durations", () => {
    const records = parseBabycareHistory(
      JSON.stringify({
        documents: [
          {
            _id: "pump",
            type: "event",
            baby_id: "child",
            event_type: "pumping",
            createdAt: "2026-07-01T12:00:00.123Z",
            volume: 30,
          },
        ],
      }),
    );
    expect(records[0]).toMatchObject({
      startTime: "2026-07-01T12:00:00.123",
      totalAmount: 30,
    });
    expect((records[0] as any).duration).toBeUndefined();
    expect(
      externalImportLocalTimeToUtc(
        (records[0] as any).startTime,
        "America/Toronto",
      ).toISOString(),
    ).toBe("2026-07-01T16:00:00.123Z");
    expect(
      externalImportLocalTimeToUtc(
        "2026-07-01T12:00:00.123Z",
        "America/Toronto",
      ).toISOString(),
    ).toBe("2026-07-01T12:00:00.123Z");
  });
  it("never deduplicates distinct providers by date or content", () => {
    const a = { providerId: "nara", entityType: "Pump", recordId: "same" },
      b = { providerId: "babycare", entityType: "Pump", recordId: "same" };
    expect(externalImportProvenanceKey("family", a)).not.toEqual(
      externalImportProvenanceKey("family", b),
    );
  });
  it("refuses family-level pump ambiguity when multiple children are exported", () => {
    expect(() =>
      parseNaraHistory(
        csv([
          profile,
          { ...profile, _profileKey: "other" },
          { ...base, _profileKey: "", Type: "Pump" },
        ]),
      ),
    ).toThrow("child ID");
  });
});

it('keeps precise pump seconds while excluding imported milk from current balance', async () => {
  const { calculateBreastMilkBalance } = await import('../src/utils/breastMilkInventory');
  const records = parseNaraHistory(csv([profile, {...base, Type:'Pump', '[Pump] Duration (Seconds)':'125', '[Pump] Total Volume':'40', '[Pump] Total Volume Unit':'ML'}]));
  expect(records[1]).toMatchObject({targetType:'pump',duration:2,durationSeconds:125,pumpAction:'HISTORICAL'});
  const balance = calculateBreastMilkBalance({targetUnit:'ML',pumpLogs:[{totalAmount:40,unitAbbr:'ML',pumpAction:'HISTORICAL'}],adjustments:[],feedLogs:[{amount:40,unitAbbr:'ML',bottleType:'Breast Milk',breastMilkAmount:null,sessionId:'history:nara:old'}]});
  expect(balance).toBe(0);
});
