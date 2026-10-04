# Authenticated durable geocode wrapper (T-08G-B)

Backend only. The Find button, map and pin confirmation are separate. No Nominatim request has been made by this work.

## `geocode.geocode({query})` (public action)
Returns up to 5 `{lat, lng, label}` candidates inside the Metro Vancouver search envelope (`-123.35,49,-122.55,49.45`, an operational envelope, not a surveyed boundary). It only proposes pins; a person must confirm the location. An empty list means nothing was found: no pin is ever guessed. Call it only from an explicit Find button: never for autocomplete or search-as-you-type, reverse-geocoding grids, bulk seeding or source scraping.

Order of checks: signed-in caller; the server gate and identity configuration; then the reviewed `geocodeCore` (query validation 2 to 120 characters with no URLs, HTML or control characters, then cache, gate, bounded provider call). The wrapper adds no policy of its own to the core's bbox, 8 s deadline, 256 KB body cap and result limit.

## Server configuration (set by the deployment owner; this work sets none)
- `GEOCODE_USAGE_AUTHORIZED`: must be exactly `true`; without it every call, even one the cache could answer, is refused.
- `GEOCODE_USER_AGENT`: required, no default. It must be a genuine identifying User-Agent with real contact information; the core rejects generic agents (curl, python, browsers) and agents with no contact.
- `GEOCODE_ENDPOINT`: optional search endpoint; defaults to `https://nominatim.openstreetmap.org/search`. https is required except for localhost, and the endpoint must carry no credentials. Switching it uses a separate cache scope.

## Durable application-wide gate (`geocodeState.reserveSlot`)
One row (`geocodeGate`, key `nominatim`) stores the time of the last granted provider request. A request is granted when at least 1000 ms have passed (exactly 1000 ms is granted), checked and written in one mutation. Mutations serialize, so concurrent users and concurrent actions share the same gate and can never both win inside a second; nothing queues or bursts. Refusals return `retryAfterMs`. A request that fails at the provider still used its slot. A clock that reads earlier than the last grant fails closed: nothing is granted, the stored time is not changed, and the caller gets `retryAfterMs` capped at 1000 ms (at least 1), so a backwards clock cannot bypass the one-per-second limit; requests resume once the clock is at least 1000 ms past the stored grant. A duplicate gate row is an error, not a choice.

## Durable cache (`geocodeCache`, `geocodeState.cacheGet`/`cachePut`)
Keyed by the SHA-256 of the core's cache key (endpoint, search envelope, result limit and the normalized query), so the raw query text is not stored. Entries live seven days (an entry is expired at exactly its `expiresAt`); expired entries are ignored on read. A write reuses the existing row for the key (collapsing stray duplicates) instead of appending and removes at most 5 expired rows, so maintenance is bounded. Candidates are re-validated with the core's parser before storage (at most 5, inside the envelope, bounded labels, lifetime at most 30 days). A cache hit uses no gate and no network.

Both `geocodeGate` and `geocodeCache` are private tables read and written only by internal functions; signed-in callers have no way to change them. Existing canonical tables and the teammate's anonymous tables are untouched.

## Errors
`ConvexError` data is exactly `{code, message, retryAfterMs?}`: `NOT_SIGNED_IN`, `INVALID_QUERY`, `CONFIGURATION_ERROR`, `RATE_LIMITED` (our gate or the provider's 429, with `retryAfterMs`), `PROVIDER_TIMEOUT`, `PROVIDER_UNAVAILABLE`, `PROVIDER_ERROR`, `INVALID_RESPONSE`, `GEOCODE_FAILED`. Messages are fixed text: queries, the User-Agent, the endpoint, provider bodies and stack details never reach a caller, and nothing is logged.

## Provider policy and attribution
Purpose: let a person locate the restaurant for a deal they are posting, one explicit lookup per button press. The OSMF Nominatim policy (https://operations.osmfoundation.org/policies/nominatim/, inspected October 4) allows at most one request per second for the whole application, requires an identifying User-Agent, expects caching, and forbids personal or confidential queries, autocomplete and bulk scraping. The search API used is `/search` with `format=jsonv2` and a bounded `viewbox` (https://nominatim.org/release-docs/latest/api/Search/, release 5.3.2). Results come from OpenStreetMap data, (c) OpenStreetMap contributors, ODbL 1.0; the UI must show that attribution (`OSM_ATTRIBUTION` in the core).

## Pending
Any real Nominatim request, the Find button, the map and pin confirmation, WKWebView/phone behavior, codegen (the module registrations in `_generated/api.d.ts` and `server.d.ts` were added by hand) and deployment.
