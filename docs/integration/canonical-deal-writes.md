# Canonical deal writes and the geospatial index (T-09C)

Backend only. The form, map and upload path are separate slices. Nothing here was run against a deployment.

## API (all in `convex/deals.ts`; `get`, `listRecent` and `votes.cast` are unchanged)
| Function | Auth | Arguments | Result |
| --- | --- | --- | --- |
| `deals.create` | signed in, exactly one profile | `restaurant, address?, dealText, priceCad?, validDays, validStart?, validEnd?, expiresOn?, conditions, lat, lng, imageId?, sourceUrl?` | deal id |
| `deals.update` | author, with profile | `{dealId, ...same fields}` full replacement; omitted optionals are cleared | `null` |
| `deals.remove` | author, with profile | `{dealId}` | `null` |
| `deals.listNearby` | optional | `{lat, lng, maxKm}` | up to 50 deals, nearest first, each with `authorName?`, `imageUrl`, `distanceKm` |

No author, count, confidence or review-status argument exists; the server derives `authorId` and starts both counts at 0. Optional fields are omitted when absent (never `null`); passing `null` is rejected by the argument validators. The server never records that a model value was human-confirmed; that gate belongs to the form.

## Field rules (`lib/dealWrite.ts`)
Restaurant and deal text: trimmed, non-blank, at most 200 / 2,000 characters. Address optional, at most 500 (blank is omitted). Price: finite, 0 to 100,000 CAD. Valid days: `mon`..`sun`, no duplicates. Hours: both or neither, `HH:MM` 00:00 to 23:59 (no 24:00). Expiry: a real `YYYY-MM-DD`. Conditions: at most 20, each trimmed, non-blank, at most 300. Source link: plain `http`/`https`, no credentials or whitespace, at most 2,048. Coordinates: finite, `|lat| <= 85.05112878`, `|lng| <= 180`.

## Geospatial index (`@convex-dev/geospatial` 0.2.1, exact)
`app.use(geospatial)` in `convex/convex.config.ts` beside the workflow component. One point per deal: key = the deal id, coordinates `{latitude: lat, longitude: lng}`, no filter keys, sort key = the deal's creation time. `create`, `update` and `remove` write the canonical row and the point in one transaction, so an index failure rolls the publish back (tested with a narrow failure spy). `update` re-inserts the point (the component replaces an existing key). `listNearby` uses `nearest` with `maxDistance = maxKm * 1000` metres (`queryNearest` is deprecated and not used), reloads each canonical deal, skips index keys with no canonical deal, recomputes `distanceKm` from the viewer and the stored lat/lng with the shared haversine helper, drops anything beyond `maxKm`, breaks ties by id, and takes 50.

If the component call fails, `listNearby` falls back to the 200 newest canonical deals, filtered and ranked by true distance with the same rules. This fallback also lists deals that were never indexed; it never reports index success. A record with corrupt coordinates is skipped, not guessed. Validity is not computed on the server.

`maxKm` must be above 0 and at most 50; coordinates must be finite and inside the map limits.

## Private image registry
New table `dealUploads {ownerId, storageId, expiresAt, published}` with `by_storage` and `by_expiry`; `deals` gains `by_image(imageId)`. No public function creates a registry row: the authenticated upload path (a later slice, T-07B) will. For `create`/`update`, an `imageId` is accepted only if exactly one registry row exists for it, owned by the caller, unexpired or already published, and the stored file is 1 byte to 5 MiB with an allowed image content type if one is recorded. The row is marked `published` in the same transaction. The same owner may reuse one image across offers. Replacing or clearing an image on `update`, or `remove`, deletes the storage file and registry row only when no saved deal still references it.

Limits of this check: a mutation cannot read file bytes, so signature validation must happen in the upload slice; convex-test does not record a content type, so the recorded-content-type branch is not exercised by tests.

## Remove and votes
`remove` deletes the deal's votes (at most 2,000) in the same transaction as the point and the deal. A deal with more votes than that is refused with no change rather than leaving orphan votes; supporting such deals needs a separately authorized internal cleanup path.

## Not done / pending
Live deployment, `convex dev`/codegen (the component type registration in `_generated/api.d.ts` was added by hand), real map and form integration, the authenticated image upload and abandoned-upload cleanup (T-07B), native and cross-device behavior. The published teammate workflow branches were not merged, and nothing was synchronized over any deployed module.
