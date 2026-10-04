"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { validity, type DealView } from "@/lib/frontend/deals";
import { Icon } from "./Icon";
export function Price({ deal }: { deal: DealView }) {
  return (
    <>
      {deal.priceCad === undefined
        ? "Price varies"
        : `$${deal.priceCad.toFixed(2)}`}
      <span className="currency">
        {deal.priceCad !== undefined ? " CAD" : ""}
      </span>
    </>
  );
}
export function TimeBadge({ deal, now }: { deal: DealView; now: Date }) {
  const v = validity(deal, now);
  return (
    <span className={`time-badge ${v.status === "valid" ? "is-valid" : ""}`}>
      <span className="status-dot" />
      {v.label}
      {v.minutesLeft !== undefined && v.minutesLeft > 0
        ? ` · ${v.minutesLeft < 60 ? `${v.minutesLeft}m left` : `${Math.floor(v.minutesLeft / 60)}h${v.minutesLeft % 60 ? ` ${v.minutesLeft % 60}m` : ""} left`}`
        : ""}
    </span>
  );
}
export function DealImage({
  deal,
  priority = false,
}: {
  deal: DealView;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return deal.imageUrl && !failed ? (
    <Image
      src={deal.imageUrl.startsWith("/") ? `${process.env.NEXT_PUBLIC_BASE_PATH || ""}${deal.imageUrl}` : deal.imageUrl}
      alt={deal.imageAlt ?? `${deal.restaurant} deal source`}
      fill
      sizes="(max-width: 700px) 100vw, (max-width: 1000px) 50vw, 400px"
      unoptimized={!deal.imageUrl.startsWith("/")}
      priority={priority}
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="image-fallback">
      <Icon name="photo" size={36} />
      <span>Shared offer</span>
    </div>
  );
}
export function DealCard({
  deal,
  now,
  featured = false,
}: {
  deal: DealView;
  now: Date;
  featured?: boolean;
}) {
  return (
    <article className={`deal-card ${featured ? "featured" : ""}`}>
      <Link
        className="card-image"
        href={`/deal?id=${encodeURIComponent(deal.id)}`}
        tabIndex={-1}
        aria-hidden="true"
      >
        <DealImage deal={deal} priority={featured} />
        <span className="image-label">
          {deal.isDemo ? "Example deal" : "Community find"}
        </span>
      </Link>
      <div className="card-body">
        <TimeBadge deal={deal} now={now} />
        <div className="card-heading">
          <h2>
            <Link href={`/deal?id=${encodeURIComponent(deal.id)}`}>
              {deal.restaurant}
            </Link>
          </h2>
          <Icon name="arrow" size={20} />
        </div>
        <p className="card-description">{deal.dealText}</p>
        <div className="offer">
          <span>
            <Price deal={deal} />
          </span>
          {deal.originalPrice !== undefined && (
            <del>${deal.originalPrice.toFixed(2)}</del>
          )}
        </div>
        <div className="card-meta">
          <span>
            <Icon name="pin" size={15} />
            {deal.address ?? "Location not listed"}
          </span>
          {deal.authorName && (
            <span className="finder">Shared by {deal.authorName}</span>
          )}
        </div>
      </div>
    </article>
  );
}
