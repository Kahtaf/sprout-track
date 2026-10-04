import { parse } from "csv-parse/sync";
import type {
  ExternalImportFile,
  ExternalImportRecord,
  ExternalImportSource,
} from "@/src/types/external-import";
import type { ExternalImportRuntimeProvider } from "../runtime-registry";

type Row = Record<string, string>;
type Doc = Record<string, any>;
const number = (v: unknown): number | undefined =>
  v === "" || v == null
    ? undefined
    : Number.isFinite(Number(v))
      ? Number(v)
      : (() => {
          throw new Error("Invalid numeric value in history");
        })();
const unit = (v: string): "ML" | "OZ" | undefined =>
  v
    ? v.toUpperCase() === "ML"
      ? "ML"
      : ["FLOZ", "OZ"].includes(v.toUpperCase())
        ? "OZ"
        : (() => {
            throw new Error(`Unsupported volume unit ${v}`);
          })()
    : undefined;
const epoch = (v: string) => {
  const n = number(v);
  if (n === undefined) throw new Error("Missing authoritative epoch timestamp");
  return new Date(n).toISOString();
};
const local = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))
    throw new Error("Invalid Babycare wall-clock timestamp");
  return v.slice(0, -1);
};
function source(
  providerId: string,
  entityType: string,
  recordId: string,
  childId: string,
  raw: unknown,
  reviewFlags: string[] = [],
): ExternalImportSource {
  if (!recordId || !childId)
    throw new Error("History is missing stable source or child ID");
  return {
    providerId,
    entityType,
    recordId,
    childId,
    rawSource: JSON.stringify(raw),
    reviewFlags,
  };
}
const annotate = (notes: string | undefined, flags: readonly string[] = []) =>
  [notes, ...flags.map((x) => `Import review: ${x}`)]
    .filter(Boolean)
    .join("\n") || undefined;

export function parseNaraHistory(content: string): ExternalImportRecord[] {
  let rows: Row[];
  try {
    rows = parse(content, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      relax_column_count_less: true,
    }) as Row[];
  } catch {
    throw new Error("Invalid Nara CSV structure");
  }
  if (
    !rows.length ||
    !("_activityKey" in rows[0]) ||
    !("_profileKey" in rows[0])
  )
    throw new Error("Not a Nara history CSV");
  const profileIds = [
    ...new Set(
      rows.filter((r) => r.Type === "Profile").map((r) => r._profileKey),
    ),
  ];
  const result: ExternalImportRecord[] = [];
  for (const row of rows) {
    const kind = row.Type,
      child =
        row._profileKey ||
        (kind === "Pump" && profileIds.length === 1 ? profileIds[0] : ""),
      id = kind === "Profile" ? child : row._activityKey;
    const src = source(
      "nara",
      kind,
      id,
      child,
      row,
      !row._profileKey
        ? ["Family-level pumping entry assigned to the sole exported child"]
        : [],
    );
    const time =
      kind === "Profile" ? "" : epoch(row["Start Date/time (Epoch)"]);
    const base = { source: src, sourceChildId: child };
    const notes = row.Note || undefined;
    if (kind === "Profile") {
      result.push({
        targetType: "baby",
        source: src,
        firstName: row["Profile Name"],
        lastName: "",
        birthDate: row["[Profile] Birth Date"],
      });
      continue;
    }
    const addNote = (suffix: string, text: string, flags: string[] = []) =>
      result.push({
        ...base,
        source: { ...src, recordId: `${id}:${suffix}`, reviewFlags: flags },
        targetType: "note",
        time,
        content: annotate(text, flags)!,
      });
    const breast = (prefix: string) => {
      let added = false;
      for (const side of ["LEFT", "RIGHT"] as const) {
        const duration = number(
          row[
            `[${prefix}] ${side === "LEFT" ? "Left" : "Right"} Duration (Seconds)`
          ],
        );
        if (duration !== undefined) {
          added = true;
          result.push({
            ...base,
            source: { ...src, recordId: `${id}:breast:${side}` },
            targetType: "feed",
            type: "BREAST",
            time,
            startTime: time,
            feedDuration: duration,
            side,
            sessionId: `nara:${id}`,
            notes,
          });
        }
      }
      if (!added)
        addNote(
          "breast",
          "Breastfeeding session" + (notes ? "\n" + notes : ""),
          ["No side timing exported"],
        );
    };
    if (kind === "Bottle Feed" || kind === "Combo Feed") {
      const prefix = kind;
      const field = (name: string) => row[`[${prefix}] ${name}`];
      const bm = number(field("Breast Milk Volume")),
        formula = number(field("Formula Volume")),
        total = number(field("Volume"));
      const flags: string[] = [];
      const mixed = field("Type") === "Breast Milk Formula";
      let amount = total;
      let u = unit(field("Volume Unit"));
      if (amount === undefined && !mixed) {
        amount = bm ?? formula;
        u = unit(
          bm !== undefined
            ? field("Breast Milk Volume Unit")
            : field("Formula Volume Unit"),
        );
      }
      if (
        amount === undefined &&
        mixed &&
        bm !== undefined &&
        formula !== undefined
      ) {
        const bu = unit(field("Breast Milk Volume Unit")),
          fu = unit(field("Formula Volume Unit"));
        u = bu ?? fu;
        const cv = (v: number, from: typeof u) =>
          from === u ? v : u === "ML" ? v * 29.5735295625 : v / 29.5735295625;
        amount = cv(bm, bu) + cv(formula, fu);
      }
      if (mixed && (bm === undefined || formula === undefined))
        flags.push(
          "Mixed feed has an unknown component amount; total is not inferred",
        );
      const bu = unit(field("Breast Milk Volume Unit"));
      if (!u) u = bu ?? unit(field("Formula Volume Unit"));
      const breastMilkAmount =
        bm !== undefined && u
          ? bu === u
            ? bm
            : u === "ML"
              ? bm * 29.5735295625
              : bm / 29.5735295625
          : undefined;
      result.push({
        ...base,
        source: {
          ...src,
          recordId: kind === "Combo Feed" ? `${id}:bottle` : id,
          reviewFlags: flags,
        },
        targetType: "feed",
        type: "BOTTLE",
        sessionId: `history:nara:${id}`,
        time,
        amount,
        unitAbbr: u,
        bottleType: mixed
          ? "Formula/Breast"
          : field("Type") === "Breast Milk"
            ? "Breast Milk"
            : field("Type") === "Formula"
              ? "Formula"
              : "Other",
        breastMilkAmount,
        food: field("Formula Name") || undefined,
        notes: annotate(notes, flags),
      });
      if (kind === "Combo Feed") breast(kind);
    } else if (kind === "Breastfeed") breast(kind);
    else if (kind === "Pump")
      result.push({
        ...base,
        targetType: "pump",
        startTime: time,
        endTime: row["[Pump] End Date/time (Epoch)"]
          ? epoch(row["[Pump] End Date/time (Epoch)"])
          : undefined,
        duration:
          number(row["[Pump] Duration (Seconds)"]) === undefined
            ? undefined
            : Math.round(Number(row["[Pump] Duration (Seconds)"]) / 60),
        durationSeconds: number(row["[Pump] Duration (Seconds)"]),
        totalAmount: number(row["[Pump] Total Volume"]),
        leftAmount: number(row["[Pump] Left Volume"]),
        rightAmount: number(row["[Pump] Right Volume"]),
        unitAbbr:
          unit(
            row["[Pump] Total Volume Unit"] ||
              row["[Pump] Left Volume Unit"] ||
              row["[Pump] Right Volume Unit"],
          ) || "ML",
        pumpAction: "HISTORICAL",
        notes: annotate(notes, [
          "Historical pumping; excluded from current milk inventory",
        ]),
      });
    else if (kind === "Diaper") {
      const types: Record<string, "WET" | "DIRTY" | "BOTH" | "DRY"> = {
        Wet: "WET",
        Dirty: "DIRTY",
        "Dirty Wet": "BOTH",
        Dry: "DRY",
      };
      if (!types[row["[Diaper] Type"]])
        throw new Error("Unknown Nara diaper type");
      result.push({
        ...base,
        targetType: "diaper",
        time,
        type: types[row["[Diaper] Type"]],
        color: row["[Diaper] Dirty Color"] || undefined,
        condition: row["[Diaper] Dirty Texture"] || undefined,
        notes: annotate(
          [notes, row["[Diaper] Detail"]].filter(Boolean).join("\n"),
        ),
      });
    } else if (kind === "Growth") {
      for (const [field, type] of [
        ["Head Size", "HEAD_CIRCUMFERENCE"],
        ["Height", "HEIGHT"],
        ["Weight", "WEIGHT"],
      ] as const) {
        const value = number(row[`[Growth] ${field}`]);
        if (value === undefined) continue;
        const u = row[`[Growth] ${field} Unit`].toLowerCase();
        if (!["cm", "in", "kg", "lb"].includes(u))
          throw new Error("Unsupported growth unit");
        const flags =
          u === "in" && value > 30
            ? [
                "Large IN measurement may have been entered as centimeters; original unit retained",
              ]
            : [];
        result.push({
          ...base,
          source: { ...src, recordId: `${id}:${type}`, reviewFlags: flags },
          targetType: "measurement",
          date: time,
          type,
          value,
          unit: u as "cm" | "in" | "kg" | "lb",
          notes: annotate(notes, flags),
        });
      }
    } else if (kind === "Baby First")
      result.push({
        ...base,
        targetType: "milestone",
        date: time,
        title: row["[Baby First] Baby First"] || "Milestone",
        description: notes,
      });
    else if (kind === "Medical") {
      let added = false;
      const temp = number(row["[Medical] Temperature"]);
      if (temp !== undefined) {
        const u = row["[Medical] Temperature Unit"];
        if (!["C", "F"].includes(u))
          throw new Error("Unknown temperature unit");
        result.push({
          ...base,
          source: { ...src, recordId: `${id}:temperature` },
          targetType: "measurement",
          date: time,
          type: "TEMPERATURE",
          value: temp,
          unit: u === "C" ? "°C" : "°F",
          notes,
        });
        added = true;
      }
      const medications = row["[Medical] Medication"]
        .split("\n")
        .filter(Boolean);
      medications.forEach((med, i) => {
        const match = med.match(/^(.*), ([\d.]+) \((MG|ML|TAB|DROP)\)$/);
        if (match) {
          result.push({
            ...base,
            source: { ...src, recordId: `${id}:medicine:${i}` },
            targetType: "medicine",
            time,
            medicineName: match[1],
            doseAmount: Number(match[2]),
            unitAbbr: match[3] as "MG" | "ML" | "TAB" | "DROP",
            notes,
          });
        } else
          addNote(`medicine:${i}`, `${med}${notes ? "\n" + notes : ""}`, [
            "Medication dose not exported; no dose invented",
          ]);
        added = true;
      });
      if (!added)
        addNote(
          "medical",
          notes || "Medical entry (no structured data exported)",
        );
    } else throw new Error(`Unsupported Nara category ${kind}`);
  }
  return result;
}

export function parseBabycareHistory(content: string): ExternalImportRecord[] {
  const root = JSON.parse(content);
  if (!Array.isArray(root.documents))
    throw new Error("Expected Babycare export documents");
  const records: ExternalImportRecord[] = [];
  for (const doc of root.documents as Doc[]) {
    const child = doc.type === "baby" ? doc._id : doc.baby_id,
      kind = doc.event_type || doc.type,
      src = source("babycare", kind, doc._id, child, doc),
      base = { source: src, sourceChildId: child };
    if (doc.type === "baby") {
      records.push({
        targetType: "baby",
        source: src,
        firstName: doc.name || doc.first_name || "Baby",
        lastName: doc.last_name || "",
        birthDate: doc.birthdate.slice(0, 10),
      });
      continue;
    }
    const time = local(doc.createdAt),
      notes = doc.comment || undefined;
    const note = (text: string, flags: string[] = []) =>
      records.push({
        ...base,
        source: { ...src, reviewFlags: flags },
        targetType: "note",
        time,
        content: annotate(text, flags)!,
      });
    if (kind === "pumping")
      records.push({
        ...base,
        targetType: "pump",
        startTime: time,
        totalAmount: number(doc.volume),
        unitAbbr: "ML",
        pumpAction: "HISTORICAL",
        notes: annotate(notes, [
          "Historical pumping; excluded from current milk inventory",
        ]),
      });
    else if (kind === "measurement") {
      const value = number(doc.value);
      if (value === undefined) throw new Error("Missing Babycare measurement");
      if (doc.measurement_type === "weight")
        records.push({
          ...base,
          targetType: "measurement",
          date: time,
          type: "WEIGHT",
          value: value / 1000,
          unit: "kg",
          notes,
        });
      else
        note(
          `Measurement ${doc.measurement_type}: ${value}${notes ? "\n" + notes : ""}`,
          ["Measurement type requires review"],
        );
    } else if (kind === "feeding_bottle")
      records.push({
        ...base,
        targetType: "feed",
        sessionId: `history:babycare:${doc._id}`,
        time,
        type: "BOTTLE",
        amount: number(doc.volume),
        unitAbbr: "ML",
        bottleType:
          doc.food_name === "expressed"
            ? "Breast Milk"
            : doc.food_name === "formula"
              ? "Formula"
              : "Other",
        food: doc.food_name,
        notes,
      });
    else if (kind === "diaper") {
      const types: Record<string, "WET" | "DIRTY" | "BOTH"> = {
        mixed: "BOTH",
        wet: "WET",
        dirty: "DIRTY",
        urine: "WET",
        feces: "DIRTY",
      };
      if (!types[doc.diaper])
        throw new Error(`Unknown Babycare diaper ${doc.diaper}`);
      records.push({
        ...base,
        targetType: "diaper",
        time,
        type: types[doc.diaper],
        color: doc.color || undefined,
        condition: doc.consistence || undefined,
        notes: annotate(
          [notes, doc.amount ? `Amount: ${doc.amount}` : ""]
            .filter(Boolean)
            .join("\n"),
        ),
      });
    } else if (kind === "lactation") {
      let added = false;
      for (const side of ["left", "right"] as const) {
        const reports = doc.reports || [];
        let started: string | undefined,
          seconds = 0;
        for (const report of reports) {
          if (report.state === `${side}_start`) started = report.createdAt;
          else if (report.state === `${side}_stop` && started) {
            seconds +=
              (Date.parse(report.createdAt) - Date.parse(started)) / 1000;
            started = undefined;
          }
        }
        if (seconds > 0) {
          records.push({
            ...base,
            source: { ...src, recordId: `${doc._id}:${side}` },
            targetType: "feed",
            time,
            startTime: time,
            feedDuration: seconds,
            side: side.toUpperCase() as "LEFT" | "RIGHT",
            type: "BREAST",
            sessionId: `babycare:${doc._id}`,
            notes: annotate(
              notes,
              doc.volume
                ? [
                    "Babycare breastfeeding volume estimate retained in source metadata",
                  ]
                : [],
            ),
          });
          added = true;
        }
      }
      if (!added)
        note("Breastfeeding session" + (notes ? "\n" + notes : ""), [
          "No completed side timing exported",
        ]);
    } else if (kind === "medicine") {
      const units: Record<string, "DROP" | "ML" | "MG" | "TAB"> = {
        drops: "DROP",
        ml: "ML",
        mg: "MG",
        tablets: "TAB",
      };
      if (number(doc.amount) !== undefined && units[doc.unit])
        records.push({
          ...base,
          targetType: "medicine",
          time,
          medicineName: doc.medicine,
          doseAmount: Number(doc.amount),
          unitAbbr: units[doc.unit],
          notes,
        });
      else
        note(`Medication: ${doc.medicine}${notes ? "\n" + notes : ""}`, [
          "Unrecognized medicine dose/unit retained in metadata",
        ]);
    } else if (kind === "activity" && doc.activity === "bathing")
      records.push({
        ...base,
        targetType: "bath",
        time,
        bathType: "Full Bath",
        durationSeconds:
          doc.duration === undefined ? undefined : doc.duration / 1000,
        notes: annotate(
          notes,
          doc.duration
            ? [`Original bath duration ${doc.duration / 60000} minutes`]
            : [],
        ),
      });
    else if (kind === "birthday")
      records.push({
        ...base,
        targetType: "milestone",
        date: time,
        title: "Birth",
        description: notes,
      });
    else
      note(
        `${kind}${doc.activity ? ": " + doc.activity : ""}${notes ? "\n" + notes : ""}`,
        ["Imported as note; original category retained in metadata"],
      );
  }
  return records;
}

export function historyRuntimeProvider(
  id: "nara" | "babycare",
): ExternalImportRuntimeProvider {
  const parseHistory = id === "nara" ? parseNaraHistory : parseBabycareHistory;
  return {
    id,
    buildRecords(files) {
      return files.flatMap((f) => parseHistory(f.content));
    },
    previewFiles(files) {
      const records = files.flatMap((f) => parseHistory(f.content));
      const children = records
        .filter((r) => r.targetType === "baby")
        .map((r) => ({
          sourceId: r.source.recordId,
          firstName: r.targetType === "baby" ? r.firstName : "",
          lastName: r.targetType === "baby" ? r.lastName : "",
          birthDate: r.targetType === "baby" ? r.birthDate : "",
        }));
      const flags = [
        ...new Set(records.flatMap((r) => r.source.reviewFlags || [])),
      ];
      return {
        preview: {
          providerId: id,
          totalRows: records.length,
          ready: true,
          warnings: flags,
          files: files.map((f) => ({
            fileName: f.name,
            status: "detected",
            entityType: "history",
            rowCount: parseHistory(f.content).length,
            headers: [],
          })),
        },
        details: { children, unitRequirements: [] },
        warnings: [],
      };
    },
  };
}
