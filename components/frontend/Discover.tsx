"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { filterDeals } from "@/lib/frontend/deals";
import { useFrontend } from "./FrontendProvider";
import { Icon } from "./Icon";
import { DealCard } from "./DealCard";
import { PreviewNote } from "./Shell";
import { Dialog } from "./Dialog";
import { useClock } from "./useClock";
export function Discover() {
  const app = useFrontend();
  const { now, ready } = useClock();
  const [search, setSearch] = useState("");
  const [priceLimit, setPrice] = useState<number | null>(null);
  const [onlyNow, setOnlyNow] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const deals = useMemo(
    () => filterDeals(app.deals, { search, priceLimit, onlyNow }, now),
    [app.deals, search, priceLimit, onlyNow, now],
  );
  const reset = () => {
    setSearch("");
    setPrice(null);
    setOnlyNow(false);
  };
  return (
    <div className="discover page-width">
      <section className="discover-intro">
        <div>
          <p className="eyebrow">Good food. A little less.</p>
          <h1>Find your next good meal.</h1>
          <p>
            Food deals around Vancouver, shared by the people who find them.
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
      <div className="filter-row">
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
      <div className="form-actions"><Link href="/tools" className="button secondary">Explore map & AI comparison</Link></div>
      <PreviewNote />
      <section className="feed-section" aria-label="Food deals">
        <div className="section-heading">
          <h2>
            {search || priceLimit || onlyNow ? "Your picks" : "Nearby deals"}
          </h2>
          <span aria-live="polite">
            {app.loading
              ? "Finding deals…"
              : `${deals.length} ${app.mode === "preview" ? "example " : ""}deals`}
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
        ) : (
          <div className="deal-grid">
            {deals.map((d, i) => (
              <DealCard deal={d} now={now} key={d.id} featured={i === 0} />
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
