import { z } from "zod";
import type { DealView } from "./deals";
export type Draft = {
  restaurant: string;
  dealText: string;
  description: string;
  price: string;
  address: string;
  days: string[];
  start: string;
  end: string;
  expiry: string;
  conditions: string;
};
export const emptyDraft: Draft = {
  restaurant: "",
  dealText: "",
  description: "",
  price: "",
  address: "",
  days: [],
  start: "",
  end: "",
  expiry: "",
  conditions: "",
};
export function draftFromDeal(d: DealView): Draft {
  return {
    restaurant: d.restaurant,
    dealText: d.dealText,
    description: d.description,
    price: d.priceCad?.toString() ?? "",
    address: d.address ?? "",
    days: d.validDays,
    start: d.validStart ?? "",
    end: d.validEnd ?? "",
    expiry: d.expiresOn ?? "",
    conditions: d.conditions.join("\n"),
  };
}
const time = z
  .string()
  .refine(
    (v) => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
    "Use a valid 24-hour time.",
  );
function validDate(v: string) {
  if (!v) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export const draftSchema = z.object({
  restaurant: z.string().trim().min(1, "Add a restaurant name.").max(200),
  dealText: z.string().trim().min(1, "Describe the offer.").max(2000),
  description: z.string().max(2000),
  price: z
    .string()
    .refine(
      (v) => !v || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) <= 100000),
      "Use a positive CAD price, with up to two decimals.",
    ),
  address: z.string().max(500),
  days: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])),
  start: time,
  end: time,
  expiry: z.string().refine(validDate, "Use a valid expiry date."),
  conditions: z.string().max(6000),
});
export function previewDeal(
  draft: Draft,
  id: string,
  author: string,
  imageUrl?: string,
): DealView {
  const d = draftSchema.parse(draft);
  return {
    id,
    restaurant: d.restaurant,
    dealText: d.dealText,
    description: d.description,
    ...(d.price ? { priceCad: Number(d.price), currency: "CAD" } : {}),
    ...(d.address ? { address: d.address } : {}),
    validDays: d.days,
    ...(d.start ? { validStart: d.start } : {}),
    ...(d.end ? { validEnd: d.end } : {}),
    ...(d.expiry ? { expiresOn: d.expiry } : {}),
    conditions: d.conditions
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean),
    createdAt: Date.now(),
    imageUrl,
    imageAlt: "Preview source image",
    authorName: author,
    stillOnCount: 0,
    expiredCount: 0,
    isDemo: true,
  };
}
