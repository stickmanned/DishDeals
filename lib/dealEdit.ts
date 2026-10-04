/**
 * Pure helpers for canonical author edit/delete controls (T-10B).
 *
 * Editing here is SAVED-DATA editing of a published canonical deal, not acceptance of model
 * predictions. Permission is decided only from the real `users.me` userId versus the canonical
 * deal `authorId` (never a display name); the backend still authorizes independently.
 * Nothing here talks to Convex: callers inject the real mutation functions.
 */

import type { Id } from "@/convex/_generated/dataModel";
import {
  buildPublishFields,
  createDraft,
  DraftValidationError,
  isCanonicalWeekday,
  validateCoordinates,
  type DealDraft,
  type Weekday,
} from "./dealDraft";
import { validatePublishFields, WriteError } from "./dealWrite";

/** The canonical `deals.get` fields this feature reads. Author and counts are never editable. */
export interface SavedDeal {
  _id: Id<"deals">;
  authorId: Id<"users">;
  restaurant: string;
  address?: string;
  dealText: string;
  priceCad?: number;
  validDays: string[];
  validStart?: string;
  validEnd?: string;
  expiresOn?: string;
  conditions: string[];
  lat: number;
  lng: number;
  imageId?: Id<"_storage">;
  sourceUrl?: string;
}

/** Exactly the arguments of the real `deals.update` mutation. No author or count fields. */
export interface DealUpdateArgs {
  dealId: Id<"deals">;
  restaurant: string;
  address?: string;
  dealText: string;
  priceCad?: number;
  validDays: string[];
  validStart?: string;
  validEnd?: string;
  expiresOn?: string;
  conditions: string[];
  lat: number;
  lng: number;
  imageId?: Id<"_storage">;
  sourceUrl?: string;
}

export const GENERIC_SAVE_ERROR =
  "Your changes could not be saved. Your edits are kept on this screen; check your connection and try again.";
export const GENERIC_DELETE_ERROR = "This deal could not be deleted. Nothing was changed. Try again.";

/** Thrown with a message that is safe to show to the user. */
export class DealEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DealEditError";
  }
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/** Minimal shape of the real `users.me` result (null when signed out or without a profile). */
export interface MeLike {
  userId: string;
}

/**
 * True only when a real signed-in `me.userId` equals the canonical `deal.authorId`.
 * Missing/empty ids, signed-out (null) and still-loading (undefined) are never authors, and
 * display names are intentionally not part of the signature, so duplicate names cannot match.
 */
export function canEditDeal(
  me: MeLike | null | undefined,
  deal: { authorId?: string | null } | null | undefined
): boolean {
  if (!me || !deal) return false;
  if (typeof me.userId !== "string" || me.userId.length === 0) return false;
  if (typeof deal.authorId !== "string" || deal.authorId.length === 0) return false;
  return me.userId === deal.authorId;
}

export type EditAccess = "loading" | "signed_out" | "forbidden" | "allowed";

/**
 * Decides what the dedicated edit route should show. `me` is undefined while its query is
 * loading and null when the user has no profile (the backend requires one to write).
 */
export function editAccess(input: {
  authLoading: boolean;
  isAuthenticated: boolean;
  me: MeLike | null | undefined;
  deal: { authorId?: string | null };
}): EditAccess {
  if (input.authLoading) return "loading";
  if (!input.isAuthenticated) return "signed_out";
  if (input.me === undefined) return "loading";
  return canEditDeal(input.me, input.deal) ? "allowed" : "forbidden";
}

// ---------------------------------------------------------------------------
// Initialization from the saved canonical deal
// ---------------------------------------------------------------------------

/**
 * Builds the editable draft from saved canonical fields. Every field starts REVIEWED because
 * these are the author's own persisted values (absent optional fields are reviewed omissions).
 * The persisted lat/lng is a confirmed location. A saved weekday outside mon..sun (should not
 * exist) is dropped and that field is left unreviewed so the author must re-confirm it.
 * The saved image id and source link are carried unchanged.
 */
export function initDraftFromSavedDeal(deal: SavedDeal): DealDraft {
  const days: Weekday[] = deal.validDays.filter(isCanonicalWeekday);
  const daysIntact = days.length === deal.validDays.length;

  const draft = createDraft({
    restaurant: deal.restaurant,
    address: deal.address ?? null,
    dealText: deal.dealText,
    priceCad: deal.priceCad ?? null,
    validDays: days,
    validStart: deal.validStart ?? null,
    validEnd: deal.validEnd ?? null,
    expiresOn: deal.expiresOn ?? null,
    conditions: [...deal.conditions],
    imageId: deal.imageId ?? null,
    sourceUrl: deal.sourceUrl ?? null,
  });

  for (const field of Object.values(draft.fields)) field.isReviewed = true;
  if (!daysIntact) draft.fields.validDays.isReviewed = false;

  try {
    validateCoordinates(deal.lat, deal.lng);
    draft.location = { lat: deal.lat, lng: deal.lng, confirmed: true };
  } catch {
    draft.location = null; // corrupt coordinates are never guessed; the author must place the pin
  }
  return draft;
}

// ---------------------------------------------------------------------------
// Request building
// ---------------------------------------------------------------------------

/**
 * Builds the exact `deals.update` arguments from the live draft.
 *
 * - Reuses the canonical `buildPublishFields` gate (review state, pending suggestions, coordinates,
 *   issues) and then the backend's own pure `validatePublishFields` as a preflight.
 * - `deals.update` is a FULL replacement: absent optional fields are cleared, so null optionals are
 *   omitted (never sent as null) and the saved image id / source link are sent back unchanged so an
 *   unchanged save keeps them. The image id can never be newly claimed from here: only the original
 *   deal's own id is ever sent.
 * - Author and vote counts are never part of the request.
 *
 * @throws DealEditError with a user-safe message when anything is unconfirmed or invalid.
 */
export function buildUpdateArgs(
  dealId: Id<"deals">,
  draft: DealDraft,
  original: Pick<SavedDeal, "imageId" | "sourceUrl">
): DealUpdateArgs {
  let fields;
  try {
    fields = buildPublishFields(draft);
  } catch (error) {
    if (error instanceof DraftValidationError) {
      throw new DealEditError(error.errors.join("; "));
    }
    throw new DealEditError("These details are not ready to save.");
  }

  const candidate = {
    restaurant: fields.restaurant,
    dealText: fields.dealText,
    validDays: [...fields.validDays],
    conditions: [...fields.conditions],
    lat: fields.lat,
    lng: fields.lng,
    ...(fields.address !== undefined ? { address: fields.address } : {}),
    ...(fields.priceCad !== undefined ? { priceCad: fields.priceCad } : {}),
    ...(fields.validStart !== undefined ? { validStart: fields.validStart } : {}),
    ...(fields.validEnd !== undefined ? { validEnd: fields.validEnd } : {}),
    ...(fields.expiresOn !== undefined ? { expiresOn: fields.expiresOn } : {}),
    ...(original.sourceUrl !== undefined ? { sourceUrl: original.sourceUrl } : {}),
  };

  let clean;
  try {
    clean = validatePublishFields(candidate);
  } catch (error) {
    throw new DealEditError(
      error instanceof WriteError ? error.message : "These details are not ready to save."
    );
  }

  return {
    dealId,
    ...clean,
    ...(original.imageId !== undefined ? { imageId: original.imageId } : {}),
  };
}

// ---------------------------------------------------------------------------
// Server round-trips (real mutation functions are injected by the component)
// ---------------------------------------------------------------------------

/**
 * Sends the update and resolves only after the server confirms it. Any rejection becomes a
 * generic error (server detail is never echoed) and the caller keeps every local edit.
 */
export async function submitDealUpdate(
  update: (args: DealUpdateArgs) => Promise<unknown>,
  args: DealUpdateArgs
): Promise<void> {
  try {
    await update(args);
  } catch {
    throw new DealEditError(GENERIC_SAVE_ERROR);
  }
}

export type DeleteOutcome = { ok: true } | { ok: false; message: string };

/**
 * Sends the delete. `ok: true` is returned ONLY after the server confirmed removal; a rejection
 * yields a generic failure (no fake success, so the caller must not navigate).
 */
export async function submitDealDelete(
  remove: (args: { dealId: Id<"deals"> }) => Promise<unknown>,
  dealId: Id<"deals">
): Promise<DeleteOutcome> {
  try {
    await remove({ dealId });
    return { ok: true };
  } catch {
    return { ok: false, message: GENERIC_DELETE_ERROR };
  }
}

// ---------------------------------------------------------------------------
// External change detection
// ---------------------------------------------------------------------------

type Comparable = Partial<
  Pick<
    SavedDeal,
    | "restaurant" | "address" | "dealText" | "priceCad" | "validDays" | "validStart" | "validEnd"
    | "expiresOn" | "conditions" | "lat" | "lng" | "imageId" | "sourceUrl"
  >
>;

/** Stable signature of every persisted editable field (absent and undefined are equal). */
export function dealSignature(deal: Comparable): string {
  return JSON.stringify([
    deal.restaurant ?? null,
    deal.address ?? null,
    deal.dealText ?? null,
    deal.priceCad ?? null,
    deal.validDays ?? null,
    deal.validStart ?? null,
    deal.validEnd ?? null,
    deal.expiresOn ?? null,
    deal.conditions ?? null,
    deal.lat ?? null,
    deal.lng ?? null,
    deal.imageId ?? null,
    deal.sourceUrl ?? null,
  ]);
}

/**
 * True when the live server copy differs from every version this editor knows about (the
 * snapshot it started from, and anything it saved itself). Used to WARN, never to overwrite.
 */
export function changedExternally(known: Comparable[], latest: Comparable): boolean {
  const latestSignature = dealSignature(latest);
  return !known.some((k) => dealSignature(k) === latestSignature);
}
