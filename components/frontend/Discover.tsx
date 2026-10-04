"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { filterDeals } from "@/lib/frontend/deals";
import { hasCoordinates, nearbyDeals, RADIUS_OPTIONS_KM, type RadiusKm } from "@/lib/frontend/nearby";
import { PublishedDealMap } from "@/components/maps/PublishedDealMap";
import type { CanonicalSavedDeal } from "@/lib/mapAdapter";
import { useFrontend } from "./FrontendProvider";
import { Icon } from "./Icon";
import { DealCard } from "./DealCard";
import { PreviewNote } from "./Shell";
import { Dialog } from "./Dialog";
import { useClock } from "./useClock";
import { useUserLocation } from "./useUserLocation";
const DEFAULT_RADIUS: RadiusKm = 10;
export function Discover() {
  const app = useFrontend();
  const { now, ready } = useClock();
  const location = useUserLocation();
  const [view, setView] = useState<"nearby" | "saved">("nearby");
  const [radius, setRadius] = useState<RadiusKm>(DEFAULT_RADIUS);
  const [layout, setLayout] = useState<"list" | "map">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [priceLimit, setPrice] = useState<number | null>(null);
  const [onlyNow, setOnlyNow] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const savedSet = useMemo(() => new Set(app.savedIds), [app.savedIds]);
  const savedCount = useMemo(() => app.deals.filter(d => savedSet.has(d.id)).length, [app.deals, savedSet]);
  // Nearby ranks by usability then distance. Saved ignores the radius so a bookmark never disappears.
  const rows = useMemo(() => {
    const matching = filterDeals(app.deals, { search, priceLimit, onlyNow }, now);
    const scoped = view === "saved" ? matching.filter(d => savedSet.has(d.id)) : matching;
    return nearbyDeals(scoped, location.origin, view === "saved" ? null : radius, now);
  }, [app.deals, search, priceLimit, onlyNow, now, view, radius, savedSet, location.origin]);
  const deals = rows;
  const mapDeals = useMemo<CanonicalSavedDeal[]>(() => rows.flatMap(({ deal: d }) => !hasCoordinates(d) ? [] : [{
    _id: d.id, restaurant: d.restaurant, dealText: d.dealText, lat: d.lat, lng: d.lng,
    ...(d.address ? { address: d.address } : {}),
    ...(d.priceCad !== undefined ? { priceCad: d.priceCad } : {}),
    ...(d.sourceUrl ? { sourceUrl: d.sourceUrl } : {}),
  }]), [rows]);
  const selected = rows.find(r => r.deal.id === selectedId);
  const reset = () => {
    setSearch("");
    setPrice(null);
    setOnlyNow(false);
    setRadius(DEFAULT_RADIUS);
  };
  return (
    <div className="discover page-width">
      <section className="discover-intro">
        <div>
          <p className="eyebrow">Good food. A little less.</p>
          <h1>Find your next good meal.</h1>
          <p>
            Food deals near {location.origin.label}, shared by the people who find them.
          </p>
        </div>
        <Link href="/post" className="button primary">
          <Icon name="plus" size={20} /> Post a deal
        </Link>
      </section>
      <div className="search-row">
        <div className="search-field">
          <Icon name="search" size={22} />
          <input
            aria-label="Search deals"
            placeholder="Restaurant, dish, area"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="icon-button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
        <button
          className="filter-button"
          onClick={() => setShowFilters(true)}
          aria-label="Open filters"
        >
          <Icon name="filter" />
          <span>Filters</span>
          {onlyNow && <span className="filter-count">1</span>}
        </button>
      </div>
      <div className="nearby-bar">
        <div className="view-tabs" role="group" aria-label="Deal list">
          <button type="button" className={`chip ${view === "nearby" ? "active" : ""}`} aria-pressed={view === "nearby"} onClick={() => setView("nearby")}>
            <Icon name="pin" size={16} /> Nearby
          </button>
          <button type="button" className={`chip ${view === "saved" ? "active" : ""}`} aria-pressed={view === "saved"} onClick={() => setView("saved")}>
            <Icon name="bookmark" size={16} filled={view === "saved"} /> Saved{savedCount ? ` (${savedCount})` : ""}
          </button>
        </div>
        <div className="location-control">
          <span className="location-label">
            <Icon name="locate" size={16} />
            {location.origin.source === "device" ? "Near you" : `Near ${location.origin.label}`}
          </span>
          {location.origin.source === "device" ? (
            <button type="button" className="text-button" onClick={location.reset}>Use Metrotown instead</button>
          ) : (
            <button type="button" className="text-button" disabled={location.status === "locating"} onClick={location.locate}>
              {location.status === "locating" ? "Locating…" : "Use my location"}
            </button>
          )}
        </div>
      </div>
      {(location.status === "denied" || location.status === "unavailable") && (
        <p role="status" className="muted location-note">
          {location.status === "denied"
            ? "Location is turned off for this site, so we’re showing deals near Metrotown. You can allow it in your browser settings."
            : "We couldn’t get your location, so we’re showing deals near Metrotown."}
        </p>
      )}
      {location.origin.source === "device" && (
        <p className="muted location-note">Your location stays in this tab. It isn’t saved or shared.</p>
      )}
      <div className="filter-row">
        {view === "nearby" && (
          <div className="price-filters" role="group" aria-label="Distance filter">
            {[...RADIUS_OPTIONS_KM, null].map((km) => (
              <button
                key={km ?? "any"}
                type="button"
                className={`chip ${radius === km ? "active" : ""}`}
                aria-pressed={radius === km}
                onClick={() => setRadius(km)}
              >
                {km === null ? "Any distance" : `${km} km`}
              </button>
            ))}
          </div>
        )}
        <div className="price-filters" role="group" aria-label="Price filter">
          {[null, 5, 10, 15].map((v) => (
            <button
              key={v ?? "all"}
              className={`chip ${priceLimit === v ? "active" : ""}`}
              aria-pressed={priceLimit === v}
              onClick={() => setPrice(v)}
            >
              {v === null ? "Any price" : `Under $${v}`}
            </button>
          ))}
        </div>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={onlyNow}
            onChange={(e) => setOnlyNow(e.target.checked)}
          />
          <span className="toggle-track" />
          <span>Valid now</span>
        </label>
      </div>
      <PreviewNote />
      <section className="feed-section" aria-label="Food deals">
        <div className="section-heading">
          <h2>
            {view === "saved" ? "Saved deals" : search || priceLimit || onlyNow ? "Your picks" : "Nearby deals"}
          </h2>
          <div className="view-tabs" role="group" aria-label="Layout">
            <button type="button" className={`chip ${layout === "list" ? "active" : ""}`} aria-pressed={layout === "list"} onClick={() => setLayout("list")}><Icon name="list" size={16} /> List</button>
            <button type="button" className={`chip ${layout === "map" ? "active" : ""}`} aria-pressed={layout === "map"} onClick={() => setLayout("map")}><Icon name="map" size={16} /> Map</button>
          </div>
          <span aria-live="polite">
            {app.loading
              ? "Finding deals…"
              : `${deals.length} ${app.mode === "preview" ? "example " : ""}deal${deals.length === 1 ? "" : "s"}${view === "nearby" && radius !== null ? ` within ${radius} km` : ""}`}
          </span>
        </div>
        {app.loading || !ready ? (
          <div
            className="deal-grid"
            aria-label="Loading deals"
            aria-busy="true"
          >
            {[1, 2, 3].map((i) => (
              <div className="skeleton-card" key={i}>
                <div />
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : app.error ? (
          <div className="empty-state panel">
            <Icon name="refresh" size={32} />
            <h2>We couldn’t load the deals.</h2>
            <p>Check your connection and try again.</p>
            <button
              className="button secondary"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        ) : app.mode === "live" && !app.live ? (
          <div className="empty-state panel">
            <Icon name="compass" size={36} />
            <h2>The live table isn’t set yet.</h2>
            <p>
              There aren’t live deals available in this version. Explore the
              preview while the community gets ready.
            </p>
            <button
              className="button secondary"
              onClick={() => app.setMode("preview")}
            >
              Explore example deals <Icon name="arrow" size={18} />
            </button>
          </div>
        ) : !deals.length && view === "saved" ? (
          <div className="empty-state panel">
            <Icon name="bookmark" size={36} />
            <h2>{savedCount ? "No saved deals match." : "Nothing saved yet."}</h2>
            <p>{savedCount ? "Try clearing your search or filters." : "Tap the bookmark on a deal to keep it here."}</p>
            <button className="button secondary" onClick={savedCount ? reset : () => setView("nearby")}>
              {savedCount ? "Clear filters" : "Browse nearby deals"}
            </button>
          </div>
        ) : !deals.length && app.deals.length > 0 && radius !== null && !search && priceLimit === null && !onlyNow ? (
          <div className="empty-state panel">
            <Icon name="pin" size={36} />
            <h2>Nothing within {radius} km.</h2>
            <p>Try a wider area, or share a find near {location.origin.label}.</p>
            <button className="button secondary" onClick={() => setRadius(null)}>Show any distance</button>
          </div>
        ) : !deals.length ? (
          <div className="empty-state panel">
            <Icon name="search" size={36} />
            <h2>
              {app.deals.length
                ? "Nothing on this menu yet."
                : "Be the first to find a deal."}
            </h2>
            <p>
              {app.deals.length
                ? "Try a different dish or give your budget a little room."
                : "A screenshot or a flyer is a good place to start."}
            </p>
            {app.deals.length ? (
              <button className="button secondary" onClick={reset}>
                Clear filters
              </button>
            ) : (
              <Link href="/post" className="button primary">
                Post a deal
              </Link>
            )}
          </div>
        ) : layout === "map" ? (
          <div className="discover-map">
            <div className="discover-map-frame">
              <PublishedDealMap
                deals={mapDeals}
                selectedId={selectedId}
                onSelectDeal={(d) => setSelectedId(d?._id ?? null)}
                initialCenter={[location.origin.lng, location.origin.lat]}
                initialZoom={12}
                fitOnLoad
                fitKey={`${view}-${radius}-${mapDeals.length}-${location.origin.source}`}
                ariaLabel="Map of deals"
                style={{ height: "100%" }}
              />
            </div>
            {selected ? (
              <DealCard deal={selected.deal} now={now} featured distanceKm={selected.distanceKm}
                saved={savedSet.has(selected.deal.id)} onToggleSave={() => app.toggleSaved(selected.deal.id)} />
            ) : (
              <p className="muted">Tap a pin to see the deal. {mapDeals.length} on the map.</p>
            )}
          </div>
        ) : (
          <div className="deal-grid">
            {rows.map(({ deal: d, distanceKm }, i) => (
              <DealCard
                deal={d}
                now={now}
                key={d.id}
                featured={i === 0}
                distanceKm={distanceKm}
                saved={savedSet.has(d.id)}
                onToggleSave={() => app.toggleSaved(d.id)}
              />
            ))}
          </div>
        )}
      </section>
      <div className="share-strip">
        <div className="share-strip-icon">
          <Icon name="camera" size={26} />
        </div>
        <div>
          <h2>Found something good?</h2>
          <p>A screenshot. A campus flyer. Share the find.</p>
        </div>
        <Link href="/post" className="text-link">
          Pass it on <Icon name="arrow" size={18} />
        </Link>
      </div>
      <Dialog
        open={showFilters}
        onClose={() => setShowFilters(false)}
        title="A meal that fits"
      >
        <p className="muted">
          Choose your budget. Unknown prices stay in the mix.
        </p>
        <fieldset className="filter-fieldset">
          <legend>Price</legend>
          <div className="price-filters">
            {[null, 5, 10, 15].map((v) => (
              <button
                key={v ?? "all"}
                className={`chip ${priceLimit === v ? "active" : ""}`}
                aria-pressed={priceLimit === v}
                onClick={() => setPrice(v)}
              >
                {v === null ? "Any" : `Under $${v}`}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="check-row">
          <input
            type="checkbox"
            checked={onlyNow}
            onChange={(e) => setOnlyNow(e.target.checked)}
          />
          <span>
            Only deals valid now
            <small>Times follow Vancouver’s local clock.</small>
          </span>
        </label>
        <div className="form-actions">
          <button className="button secondary" onClick={reset}>
            Reset
          </button>
          <button
            className="button primary"
            onClick={() => setShowFilters(false)}
          >
            Show {deals.length} deals
          </button>
        </div>
      </Dialog>
    </div>
  );
}
