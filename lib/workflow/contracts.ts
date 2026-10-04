import { z } from "zod";
// Convex does not allow runtime code generation.
z.config({ jitless: true });

export const publicUrl = z.string().max(2048).refine((value) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password &&
      !u.port && !u.hostname.includes(":") && !u.hostname.startsWith("[") &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) &&
      u.hostname.includes(".") && !/\.(local|internal|localhost)$/.test(u.hostname);
  } catch { return false; }
}, "Use a public HTTPS URL without credentials, IP addresses or custom ports");
const provenance = { sourceUrl: publicUrl.optional(), publishedAt: z.iso.date().optional() };
export const sourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().trim().min(10).max(30000), ...provenance }).strict(),
  z.object({ type: z.literal("url"), url: publicUrl, caption: z.string().max(10000).optional(), ...provenance }).strict(),
  z.object({ type: z.literal("image"), data: z.string().min(4).max(450000)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, "Invalid base64 image"),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    caption: z.string().max(10000).optional(), ...provenance }).strict().refine(s => {
      try {
        const bytes = atob(s.data.slice(0, 24));
        if (s.mimeType === "image/png") return bytes.startsWith("\x89PNG\r\n\x1a\n");
        if (s.mimeType === "image/jpeg") return bytes.startsWith("\xff\xd8\xff");
        return bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WEBP";
      } catch { return false; }
    }, "Image content does not match its MIME type"),
]);
export const contextSchema = z.object({
  city: z.string().trim().min(1).max(100).default("Vancouver"),
  region: z.string().trim().min(1).max(100).default("British Columbia"),
  countryCode: z.string().regex(/^[a-z]{2}$/).default("ca"),
  timezone: z.string().max(80).refine((s) => {
    try { new Intl.DateTimeFormat("en", { timeZone: s }); return true; } catch { return false; }
  }).default("America/Vancouver"),
}).strict();
export const inputSchema = z.object({ source: sourceSchema, context: contextSchema.prefault({}) }).strict();

const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();
export const dealSchema = z.object({
  restaurantName: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  price: z.number().finite().min(0).max(100000).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  discountPercent: z.number().min(0).max(100).nullable(),
  days: z.array(z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  startDate: z.iso.date().nullable(),
  endDate: z.iso.date().nullable(),
  conditions: z.array(z.string().trim().min(1).max(300)).max(20),
  locationHint: nullableText(300),
  addressHint: nullableText(500),
  evidence: z.string().trim().min(1).max(1000),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().trim().min(1).max(300)).max(10),
}).strict().refine(d => !d.startDate || !d.endDate || d.startDate <= d.endDate,
  { message: "endDate precedes startDate", path: ["endDate"] });
export const extractionSchema = z.object({
  deals: z.array(dealSchema).max(10),
  rejectionReason: nullableText(1000),
}).strict().refine(d => d.deals.length > 0 || d.rejectionReason !== null,
  "Empty extraction must explain why there is no deal");
// The same schema controls the Gemini response and local validation.
export const extractionJsonSchema = z.toJSONSchema(extractionSchema, { unrepresentable: "any" });
export const placeSchema = z.object({
  placeId: z.string().min(1).max(2048), name: z.string().min(1).max(300),
  address: z.string().min(1).max(1000), latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().nullable(), countryCode: z.string().nullable(),
  categories: z.array(z.string()), matchScore: z.number().min(0).max(1),
});
export const outcomeSchema = z.object({
  deal: dealSchema, restaurant: placeSchema.nullable(), candidates: z.array(placeSchema).max(5),
  status: z.enum(["ready", "needs_review", "rejected"]), reviewReasons: z.array(z.string()),
});
export const resultSchema = z.object({
  version: z.literal(1), source: z.object({
    type: z.enum(["text", "url", "image"]), url: z.string().nullable(),
    publishedAt: z.string().nullable(), contentHash: z.string(), processedAt: z.string(),
  }), timezone: z.string(), outcomes: z.array(outcomeSchema).max(10), rejectionReason: z.string().nullable(),
});
export type WorkflowInput = z.infer<typeof inputSchema>;
export type Deal = z.infer<typeof dealSchema>;
export type Extraction = z.infer<typeof extractionSchema>;
export type Place = z.infer<typeof placeSchema>;
export type Outcome = z.infer<typeof outcomeSchema>;
export type WorkflowResult = z.infer<typeof resultSchema>;
