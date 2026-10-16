import type { DistrictLookup } from "@/server/normalise";

// COMP-008, TASK-009 handoff: four invented fixture rows, not Bangladesh district assignments.
export const districts = [
  { code: 1, name_bn: "[MOCK] জেলা ১", name_en: "[MOCK] District 1", aliases: ["[MOCK] alias one", "[MOCK] shared"] },
  { code: 2, name_bn: "[MOCK] জেলা ২", name_en: "[MOCK] District 2", aliases: ["[MOCK] বড় জেলা", "[MOCK] shared"] },
  { code: 3, name_bn: "[MOCK] জেলা ৩", name_en: "[MOCK] District 3", aliases: ["[MOCK] য় জেলা"] },
  { code: 4, name_bn: "[MOCK] জেলা ৪", name_en: "[MOCK] District 4", aliases: [] },
] as const;

const key = (value: string) => value.normalize("NFC").trim().toLowerCase();

export const districtLookup: DistrictLookup = {
  lookup: (name) => districts.filter((d) => [d.name_bn, d.name_en, ...d.aliases].some((label) => key(label) === name)).map(({ code }) => ({ code })),
};
