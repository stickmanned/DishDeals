"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DealReviewForm } from "@/components/deals/DealReviewForm";
import { DealDetailsErrorBoundary } from "@/components/deals/CanonicalDealDetails";
import {
  DealLocationPicker,
  type GeocodeCandidate,
} from "@/components/maps/DealLocationPicker";
import { Icon } from "@/components/frontend/Icon";
import { dealDraftReducer, type DealDraft, type DealDraftAction } from "@/lib/dealDraft";
import {
  buildUpdateArgs,
  changedExternally,
  editAccess,
  initDraftFromSavedDeal,
  submitDealUpdate,
  type SavedDeal,
} from "@/lib/dealEdit";
import { isValidDealId } from "@/lib/mapPage";

export interface CanonicalDealEditProps {
  id: string;
  /**
   * Optional injected geocode search. Until the coordinator binds the real geocoding action,
   * the picker honestly reports search as unavailable and the map proposal works without it.
   */
  search?: (query: string) => Promise<GeocodeCandidate[]>;
}

function Notice({ icon, title, children }: { icon: "pin" | "search"; title: string; children: React.ReactNode }) {
  return (
    <div className="narrow-page panel empty-state" style={{ marginTop: 40 }}>
      <Icon name={icon} size={32} />
      <h1 style={{ fontSize: 32 }}>{title}</h1>
      {children}
    </div>
  );
}

export function CanonicalDealEdit({ id, search }: CanonicalDealEditProps) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <Notice icon="pin" title="Backend unconfigured">
        <p role="status">The live deal service is unavailable here. Please return when it is connected.</p>
        <Link className="button secondary" href="/">
          Back to Discover
        </Link>
      </Notice>
    );
  }

  // A malformed id never reaches a query or mutation.
  if (!isValidDealId(id)) {
    return (
      <Notice icon="search" title="Invalid deal link">
        <p>The deal identifier is invalid or malformed.</p>
        <Link className="button secondary" href="/">
          Back to Discover
        </Link>
      </Notice>
    );
  }

  return (
    <DealDetailsErrorBoundary key={id}>
      <CanonicalDealEditContent dealId={id as Id<"deals">} search={search} />
    </DealDetailsErrorBoundary>
  );
}

function CanonicalDealEditContent({
  dealId,
  search,
}: {
  dealId: Id<"deals">;
  search?: CanonicalDealEditProps["search"];
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const deal = useQuery(api.deals.get, { dealId });
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const findLocation = useAction(api.geocode.geocode);

  if (deal === undefined || isLoading) {
    return (
      <div className="medium-page">
        <div className="skeleton-card" aria-label="Loading deal" aria-busy="true">
          <div />
          <span />
        </div>
      </div>
    );
  }

  if (deal === null) {
    return (
      <Notice icon="search" title="This deal isn’t on the menu.">
        <p>It may have been removed, so there is nothing to edit.</p>
        <Link className="button secondary" href="/">
          Back to Discover
        </Link>
      </Notice>
    );
  }

  const access = editAccess({ authLoading: isLoading, isAuthenticated, me, deal });

  if (access === "loading") {
    return (
      <div className="medium-page">
        <div className="skeleton-card" aria-label="Checking your account" aria-busy="true">
          <div />
          <span />
        </div>
      </div>
    );
  }

  if (access === "signed_out") {
    return (
      <Notice icon="pin" title="Sign in to edit">
        <p>Only the person who shared a deal can edit it.</p>
        <Link
          className="button primary"
          href={`/signin?next=${encodeURIComponent(`/deal/${dealId}/edit`)}`}
        >
          Sign in
        </Link>
      </Notice>
    );
  }

  if (access === "forbidden") {
    return (
      <Notice icon="pin" title="You can’t edit this deal">
        <p>Only the person who shared this deal can edit it.</p>
        <Link className="button secondary" href={`/deal/${dealId}`}>
          Back to the deal
        </Link>
      </Notice>
    );
  }

  return <EditForm key={dealId} dealId={dealId} live={deal} search={search ?? (query => findLocation({ query }))} />;
}

/**
 * The server copy is captured ONCE per deal as the editing baseline. Reactive updates never touch
 * the user's draft; a different server copy only raises a warning with an explicit reload choice.
 */
function EditForm({
  dealId,
  live,
  search,
}: {
  dealId: Id<"deals">;
  live: SavedDeal;
  search?: CanonicalDealEditProps["search"];
}) {
  const router = useRouter();
  const update = useMutation(api.deals.update);

  const [baseline, setBaseline] = useState<SavedDeal>(live);
  const [draft, setDraft] = useState<DealDraft>(() => initDraftFromSavedDeal(live));
  const [epoch, setEpoch] = useState(0);
  const [savedByMe, setSavedByMe] = useState<SavedDeal[]>([]);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const externalChange = changedExternally([baseline, ...savedByMe], live);

  function handleAction(action: DealDraftAction) {
    setDraft((prev) => dealDraftReducer(prev, action));
  }

  function loadLatest() {
    setBaseline(live);
    setSavedByMe([]);
    setDraft(initDraftFromSavedDeal(live));
    setEpoch((n) => n + 1);
  }

  // Called by the shared form only after its own readiness gate passed. Rebuilds the exact
  // `deals.update` arguments from the live draft and resolves only after the server confirms;
  // a thrown error is shown by the form and every edit (including partial price text) is kept.
  async function handleSave(): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const args = buildUpdateArgs(dealId, draft, baseline);
      await submitDealUpdate(update, args);
      setSavedByMe((prev) => [...prev, { ...baseline, ...args, authorId: baseline.authorId, _id: dealId }]);
      router.push(`/deal/${dealId}`);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="medium-page">
      <div className="page-tools">
        <Link href={`/deal/${dealId}`} className="back-link">
          <Icon name="back" size={16} /> Back to the deal
        </Link>
      </div>

      <div className="page-heading">
        <h1>Edit your deal</h1>
        <p>
          Review your changes and confirm the location before saving.
        </p>
      </div>

      {externalChange && (
        <div role="alert" className="panel form-stack">
          <p>
            <b>This deal changed elsewhere while you were editing.</b> Your edits on this screen are
            unchanged. Saving will replace the newer version.
          </p>
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={loadLatest}>
              Discard my edits and load the latest
            </button>
          </div>
        </div>
      )}

      <DealReviewForm
        key={epoch}
        draft={draft}
        title="Edit deal details"
        submitLabel="Save changes"
        onAction={handleAction}
        onPublish={handleSave}
        busy={saving}
        renderLocation={({ draft: current, onConfirm }) => (
          <DealLocationPicker
            restaurant={current.fields.restaurant.value ?? ""}
            address={current.fields.address.value}
            location={current.location}
            search={search}
            onConfirm={onConfirm}
            onInvalidate={() => handleAction({ type: "INVALIDATE_LOCATION" })}
          />
        )}
      />
    </div>
  );
}
