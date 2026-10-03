# DishDeals: StormHacks 2026 Project Plan

Oct 3, 2026 · @William

## Summary

DishDeals is a live community feed of food deals that answers one question: *what can I eat for under $10 right now, nearby?* A member posts a deal by uploading an Instagram screenshot or a flyer photo; Gemini reads it, the poster confirms the pin on a map, and every open feed updates instantly.

- **Event:** StormHacks 2026, SFU Burnaby, October 3 to 4, 24 hours, teams of 1 to 4.
- **User:** students and other money-savvy people who want to eat out cheaply.
- **Problem:** deals are scattered across Instagram, Google Maps and paper flyers, and none of them tell you what is valid right now.
- **Difference from existing apps:** Clipmap, MunchMap and glide save *places* from reels into personal lists. DishDeals is a shared, community-checked feed of *deals*, filtered by price, distance and whether they are on right now, and members can tip whoever found a deal.
- **Judging criteria:** technical complexity, design, pitch, originality.
- **Prizes targeted:** overall placing, MLH Best Use of Gemini API, MLH Best Use of Solana, MLH Best .Tech Domain Name.

## Before you build

Spend the first 30 minutes on these checks; any one of them can change the plan.

- [x] **Theme:** "What to Build" is revealed at the opening ceremony. If there is a required theme, confirm DishDeals fits it before writing code.
- [x] **Eligibility:** Devpost lists "above legal age of majority" (19 in BC) and "students only". If anyone on the team is under 19, confirm with an organizer.
- [ ] **Existing code:** ask an organizer what pre-made code is allowed. Plan on libraries only, and list every one on Devpost.
- [ ] **Submission:** a project link (GitHub, Figma or slides) and a demo video of up to 3 minutes are both required. One or two people present.
- [ ] **Deadline:** check the exact submission time on the StormHacks schedule and work backwards from it.
- [ ] **Keys:** create the Gemini API key in Google AI Studio and check its rate limits; install a Solana wallet app on one phone if you are doing tipping.

## Guide for AI coding agents

This plan is the spec. An agent takes one ticket from the Task board, reads the sections that ticket depends on, builds only that ticket, and stops when its Done-when checks pass. Data model and Backend functions are the single source of truth for names and shapes.

**How to work a ticket**

1. Read this section, Data model, Backend functions, and the ticket's row on the Task board.
2. Check that every ticket in its Depends column is merged. If not, stop and report.
3. Branch as `t-XX-short-name` (for example `t-07-post-flow`).
4. Change only the files the ticket names; put shared logic in `lib/`.
5. Run `npx convex dev --once`, `npx vitest run` and `npm run build`; all three must pass.
6. Report: files changed, checks run with results, and anything a human must test on a phone.

**Ticket types:** **AFK** means an agent can finish it alone. **HITL** means it needs a human for accounts, API keys, phone testing or a judgment call; the agent builds the code and lists the human steps.

**Repository layout**

```text
dishdeals/
  app/
    layout.tsx            fonts, ConvexAuth provider
    page.tsx              feed (home)
    post/page.tsx         upload, extract, edit, confirm pin, publish
    deal/[id]/page.tsx    one deal
    profile/page.tsx      display name, wallet address, my posts
    signin/page.tsx       sign up and sign in
  components/
    DealCard.tsx  TimeBadge.tsx  PriceFilter.tsx  DealMap.tsx
    ConfidenceField.tsx  TipQR.tsx
  convex/
    schema.ts  convex.config.ts  auth.ts  auth.config.ts  http.ts
    users.ts  deals.ts  votes.ts  extract.ts  geocode.ts  seed.ts
  lib/
    dealSchema.ts  prompt.ts  validNow.ts  validNow.test.ts  distance.ts  image.ts
  fixtures/
    seed.json  demo/<sha256>.json
  public/
    manifest.webmanifest  sw.js
```

**Commands**

```bash
npx create-next-app@latest dishdeals --ts --tailwind --app --eslint
npm i convex @convex-dev/geospatial @google/genai zod react-leaflet leaflet date-fns date-fns-tz qrcode
npm i -D vitest @types/leaflet @types/qrcode
# then install Convex Auth with the exact command in its current Next.js guide
npx convex dev          # local backend sync; writes NEXT_PUBLIC_CONVEX_URL to .env.local
npm run dev             # app on http://localhost:3000
npx vitest run          # unit tests
```

**Environment variables**

| Name | Where it lives | Set by |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` and Vercel | `npx convex dev` locally; Vercel project settings |
| `CONVEX_DEPLOY_KEY` | Vercel only | Human, from the Convex dashboard |
| `GEMINI_API_KEY` | Convex dashboard environment variables | Human, from Google AI Studio |
| `CONTACT_EMAIL` | Convex dashboard | Human; used in the Nominatim User-Agent |
| Convex Auth keys | Convex dashboard | The Convex Auth setup command |

**Rules every agent follows**

- Never put API keys in client code, and never commit `.env*` files.
- Never fetch, scrape or call Instagram URLs; users supply screenshots, recordings or captions.
- Every mutation and action checks the signed-in user first and throws `Not signed in` if there is none.
- Compute anything that depends on the current time (valid now, time left) in the browser, not in Convex queries.
- Times are local to America/Vancouver; dates are `YYYY-MM-DD`; times are 24-hour `HH:MM`.
- Design mobile first at 390 px wide, using the locked palette, Zalando Sans and JetBrains Mono.
- Do not rename tables, fields or functions. If a change is needed, stop and ask a human to update Data model or Backend functions first.
- If stuck for 30 minutes, stop and report what was tried.

## Scope

DishDeals is done when all eight acceptance criteria pass on two phones in front of a judge.

**Acceptance criteria**

- [ ] A member can sign up, set a display name, and stay signed in after a reload.
- [ ] A screenshot, screen recording or flyer photo becomes an editable deal card in under 10 seconds.
- [ ] The poster sees a pin from the geocoder, can drag it, and publishes the deal.
- [ ] A published deal appears on a second device's feed within 2 seconds, without a refresh.
- [ ] The feed filters by price (any, under $5, $10, $15), shows valid-now deals first, then nearest, each with a time-left badge and distance.
- [ ] Any member can vote a deal "still on" or "expired", once per deal.
- [ ] A member can tip a deal's poster through a Solana Pay QR code on devnet (parallel track).
- [ ] The app is deployed on HTTPS and installable on Android.

**In scope:** accounts with display name and optional wallet address, shared feed, post flow, map pin confirmation, one-deal page with votes and directions link, Gemini extraction, valid-now logic, price filter, distance, 10 seeded deals.

**Out of scope:** following, comments, direct messages, notifications, reading Instagram links, the iOS share sheet, moderation tools beyond Gemini's `isDeal` check and votes.

**Stretch, only after checkpoint B:** a full-screen map view of the feed; a "verified on Google Maps" badge using Gemini's Maps grounding.

## Stack

Next.js on Vercel serves the pages; Convex holds accounts, deals, images and every server function, including the Gemini and geocoding calls.

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js (App Router), React, TypeScript | One app for every page |
| Styling | Tailwind CSS with the locked palette; Zalando Sans and JetBrains Mono | Matches the FigJam decisions |
| Backend and database | Convex | Reactive queries give the live feed; file storage, auth and server actions in one place; the free plan covers a hackathon |
| Accounts | Convex Auth, Password provider (email and password) | Built into Convex; fall back to the Anonymous provider plus display name if setup passes 90 minutes |
| Images | Convex file storage via upload URLs | Phones upload directly, so no request-size limit on our side |
| AI | Gemini API, `gemini-3.8-flash`, `@google/genai` SDK, `generateContent` call, inside a Convex action | Reads images and frames; JSON-schema output |
| Validation | Zod for Gemini output; Convex validators for the database | Bad AI output never reaches the database |
| Geocoding | Nominatim (OpenStreetMap), called from a Convex action | Free; about 1 request per second |
| Map display | Leaflet with `react-leaflet` and OpenStreetMap tiles | Free; no key |
| Nearby queries | `@convex-dev/geospatial` component (beta) | Nearest deals to the viewer; fallback is sorting recent deals in the browser |
| Time logic | `date-fns` and `date-fns-tz` | Overnight hours and day boundaries |
| Installable app | Web app manifest with `share_target`, plus `public/sw.js` | DishDeals in the Android share sheet |
| Payments (parallel) | Solana Pay transfer link as a QR code, Solana devnet | MLH Best Use of Solana |
| Tests | Vitest | Fast unit tests for `lib/` |
| Hosting | Vercel, deploying with `npx convex deploy --cmd "npm run build"`; optional dishdeals.tech domain | Deploys frontend and backend together |

## Architecture

One post runs through Convex twice, once to read the image with Gemini and once to place the pin, and then appears on every open feed. Gemini only extracts; validity, price filtering, distance and sorting are our own code.

&#91;embedded content: post flow · 8 steps across phone, Convex, Gemini and Nominatim\]

API keys live only in the Convex dashboard; the browser never sees them.

**Pages**

| Route | Purpose | Signed in? |
| --- | --- | --- |
| `/` | Feed: price filter, valid-now first, then nearest | No (posting and voting need it) |
| `/post` | Upload or camera, extract, edit fields, confirm pin, publish | Yes |
| `/deal/[id]` | Image, all fields, map, poster, votes, directions, tip | No (voting and tipping need it) |
| `/profile` | Display name, wallet address, my posts | Yes |
| `/signin` | Sign up and sign in | No |

**Getting a deal in**

- Instagram's own share button sends a link, not the media, and we never read Instagram links. The demo flow is: screenshot or screen-record in Instagram, then share that file to DishDeals from Android's screenshot preview.
- The manifest's `share_target` posts the file to `/share-target`; `public/sw.js` catches that request, stores the file in the Cache API, and redirects to `/post?shared=1`, which loads it.
- `/post` also has file upload, the camera (`<input type="file" accept="image/*" capture="environment">`) and a caption box.
- `lib/image.ts` resizes images to 1,280 px wide and pulls 3 to 4 frames from a screen recording with a canvas before upload.

**Live feed**

- The feed subscribes to `deals.listNearby`; Convex re-runs it whenever a deal or vote changes, so new posts appear without refreshing.
- The browser then applies `validNow` and the price filter and sorts, because Convex queries should not depend on the current time.

**Demo safety:** before calling `extractDeal`, `/post` hashes the file with SHA-256 in the browser. If `fixtures/demo/<hash>.json` exists, it uses that result and still plays the reveal animation, so the demo survives a slow or failed Gemini call.

## Data model

Three tables plus Convex Auth's own; this file is the contract every ticket builds on. Convex adds `_id` and `_creationTime` to every row; sort the feed by `_creationTime` and do not add a `createdAt` field.

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables, // includes the users table

  profiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(),           // 2 to 24 characters
    walletAddress: v.optional(v.string()), // Solana address, devnet
  }).index("by_user", ["userId"]),

  deals: defineTable({
    authorId: v.id("users"),
    restaurant: v.string(),
    address: v.optional(v.string()),
    dealText: v.string(),
    priceCad: v.optional(v.number()),   // missing = price varies
    validDays: v.array(v.string()),      // "mon".."sun"; empty = every day
    validStart: v.optional(v.string()),  // "HH:MM"; missing = all day
    validEnd: v.optional(v.string()),    // "HH:MM"; earlier than start = past midnight
    expiresOn: v.optional(v.string()),   // "YYYY-MM-DD"
    conditions: v.array(v.string()),
    lat: v.number(),
    lng: v.number(),
    imageId: v.optional(v.id("_storage")),
    sourceUrl: v.optional(v.string()),
    stillOnCount: v.number(),
    expiredCount: v.number(),
  }).index("by_author", ["authorId"]),

  votes: defineTable({
    dealId: v.id("deals"),
    userId: v.id("users"),
    value: v.union(v.literal("still_on"), v.literal("expired")),
  }).index("by_deal_user", ["dealId", "userId"]),
});
```

Gemini returns `null` for missing fields; convert `null` to `undefined` before inserting, because Convex optional fields reject `null`.

## Backend functions

Every Convex function, with its exact name; the frontend calls them as `api.<file>.<name>`. "Auth" means the function throws `Not signed in` when there is no user.

| Function | Type | Arguments | Returns | Auth |
| --- | --- | --- | --- | --- |
| `users.me` | query | none | `{ userId, displayName, walletAddress }` or `null` | Optional |
| `users.upsertProfile` | mutation | `{ displayName, walletAddress? }` | profile id | Required |
| `deals.generateUploadUrl` | mutation | none | upload URL string | Required |
| `extract.extractDeal` | action (Node) | `{ imageIds: Id<"_storage">[], caption?: string }` | `DealResult` (see Gemini integration) | Required |
| `geocode.geocode` | action | `{ query: string }` | up to 5 `{ lat, lng, label }` inside Metro Vancouver | Required |
| `deals.create` | mutation | all deal fields except `authorId` and counts | deal id; also inserts the point into the geospatial index | Required, profile must exist |
| `deals.update` | mutation | `{ dealId, ...fields }` | none | Author only |
| `deals.remove` | mutation | `{ dealId }` | none; also removes the geospatial point | Author only |
| `deals.listNearby` | query | `{ lat, lng, maxKm }` | up to 50 deals with `distanceKm`, `authorName`, `imageUrl` | Optional |
| `deals.listRecent` | query | `{ limit }` | newest deals, same shape | Optional; fallback when location is denied |
| `deals.get` | query | `{ dealId }` | one deal, same shape, plus `authorWallet` and the viewer's vote | Optional |
| `votes.cast` | mutation | `{ dealId, value }` | none; one vote per user per deal, changing it updates both counts | Required |
| `seed.seedDeals` | internal mutation | none | inserts `fixtures/seed.json`; run with `npx convex run seed:seedDeals` | Internal |

Shared browser code in `lib/`: `validNow(deal, now)` returns `{ status: "valid" | "later_today" | "not_today" | "expired" | "unknown", minutesLeft?: number }`; `distanceKm(a, b)` uses the haversine formula; `resizeImage(file)` and `grabFrames(videoFile, 4)` live in `lib/image.ts`.

## Gemini integration

The `extract.extractDeal` action reads the uploaded images from Convex storage, sends them with the caption to `gemini-3.8-flash`, and returns JSON that must pass the Zod schema.

**API choice:** `generateContent`. Google recommends the Interactions API for new projects but says `generateContent` remains fully supported, and its image and JSON-schema options are the best documented. If you switch to Interactions, set `store=false`.

**`lib/dealSchema.ts`** (field names match the database)

```ts
import { z } from "zod";

export const Deal = z.object({
  restaurant: z.string(),
  address: z.string().nullable(),
  dealText: z.string(),
  priceCad: z.number().nullable(),
  validDays: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])),
  validStart: z.string().nullable(), // "HH:MM"
  validEnd: z.string().nullable(),
  expiresOn: z.string().nullable(),  // "YYYY-MM-DD"
  conditions: z.array(z.string()),
  confidence: z.object({
    restaurant: z.number(), priceCad: z.number(),
    hours: z.number(), expiresOn: z.number(),
  }),
});

export const DealResult = z.object({ isDeal: z.boolean(), deals: z.array(Deal) });
export type DealResult = z.infer<typeof DealResult>;
```

**`convex/extract.ts`**, a sketch to check against Google's and Convex's current docs

```ts
"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { DealResult } from "../lib/dealSchema";
import { SYSTEM_PROMPT } from "../lib/prompt";

export const extractDeal = action({
  args: { imageIds: v.array(v.id("_storage")), caption: v.optional(v.string()) },
  handler: async (ctx, { imageIds, caption }) => {
    if (!(await getAuthUserId(ctx))) throw new Error("Not signed in");
    const parts = [];
    for (const id of imageIds) {
      const blob = await ctx.storage.get(id);
      if (blob) parts.push({ inlineData: { mimeType: blob.type,
        data: Buffer.from(await blob.arrayBuffer()).toString("base64") } });
    }
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const res = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [...parts, { text: `Caption: ${caption ?? ""}\nToday (Vancouver): ${today}` }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(DealResult),
      },
    });
    return DealResult.parse(JSON.parse(res.text ?? "{}"));
  },
});
```

**System prompt rules (`lib/prompt.ts`)**

- Extract only what the images or caption state; never guess a price, time or date.
- Use null for missing fields, 24-hour times, and convert relative dates ("this Friday") using the date given.
- Set `isDeal` to false when there is no offer; return one entry per deal when there are several.
- Give a 0 to 1 confidence for restaurant, price, hours and expiry. The card highlights any field under 0.6.

**Fallbacks, in order:** retry once; then `gemini-3.5-flash-lite`; then a demo fixture; then manual entry on the card.

## Maps and location

Every deal stores a latitude and longitude that the poster confirmed on a map; geocoding only proposes the pin.

- **Geocoding:** `geocode.geocode` calls Nominatim, OpenStreetMap's free geocoder. Its public server allows about 1 request per second and needs an identifying User-Agent and attribution. Search only inside Metro Vancouver so a name like "Pho Hoa" does not match another city.
- **Map:** `components/DealMap.tsx` uses `react-leaflet` with OpenStreetMap tiles and a draggable marker. Load it with `next/dynamic` and `ssr: false`, because Leaflet needs the browser window. Import `leaflet/dist/leaflet.css`, and set the default marker icon images by hand, because bundlers break Leaflet's default icon paths.
- **Nearby:** `deals.create` inserts each deal into the `@convex-dev/geospatial` index; `deals.listNearby` calls its `queryNearest` with the viewer's location and a maximum distance. The component is in beta: if it fails, `listNearby` falls back to the 200 newest deals and the browser sorts by `distanceKm`.
- **Directions:** a plain Google Maps link built from the coordinates; no key needed.
- **Seed deals** ship with coordinates, so the demo never waits on Nominatim.

```ts
// convex/geocode.ts (sketch)
import { action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const geocode = action({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    if (!(await getAuthUserId(ctx))) throw new Error("Not signed in");
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({
      q: query, format: "jsonv2", limit: "5",
      viewbox: "-123.30,49.40,-122.70,49.00", // Metro Vancouver
      bounded: "1",
    }).toString();
    const r = await fetch(url, {
      headers: { "User-Agent": `DishDeals-StormHacks (${process.env.CONTACT_EMAIL})` },
    });
    const rows: { lat: string; lon: string; display_name: string }[] = await r.json();
    return rows.map((x) => ({ lat: Number(x.lat), lng: Number(x.lon), label: x.display_name }));
  },
});
```

## Solana tipping

Tipping lets any member thank a deal's poster, which targets the MLH Best Use of Solana prize; it is one ticket (T-15), built in parallel and cut at hour 14 if it does not work end to end.

- **Where:** `/deal/[id]` shows a Tip button when the poster has a `walletAddress` on their profile.
- **How:** `components/TipQR.tsx` builds a Solana Pay transfer link, `solana:<poster wallet>?amount=0.01&reference=<one-time public key>&label=DishDeals&message=Thanks%20for%20the%20deal`, and shows it as a QR code with the `qrcode` package. It then checks Solana devnet every 2 seconds for a transaction that includes the reference key and shows "Tip received" with an explorer link.
- **Libraries:** a Solana JavaScript client for the lookup; check the current Solana Pay docs for which helper package is maintained.
- **Human steps before hour 10:** switch a phone wallet (Phantom or Solflare) to devnet, get devnet SOL from a faucet early because faucets limit requests, and complete one tip end to end.

## Task breakdown

Build the post flow end to end first (T-07), then widen it; any ticket whose dependencies are merged can start. Owners assume four roles; one person can hold two.

Owners: **F** frontend, **A** AI and integration, **L** logic, maps and Solana, **P** pitch, design and data. Hours are working hours.

**Phase 1: Setup (hours 0 to 2)**

| ID | Ticket and files | Owner | Type | Hours | Depends on | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| T-01 | Scaffold Next.js with Tailwind, palette and fonts; add Convex and its provider in `app/layout.tsx`; deploy to Vercel with `npx convex deploy --cmd "npm run build"` | F | HITL | 1 | None | The Vercel HTTPS URL shows "DishDeals" and renders data from a Convex test query |
| T-02 | `convex/schema.ts` exactly as in Data model; `lib/dealSchema.ts` exactly as in Gemini integration | A | AFK | 0.5 | T-01 | `npx convex dev --once` succeeds; Zod types compile |
| T-03 | Convex Auth (Password provider); `/signin`, `/profile`; `users.me`, `users.upsertProfile` | F | HITL | 2 | T-01, T-02 | On a phone: sign up, set a display name, reload, still signed in |
| T-04 | `lib/validNow.ts`, `lib/distance.ts`, `lib/validNow.test.ts` | L | AFK | 2 | T-02 | Tests pass for valid, later today, not today, past midnight, expired, no expiry, no hours |
| T-05 | `convex/extract.ts` and `lib/prompt.ts`; human sets `GEMINI_API_KEY` | A | HITL | 1.5 | T-02 | Returns schema-valid `DealResult` for 3 sample images; latency recorded in the PR |
| T-06 | Collect 10 real deals near SFU and 2 flyer photos; write `fixtures/seed.json` with coordinates | P | HITL | 2 | T-02 | All 10 entries pass the Zod schema and have `lat` and `lng` |

**Phase 2: Vertical slices (hours 2 to 12)**

| ID | Ticket and files | Owner | Type | Hours | Depends on | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| T-07 | Post flow: `/post` upload or camera, `lib/image.ts` resize, `deals.generateUploadUrl`, `extractDeal`, editable card with `ConfidenceField`, then T-08's pin step, then `deals.create` | F + A | HITL | 4 | T-03, T-05 | On a phone, a screenshot becomes a published deal in under 15 seconds and shows in the Convex dashboard |
| T-08 | `convex/geocode.ts`; `components/DealMap.tsx` with draggable pin | L | AFK | 2 | T-02 | A known Burnaby restaurant name returns a pin in Burnaby; dragging updates the coordinates |
| T-09 | Geospatial index in `convex.config.ts` and `deals.create`; `deals.listNearby`, `deals.listRecent`; feed `/` with `PriceFilter`, `TimeBadge`, `DealCard` | F | AFK | 3 | T-04, T-07 | With seed data, "under $10" shows only matching deals; badges are correct; a post on device A appears on device B without refresh |
| T-10 | `/deal/[id]`: image, fields, map, poster name, directions link, edit and delete for the author; `deals.get`, `deals.update`, `deals.remove` | F | AFK | 2 | T-07, T-08 | Author can edit and delete; others cannot |
| T-11 | `votes.cast` and vote buttons on `/deal/[id]` and `DealCard` | L | AFK | 1 | T-10 | One vote per user per deal; changing a vote updates both counts |
| T-12 | `convex/seed.ts` loading `fixtures/seed.json` plus 2 team profiles with devnet wallets | A + P | AFK | 1 | T-06, T-09 | `npx convex run seed:seedDeals` fills the feed |
| T-13 | `public/manifest.webmanifest` with `share_target`, `public/sw.js` | A | HITL | 2.5 | T-07 | On Android, sharing a screenshot opens `/post` with the image loaded |
| T-14 | `grabFrames` for screen recordings; field-by-field reveal animation on the card | F | AFK | 1.5 | T-07 | A 10-second recording yields 4 frames; fields appear one by one |
| T-15 | Solana tipping: wallet field on `/profile`, `components/TipQR.tsx` | L | HITL | 4 | T-03, T-10 | A devnet tip from a phone wallet shows "Tip received"; cut at hour 14 if not |

**Phase 3: Hardening and submission (hours 12 to 22)**

| ID | Ticket and files | Owner | Type | Hours | Depends on | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| T-16 | Demo fixtures: run the demo images through `extractDeal`, save `fixtures/demo/<sha256>.json`; `/post` checks the hash first | A | AFK | 1 | T-07 | Demo images produce cards with the Gemini key removed |
| T-17 | Edge-case pass (see Edge cases, tests and risks) | Everyone | HITL | 2 | Phase 2 | Every row in the edge-case table checked on a phone |
| T-18 | Loading, empty and error states; polish to the locked style | P + F | HITL | 2 | T-09, T-10 | No blank screens on slow networks; matches FigJam references |
| T-19 | `README.md` (setup, stack, libraries); Devpost write-up; demo video of 3 minutes maximum | P | HITL | 3 | Phase 2 | Video plays logged out; README setup works on a clean clone |
| T-20 | Claim a .tech domain through MLH and point it at Vercel | F | HITL | 0.5 | T-01 | The domain loads the app over HTTPS |
| T-21 | Stretch: full-screen map of the feed | L | AFK | 2 | Checkpoint B | Pins match the feed's filter |

## Timeline

The checkpoint that matters most: by hour 6, a signed-in member posts a deal from a phone (T-07). Hour 0 is when hacking starts; write the real clock times in once you know them.

1. **Hours 0 to 1:** Before you build checks; T-01 and T-02. P starts T-06 right away.
2. **Hours 1 to 4:** T-03 auth, T-04 logic, T-05 Gemini, T-08 geocoding and map, all in parallel.
3. **Hour 6, checkpoint A:** T-07 passes on a phone. If not, everyone stops and fixes it.
4. **Hours 6 to 12:** T-09 feed, T-10 deal page, T-11 votes, T-12 seed, T-13 share target, T-14 frames and animation. T-15 Solana runs in parallel.
5. **Hour 12, checkpoint B:** acceptance criteria 1 to 6 and 8 pass. Feature freeze; stretch work starts only now.
6. **Hour 14:** Solana keep-or-cut decision.
7. **Hours 12 to 18:** T-16 demo fixtures, T-17 edge cases, T-18 polish. Sleep in shifts of 2 to 3 hours.
8. **Hours 18 to 21:** T-19 video, README and Devpost; T-20 domain.
9. **Hours 21 to 23:** bug fixes only; rehearse the pitch three times.
10. **At least 1 hour before the deadline:** submit, then check the video plays logged out.

## Edge cases, tests and risks

The biggest risks are the live post failing on stage and auth setup eating the morning; T-16 fixtures, the demo video and the 90-minute auth fallback cover them.

**Edge cases**

| # | Edge case | Handling |
| --- | --- | --- |
| 1 | Image is not a deal | `isDeal: false`; show "No deal found" and offer manual entry |
| 2 | No expiry stated | Show "No expiry listed"; sort below deals valid now |
| 3 | Hours past midnight (9 pm to 1 am) | `validEnd` earlier than `validStart` means the next day; unit-tested |
| 4 | Several deals in one image | One card each; the poster publishes each separately |
| 5 | Price missing or not in dollars ("2 for 1") | `priceCad` missing; shown under every price filter as "price varies" |
| 6 | Low-confidence field | Highlighted under 0.6; must be confirmed before publishing |
| 7 | Geocoder finds nothing | Pin starts at the viewer's location; poster drags it |
| 8 | Location permission denied | Feed uses `deals.listRecent`; distance hidden |
| 9 | Gemini error, timeout or rate limit | Retry once, then the fallbacks in Gemini integration |
| 10 | Signed-out user taps Post, Vote or Tip | Redirect to `/signin`, then back |
| 11 | Poster has no wallet address | Hide the Tip button |
| 12 | Same deal posted twice | Show recent nearby deals with the same restaurant before publishing |

**Tests**

- Unit (Vitest): `validNow` for every status, `distanceKm`, and the Zod schema rejecting malformed output.
- Integration: `extractDeal` returns valid results for the 3 sample images (T-05).
- Manual: the demo on two phones and a laptop; a share from a real Instagram screenshot; a signed-out user hitting each protected action.

**Risk flags**

- **Auth setup time:** switch to the Anonymous provider plus display name if Password setup passes 90 minutes.
- **Instagram shares links, not media:** the demo uses screenshots and recordings; never scrape.
- **iOS:** web apps cannot join the iOS share sheet as far as we know; demo on Android, with upload as a fallback.
- **Time in queries:** Convex queries should not depend on the current time; `validNow` runs in the browser.
- **Geospatial component is beta:** fallback is `listRecent` plus browser sorting.
- **Network needed:** a live feed requires internet; bring a phone hotspot.
- **Nominatim limits:** about 1 request per second; geocode only when the poster taps Find, and pre-geocode seed deals.
- **Key leak:** keys only in the Convex dashboard; `.env*` never committed.
- **Solana eats time:** one owner, hard cut at hour 14.

## Demo script and Q&A

The live demo runs 2 minutes on two phones and a laptop, with the first post inside 30 seconds; the 3-minute video follows the same script.

1. **0:00 to 0:15, the problem:** "Food deals are scattered across Instagram and campus flyers, and you never know which are still on."
2. **0:15 to 0:50, Wow 1:** on phone A, screenshot a deal in Instagram, share it to DishDeals, watch the card build itself, confirm the pin, and publish. It appears on the laptop's feed instantly.
3. **0:50 to 1:10, the flyer:** phone B photographs a real flyer from an SFU board and publishes a second deal.
4. **1:10 to 1:35, Wow 2:** set the filter to "under $10". Point at "Valid now · 0.8 km · ends in 2 h" and at a weekday-only deal that is greyed out. Vote one deal "still on".
5. **1:35 to 1:50, the tech:** Gemini reads images into a strict schema; Convex makes the feed live; our code decides what is valid now.
6. **1:50 to 2:00, close:** tip the poster with a Solana Pay QR, if that shipped.

**Likely judge questions**

- *Apps like Clipmap already save places from reels.* They are personal lists of places; DishDeals is a shared, live feed of deals with prices, hours and community checks.
- *What stops spam or fake deals?* Gemini must recognise a deal before the form appears, posting needs an account, and members vote deals expired.
- *What if Gemini gets it wrong?* Low-confidence fields are highlighted and must be confirmed.
- *How do you get Instagram content?* Users share a screenshot or recording; we never scrape.
- *What does Gemini do versus your code?* Gemini extracts; our code validates, places, filters, sorts and decides validity.
- *How would it grow?* Following favourite finders, expiry reminders, and restaurants posting their own verified deals.

## Submission checklist

- [ ] Devpost project saved as a draft by hour 18.
- [ ] Project link: public GitHub repo with the README from T-19.
- [ ] Demo video, 3 minutes maximum, playable while logged out.
- [ ] Live app link (Vercel or the .tech domain) with 2 demo accounts listed for judges.
- [ ] Prize tracks selected: Gemini API, Solana (only if it shipped), .Tech Domain.
- [ ] "Built with" lists Next.js, Convex, Convex Auth, Gemini API, Leaflet, OpenStreetMap and Nominatim, Zod, Solana Pay.
- [ ] One or two presenters chosen and rehearsed.

## Sources

- [StormHacks 2026 on Devpost](https://stormhacks2026.devpost.com/): dates, eligibility, submission requirements, judging criteria, MLH prizes.
- [Gemini API: Interactions API overview](https://ai.google.dev/gemini-api/docs/interactions-overview): model IDs including `gemini-3.8-flash`, `generateContent` status, storage defaults.
- [Gemini API: Grounding with Google Maps](https://ai.google.dev/gemini-api/docs/maps-grounding): the stretch "verified" badge.
- [Convex pricing](https://www.convex.dev/pricing): free-plan features and limits.
- [Convex geospatial component](https://github.com/get-convex/geospatial): `insert` and `queryNearest`.
- Existing place-saver apps: [Clipmap](https://play.google.com/store/apps/details?id=com.ishankgp.videomap&hl=en), [MunchMap](https://munch-map.app/), [glide](https://www.justglide.ai/vs/find-places-from-instagram-reels).
