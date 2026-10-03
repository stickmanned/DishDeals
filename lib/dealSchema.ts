import { z } from "zod";

export const Deal = z.object({
  restaurant: z.string(),
  address: z.string().nullable(),
  dealText: z.string(),
  priceCad: z.number().nullable(),
  validDays: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])),
  validStart: z.string().nullable(), // "HH:MM"
  validEnd: z.string().nullable(),
  expiresOn: z.string().nullable(), // "YYYY-MM-DD"
  conditions: z.array(z.string()),
  confidence: z.object({
    restaurant: z.number(),
    priceCad: z.number(),
    hours: z.number(),
    expiresOn: z.number(),
  }),
});

export const DealResult = z.object({ isDeal: z.boolean(), deals: z.array(Deal) });
export type DealResult = z.infer<typeof DealResult>;
