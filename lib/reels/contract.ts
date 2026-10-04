import { z } from "zod";
import { DealResult } from "../dealSchema";
z.config({ jitless: true });

export function normalizeInstagramUrl(input: string): string {
  if (input.length > 4096) throw new Error("Share one Instagram Reel link.");
  const links = input.match(/https:\/\/[^\s<>]+/g) ?? [];
  if (links.length !== 1) throw new Error("Share one Instagram Reel link.");
  const u = new URL(links[0]);
  if (!["instagram.com", "www.instagram.com", "m.instagram.com"].includes(u.hostname) || u.username || u.password || u.port)
    throw new Error("Use a public Instagram Reel link.");
  const match = /^\/(?:reel|reels|p)\/([A-Za-z0-9_-]{5,64})\/?$/.exec(u.pathname);
  if (!match) throw new Error("Use the Reel’s direct link, not a profile or shortened share link.");
  // /p and /reel can refer to the same shortcode. Tracking never affects deduplication.
  return `https://www.instagram.com/reel/${match[1]}/`;
}

const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable();
const fields = ["restaurant", "address", "dealText", "price", "currency", "validDays", "hours", "expiresOn", "conditions"] as const;
export const reelDraft = z.object({
  restaurant: nullableText(200), address: nullableText(500), dealText: nullableText(2000),
  price: z.number().finite().min(0).max(100000).nullable(), currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  validDays: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).max(7).nullable(),
  validStart: time, validEnd: time, expiresOn: z.iso.date().nullable(),
  conditions: z.array(z.string().trim().min(1).max(300)).max(20).nullable(),
}).strict();
export const reelExtraction = z.object({
  isDeal: z.boolean(), drafts: z.array(reelDraft).max(10),
  evidence: z.array(z.object({
    draftIndex: z.number().int().min(0).max(9), field: z.enum(fields),
    channel: z.enum(["caption", "audio", "visual"]), quote: z.string().trim().min(1).max(1000),
    timestampSeconds: z.number().finite().min(0).nullable(),
  }).strict()).max(90),
  transcript: z.string().max(30000), warnings: z.array(z.string().max(300)).max(20),
}).strict().superRefine((value, ctx) => {
  if (value.isDeal !== (value.drafts.length > 0)) ctx.addIssue({ code: "custom", message: "Deal flag contradicts drafts" });
  for (const e of value.evidence) if (e.draftIndex >= value.drafts.length) ctx.addIssue({ code: "custom", message: "Evidence refers to a missing draft" });
});
export type ReelExtraction = z.infer<typeof reelExtraction>;
export type ReelDraft = z.infer<typeof reelDraft>;

export function validateExtraction(raw: unknown, caption: string, duration: number): ReelExtraction {
  const result = reelExtraction.parse(raw);
  for (const e of result.evidence) {
    if (e.channel === "caption" && !caption.includes(e.quote)) throw new Error("Caption evidence is not in the source");
    if (e.channel === "audio" && !result.transcript.includes(e.quote)) throw new Error("Audio evidence is not in the transcript");
    if (e.channel !== "caption" && (e.timestampSeconds === null || e.timestampSeconds > duration)) throw new Error("Invalid video evidence timestamp");
  }
  for (const [i, draft] of result.drafts.entries()) {
    const has = (field: typeof fields[number]) => result.evidence.some(e => e.draftIndex === i && e.field === field);
    for (const field of ["restaurant", "address", "dealText", "price", "currency", "validDays", "expiresOn", "conditions"] as const) {
      if (draft[field] !== null && !has(field)) throw new Error(`Missing evidence for ${field}`);
    }
    if ((draft.validStart !== null || draft.validEnd !== null) && !has("hours")) throw new Error("Missing hours evidence");
  }
  return result;
}

// Unknown schedules stay null in staging. Empty canonical arrays mean every day/no restrictions.
// Only fully reviewed drafts can later be mapped to the existing publication contract.
export function toCanonical(draft: ReelDraft) {
  if (!draft.restaurant || !draft.dealText || draft.validDays === null || draft.conditions === null)
    throw new Error("Review unknown restaurant, deal, days and conditions before publishing.");
  return DealResult.parse({ isDeal: true, deals: [{ ...draft,
    priceCad: draft.currency === "CAD" ? draft.price : null,
    confidence: { restaurant: 0, priceCad: 0, hours: 0, expiresOn: 0 },
  }] });
}
