// Pure bindings between the private Reel review and the canonical community publish / geocode APIs
// (N-FORM-C). No React, Convex or window access. Nothing here validates deal fields a second time:
// the canonical gate is lib/dealDraft's buildPublishFields (run on the live draft before any call) and the
// backend re-authorizes and re-validates independently. A private save, a model suggestion or a link
// receipt is never treated as a community publish: only a genuine deals.create id is a receipt.
import type { DealDraft, PublishFields } from "../dealDraft";

// ------------------------------------------------------- stable per-offer keys

export const MAX_OFFERS = 10;
export type OfferEntry = { key: string; draft: DealDraft };
export type OfferList = { entries: OfferEntry[]; nextId: number };

const keyFor = (n: number) => `offer-${n}`;

/** Wrap drafts with fresh, never-reused keys. */
export function offerListFrom(drafts: DealDraft[], start = 0): OfferList {
  return { entries: drafts.map((draft, i) => ({ key: keyFor(start + i), draft })), nextId: start + drafts.length };
}
/** Append drafts as new offers; every existing offer keeps its key (so its form stays mounted). */
export function appendOffers(list: OfferList, drafts: DealDraft[]): OfferList {
  const room = Math.max(0, MAX_OFFERS - list.entries.length);
  const added = drafts.slice(0, room).map((draft, i) => ({ key: keyFor(list.nextId + i), draft }));
  return { entries: [...list.entries, ...added], nextId: list.nextId + added.length };
}
/** Remove one offer by key; the others keep their keys. The last offer cannot be removed. */
export function removeOffer(list: OfferList, key: string): OfferList {
  if (list.entries.length <= 1) return list;
  return { ...list, entries: list.entries.filter(e => e.key !== key) };
}
/** Change the draft of the offer with this key only. */
export function updateOffer(list: OfferList, key: string, change: (draft: DealDraft) => DealDraft): OfferList {
  return { ...list, entries: list.entries.map(e => (e.key === key ? { key, draft: change(e.draft) } : e)) };
}
/** Deliberately replace every offer (Load latest, use model suggestions): all forms are intentionally re-created. */
export function replaceOffers(list: OfferList, drafts: DealDraft[]): OfferList {
  return offerListFrom(drafts, list.nextId);
}
/** The live draft for an offer key, never an index that may have gone stale. */
export function liveDraft(list: OfferList, key: string): DealDraft | undefined {
  return list.entries.find(e => e.key === key)?.draft;
}
/** Active index after removing `removedIndex`, kept inside the new bounds. */
export function activeAfterRemove(active: number, removedIndex: number, newLength: number): number {
  const next = removedIndex < active ? active - 1 : active;
  return Math.max(0, Math.min(next, newLength - 1));
}
/** Apply a late-extraction plan: append mode never touches existing keys; replace mode re-creates all. */
export function applyLatePlan(list: OfferList, plan: { mode: "replace" | "append"; drafts: DealDraft[] }): OfferList {
  return plan.mode === "replace" ? replaceOffers(list, plan.drafts) : appendOffers(list, plan.drafts.slice(list.entries.length));
}

// ------------------------------------------------------------ publish gating

export type PreconditionInput = { available: boolean; unavailableReason: string; alreadyPublished: boolean; versionChanged: boolean; inFlight: boolean; offerExists: boolean };

/** Review-level reasons not to start a publish, in the order the user should fix them; null when clear. */
export function publishPreconditionError(i: PreconditionInput): string | null {
  if (!i.available) return i.unavailableReason;
  if (i.alreadyPublished) return "This offer is already published. Open it from the links below.";
  if (i.versionChanged) return "This draft changed elsewhere. Choose Load latest or Keep my edits first.";
  if (i.inFlight) return "A publish is already in progress.";
  if (!i.offerExists) return "That offer is no longer in this review.";
  return null;
}

export class PublishBlocked extends Error {}

export type GateInput = {
  isLoading: boolean;
  isAuthenticated: boolean;
  /** users.me: undefined while loading, null when signed out or no profile yet. */
  me: unknown | null | undefined;
};

/** Why publishing is not possible right now, or null. Uses the real session and profile, never preview state. */
export function publishGateMessage(input: GateInput): string | null {
  if (input.isLoading) return "Checking your account…";
  if (!input.isAuthenticated) return "Sign in to publish.";
  if (input.me === undefined) return "Checking your profile…";
  if (input.me === null) return "Create your profile first (open Profile), then publish.";
  return null;
}

// A failed or lost response does not prove nothing was created, so this never claims it. The edits are kept.
export const GENERIC_PUBLISH_ERROR = "Publishing could not be confirmed, so the deal may or may not have been published. Your edits are kept. Check the map or your deals before trying again.";
const ID_SHAPE = /^[A-Za-z0-9]{10,64}$/;
export const isStorageIdShape = (value: unknown): value is string => typeof value === "string" && ID_SHAPE.test(value);

export class PublishBindingError extends Error {}

/** Exactly the arguments of deals.create: no author, no counts, no confidence, no nulls. */
export type CreateArgs = {
  restaurant: string; dealText: string; validDays: string[]; conditions: string[]; lat: number; lng: number;
  address?: string; priceCad?: number; validStart?: string; validEnd?: string; expiresOn?: string; imageId?: string; sourceUrl?: string;
};

/**
 * PublishFields to the exact mutation arguments. `null`/`undefined` optionals are omitted. The source link is
 * the owned private item's link. The uploaded video id is never an image id: an imageId is passed on only if it
 * has a storage-id shape and is not the item's video.
 */
export function toCreateArgs(fields: PublishFields, item: { sourceUrl: string; videoId?: string | null }): CreateArgs {
  const f = fields as PublishFields & Record<string, unknown>;
  const out: CreateArgs = { restaurant: f.restaurant, dealText: f.dealText, validDays: [...f.validDays], conditions: [...f.conditions], lat: f.lat, lng: f.lng };
  const set = <K extends keyof CreateArgs>(key: K, value: CreateArgs[K] | null | undefined) => { if (value !== null && value !== undefined) out[key] = value; };
  set("address", f.address);
  set("priceCad", f.priceCad);
  set("validStart", f.validStart);
  set("validEnd", f.validEnd);
  set("expiresOn", f.expiresOn);
  set("sourceUrl", item.sourceUrl);
  if (f.imageId !== undefined && f.imageId !== null) {
    if (!isStorageIdShape(f.imageId) || (item.videoId && f.imageId === item.videoId)) throw new PublishBindingError("This draft has no valid image to attach.");
    out.imageId = f.imageId;
  }
  return out;
}

export type PublishReceipt = { dealId: string; dealPath: string; mapPath: string };

/** A receipt exists only for a genuine canonical deal id. */
export function receiptFor(dealId: unknown): PublishReceipt | null {
  if (!isStorageIdShape(dealId)) return null;
  return { dealId, dealPath: `/deal/${dealId}`, mapPath: `/map?deal=${dealId}` };
}

/** One publish at a time for the whole review (double-click and concurrent-offer safe). */
export class PublishGuard {
  private busy = false;
  tryStart(): boolean { if (this.busy) return false; this.busy = true; return true; }
  finish(): void { this.busy = false; }
  get inFlight(): boolean { return this.busy; }
}

export type PublishDeps = {
  gate: () => GateInput;
  create: (args: CreateArgs) => Promise<unknown>;
  item: () => { sourceUrl: string; videoId?: string | null };
  guard: PublishGuard;
};

/**
 * Publish already-gated fields. Account and profile are checked first, then single-flight, then the create call.
 * Gate and binding messages are returned as-is; every other failure becomes one generic message so no backend
 * detail leaks. Nothing is written to the private item or its saved state here.
 */
export function createPublishHandler(deps: PublishDeps): (fields: PublishFields) => Promise<PublishReceipt> {
  return async fields => {
    const blocked = publishGateMessage(deps.gate());
    if (blocked) throw new PublishBlocked(blocked);
    if (!deps.guard.tryStart()) throw new PublishBlocked("A publish is already in progress.");
    try {
      const receipt = receiptFor(await deps.create(toCreateArgs(fields, deps.item())));
      if (!receipt) throw new Error("no receipt");
      return receipt;
    } catch (error) {
      if (error instanceof PublishBlocked || error instanceof PublishBindingError) throw error;
      throw new Error(GENERIC_PUBLISH_ERROR);
    } finally {
      deps.guard.finish();
    }
  };
}

// ------------------------------------------------------------- geocode search

export type Candidate = { lat: number; lng: number; label: string };
export const SEARCH_ERROR = "Location search is unavailable. Try again, or place the pin by hand.";

/** Genuine geocoder candidates only: at most 5, finite in-range coordinates, non-blank labels. Anything else is dropped. */
export function parseCandidates(raw: unknown): Candidate[] {
  if (!Array.isArray(raw)) throw new Error(SEARCH_ERROR);
  const out: Candidate[] = [];
  for (const c of raw.slice(0, 5)) {
    const r = c as Partial<Candidate> | null;
    if (r && typeof r.lat === "number" && typeof r.lng === "number" && typeof r.label === "string" && r.label.trim()
      && Number.isFinite(r.lat) && Number.isFinite(r.lng) && Math.abs(r.lat) <= 85.05112878 && Math.abs(r.lng) <= 180) {
      out.push({ lat: r.lat, lng: r.lng, label: r.label });
    }
  }
  return out;
}

/**
 * Client-owned wording for the geocoder's known error codes. The server's message text is never shown: only the
 * code is read, and only if it is in this list. An unknown code, a missing code or any other error gets the
 * generic message, so nothing a failing server or provider put in an error can reach the screen.
 */
export const SEARCH_MESSAGES: Record<string, string> = {
  NOT_SIGNED_IN: "Sign in to search for a location.",
  INVALID_QUERY: "Enter a place name or address of 2 to 120 characters.",
  CONFIGURATION_ERROR: "Location search is not enabled on this server.",
  RATE_LIMITED: "Location search is busy. Try again shortly.",
  PROVIDER_TIMEOUT: "Location search timed out. Try again.",
  PROVIDER_UNAVAILABLE: "Location search is unavailable. Try again later.",
  PROVIDER_ERROR: "Location search could not complete.",
  INVALID_RESPONSE: "Location search returned an unusable answer.",
  GEOCODE_FAILED: "Location search failed.",
};

export function searchErrorMessage(error: unknown): string {
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code;
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(SEARCH_MESSAGES, code) ? SEARCH_MESSAGES[code] : SEARCH_ERROR;
}

/** Explicit-Find search callback for the location picker around api.geocode.geocode. No debounce or autocomplete. */
export function createSearch(call: (query: string) => Promise<unknown>): (query: string) => Promise<Candidate[]> {
  return async query => {
    try { return parseCandidates(await call(query)); }
    catch (error) { throw new Error(searchErrorMessage(error)); }
  };
}
