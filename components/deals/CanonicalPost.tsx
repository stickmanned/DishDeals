"use client";

// Canonical screenshot/flyer post page (T-07C). Minimal usable controls using the existing Harry classes:
// the common DealReviewForm and the real DealLocationPicker do the reviewing, and every decision (upload,
// analysis generations, apply/replace, publish) is made by the pure ImageDraftFlow controller, which is
// the thing the tests exercise. This component only wires real Convex/auth/browser calls into it.
// Nothing here ran in a browser, on a phone, or against a deployment or a model.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useConvexAuth as useSession } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Post } from "@/components/frontend/Post";
import { useFrontend } from "@/components/frontend/FrontendProvider";
import { DealLocationPicker, type GeocodeCandidate } from "@/components/maps/DealLocationPicker";
import { uploadDealImage } from "@/lib/dealImageUpload";
import { resizeImage } from "@/lib/image";
import {
  boundedJpegUpload,
  ImageDraftFlow,
  isFormEdited,
  isRunning,
  savedDealMapHref,
  sessionNotice,
  MAX_CAPTION_CHARS,
  MAX_FORMS,
  MAX_TEXT_CHARS,
  type FlowDeps,
  type FlowSnapshot,
  type Offer,
} from "@/lib/imageDraftFlow";
import { isValidDealId } from "@/lib/mapPage";
import { DealReviewForm } from "./DealReviewForm";

export interface CanonicalPostProps {
  /**
   * Typed address search for the location picker. Until the reviewed geocode action is bound (T08GB) this is
   * absent and the picker shows its explicit "search unavailable" state; no coordinates are invented.
   */
  searchLocation?: (query: string) => Promise<GeocodeCandidate[]>;
}

const PHASE_COPY: Partial<Record<FlowSnapshot["phase"], string>> = {
  preparing: "Preparing your image…",
  uploading: "Uploading your image…",
  extracting: "Reading the image. This can take a little while.",
  done: "Analysis finished. Choose how to use the suggestions below.",
  canceled: "Analysis canceled. Your image and details are kept.",
};

export function CanonicalPost(props: CanonicalPostProps) {
  // Guard the unconfigured path before any Convex hook runs.
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <div className="narrow-page">
        <div className="panel empty-state">
          <h1>Posting needs the DishDeals backend.</h1>
          <p>The live service is not connected here, so nothing can be posted or saved.</p>
          <Link className="button secondary" href="/post?preview=1">
            Look at the example preview
          </Link>
        </div>
      </div>
    );
  }
  return <LivePost {...props} />;
}

function LivePost({ searchLocation }: CanonicalPostProps) {
  const router = useRouter();
  const session = useSession();
  const me = useQuery(api.users.me, session.isAuthenticated ? {} : "skip");
  const generateUploadUrl = useMutation(api.deals.generateUploadUrl);
  const extractDeal = useAction(api.extract.extractDeal);
  const createDeal = useMutation(api.deals.create);

  // The controller is created once; fresh hook functions are handed over after each render.
  const deps: FlowDeps = {
    prepareImage: async (file, signal) => boundedJpegUpload(await resizeImage(file, { signal })),
    getToken: () => session.fetchAccessToken({ forceRefreshToken: false }),
    generateUploadUrl: () => generateUploadUrl({}),
    upload: (args) => uploadDealImage(args),
    // The controller hands over ids only from real upload receipts; the casts below are that typed adapter.
    extract: (args) => extractDeal({ ...args, imageIds: args.imageIds as unknown as Id<"_storage">[] }),
    createDeal: (args) => createDeal({ ...args, imageId: args.imageId as unknown as Id<"_storage"> | undefined }),
  };
  const [flow] = useState(() => new ImageDraftFlow(deps));
  useEffect(() => {
    flow.setDeps(deps);
  });
  useEffect(() => flow.attach(), [flow]);
  const snap = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);

  const hasWork =
    snap.source.file !== null || snap.offers.length > 0 || snap.forms.some((f) => f.saved !== null || isFormEdited(f.draft));
  const ready = session.isAuthenticated && !!me;
  const notice = sessionNotice({ isLoading: session.isLoading, isAuthenticated: session.isAuthenticated, profile: me === undefined ? undefined : me !== null });

  // Once there is work on the page it stays mounted even if the session blips; only publishing needs a session.
  if (!ready && !hasWork) return <Gate loading={session.isLoading || (session.isAuthenticated && me === undefined)} signedIn={session.isAuthenticated} />;

  return (
    <div className="narrow-page post-canonical">
      <Header />
      {notice === "signed_out" && (
        <p role="alert" className="field-error">
          You are signed out. Your work is kept here.{" "}
          <Link href="/signin?next=/post" target="_blank" rel="noreferrer">
            Sign in again in a new tab
          </Link>{" "}
          to publish.
        </p>
      )}
      {notice === "no_profile" && (
        <p role="alert" className="field-error">
          Publishing needs a profile. Your work is kept here.{" "}
          <Link href="/profile" target="_blank" rel="noreferrer">
            Create your profile in a new tab
          </Link>
          , then publish.
        </p>
      )}
      <SourcePanel flow={flow} snap={snap} />
      <OffersPanel flow={flow} snap={snap} />
      <FormsPanel
        flow={flow}
        snap={snap}
        searchLocation={searchLocation}
        onSaved={(formKey, id) => {
          const others = flow.getSnapshot().forms.filter((f) => f.key !== formKey && !f.saved && isFormEdited(f.draft));
          if (others.length === 0) router.push(savedDealMapHref(id));
        }}
      />
    </div>
  );
}

function Header() {
  return (
    <>
      <Link className="back-link" href="/">
        Back to Discover
      </Link>
      <div className="page-heading">
        <h1>Post a deal.</h1>
        <p>Add a screenshot or flyer for suggestions, or type it in. You check every field before anything is published.</p>
      </div>
      <p className="muted">
        Have an Instagram Reel? <Link href="/reels">Save it privately</Link> (videos use a different flow). Just exploring?{" "}
        <Link href="/post?preview=1">See the example preview</Link>.
      </p>
    </>
  );
}

function Gate({ loading, signedIn }: { loading: boolean; signedIn: boolean }) {
  return (
    <div className="narrow-page">
      <Header />
      <div className="panel form-stack">
        {loading ? (
          <p role="status">Checking your session…</p>
        ) : !signedIn ? (
          <>
            <h2>Sign in to post a deal</h2>
            <p>Deals are tied to your account so you can manage them later.</p>
            <Link className="button primary" href="/signin?next=/post">
              Sign in
            </Link>
          </>
        ) : (
          <>
            <h2>Create your profile first</h2>
            <p>Posting needs a profile with a display name.</p>
            <Link className="button primary" href="/profile">
              Go to your profile
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function SourcePanel({ flow, snap }: { flow: ImageDraftFlow; snap: FlowSnapshot }) {
  const running = isRunning(snap.phase);
  const { source } = snap;

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again; canceling the picker keeps the previous choice
    if (chosen) flow.selectFile(chosen);
  }

  return (
    <section className="panel form-stack" aria-label="Screenshot or flyer">
      <h2>1. Screenshot or flyer (optional)</h2>
      <p className="muted">
        The image is resized on your device, uploaded to your account, and read by an AI model that suggests the details. Suggestions can be wrong or
        unavailable, and nothing is posted until you review and publish. HEIC photos are not supported yet.
      </p>
      <label className="field">
        Choose an image (JPEG, PNG or WebP)
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} disabled={running} />
      </label>
      <label className="field">
        Or take a photo
        <input type="file" accept="image/*" capture="environment" onChange={pick} disabled={running} />
      </label>
      {source.fileError && (
        <p role="alert" className="field-error">
          {source.fileError}
        </p>
      )}
      {source.file && (
        <p role="status">
          {source.file.name} · {(source.file.size / 1048576).toFixed(1)} MB{snap.uploaded ? " · uploaded" : ""}{" "}
          <button type="button" className="text-button" disabled={running} onClick={() => flow.selectFile(null)}>
            Remove
          </button>
        </p>
      )}

      <label className="field">
        Caption from the post (optional)
        <textarea
          value={source.caption}
          maxLength={MAX_CAPTION_CHARS}
          onChange={(e) => flow.setContext({ caption: e.target.value })}
          disabled={running}
        />
      </label>
      <label className="field">
        Any other text (optional)
        <textarea value={source.text} maxLength={MAX_TEXT_CHARS} onChange={(e) => flow.setContext({ text: e.target.value })} disabled={running} />
      </label>
      <label className="field">
        Link to the original post (optional)
        <input
          type="text"
          inputMode="url"
          autoCapitalize="none"
          value={source.provenanceUrl}
          onChange={(e) => flow.setContext({ provenanceUrl: e.target.value })}
          disabled={running}
          placeholder="https://…"
        />
      </label>
      <p className="muted">The link is kept as the deal&rsquo;s source. It is never opened or fetched.</p>
      <label className="field">
        Date it was posted (optional)
        <input type="date" value={source.publishedAt} onChange={(e) => flow.setContext({ publishedAt: e.target.value })} disabled={running} />
      </label>

      <div className="form-actions">
        <button type="button" className="button primary" disabled={running || !source.file} onClick={() => void flow.analyze()}>
          {running ? "Analyzing…" : snap.phase === "failed" || snap.phase === "canceled" ? "Try again" : "Get suggestions"}
        </button>
        {running && (
          <button type="button" className="button secondary" onClick={() => flow.cancel()}>
            Cancel
          </button>
        )}
      </div>
      {!source.file && <p className="muted">Add an image to get suggestions, or skip this and fill in the form below by hand.</p>}
      {PHASE_COPY[snap.phase] && <p role="status" aria-live="polite">{PHASE_COPY[snap.phase]}</p>}
      {snap.error && (
        <p role="alert" className="field-error">
          {snap.error.message}
        </p>
      )}
    </section>
  );
}

function summary(draft: Offer["drafts"][number]) {
  const f = draft.fields;
  const restaurant = f.restaurant.suggestion?.value ?? f.restaurant.value ?? "Unnamed place";
  const deal = f.dealText.suggestion?.value ?? f.dealText.value ?? "";
  const price = f.priceCad.suggestion?.value ?? f.priceCad.value;
  const blocking = draft.reviewIssues.filter((i) => i.blocking).length;
  return { restaurant, deal, price, blocking };
}

function OffersPanel({ flow, snap }: { flow: ImageDraftFlow; snap: FlowSnapshot }) {
  const [confirm, setConfirm] = useState<{ offerId: string; index: number; formKey: string } | null>(null);
  const [notice, setNotice] = useState("");
  if (snap.offers.length === 0) return null;
  const activeNumber = snap.forms.findIndex((f) => f.key === snap.activeFormKey) + 1;

  function use(offerId: string, index: number, kind: "add" | "replace", confirmReplace = false) {
    setNotice("");
    const result =
      kind === "add"
        ? flow.applyOffer(offerId, index, { kind: "add" })
        : flow.applyOffer(offerId, index, { kind: "replace", formKey: snap.activeFormKey }, { confirmReplace });
    if (result.ok) {
      setConfirm(null);
    } else if (result.reason === "confirm_required") {
      setConfirm({ offerId, index, formKey: snap.activeFormKey });
    } else if (result.reason === "too_many_forms") {
      setNotice(`You can have up to ${MAX_FORMS} deals on this page.`);
    } else {
      setNotice("That suggestion could not be used.");
    }
  }

  return (
    <section className="panel form-stack" aria-label="Suggestions">
      <h2>2. Suggestions</h2>
      <p className="muted">Nothing is filled in until you choose. Adding or replacing starts a form of suggestions that you still review field by field.</p>
      {notice && <p role="alert" className="field-error">{notice}</p>}
      {snap.offers.map((offer) => (
        <div key={offer.id} className="form-stack">
          <h3>
            From {offer.imageName} <span className="muted">· model {offer.model}</span>
          </h3>
          {offer.noDeal && <p role="status">No clear dining deal was found in this image. You can fill in the form by hand.</p>}
          {offer.drafts.map((draft, index) => {
            const s = summary(draft);
            const appliedTo = offer.appliedTo[index];
            const appliedNumber = appliedTo ? snap.forms.findIndex((f) => f.key === appliedTo) + 1 : 0;
            return (
              <div key={index} className="panel quiet-note">
                <p>
                  <b>{s.restaurant}</b>
                  {s.deal ? ` — ${s.deal}` : ""}
                  {typeof s.price === "number" ? ` · $${s.price.toFixed(2)}` : ""}
                </p>
                {s.blocking > 0 && <p className="muted">Includes {s.blocking} note(s) you must resolve before publishing.</p>}
                {appliedNumber > 0 && <p role="status">Used in Deal {appliedNumber}.</p>}
                <div className="form-actions">
                  <button type="button" className="button secondary" disabled={!!appliedTo || snap.forms.length >= MAX_FORMS} onClick={() => use(offer.id, index, "add")}>
                    Add as a new deal
                  </button>
                  <button type="button" className="button secondary" onClick={() => use(offer.id, index, "replace")}>
                    Use for Deal {activeNumber}
                  </button>
                </div>
                {confirm && confirm.offerId === offer.id && confirm.index === index && (
                  <div role="alert" className="form-stack">
                    <p>This replaces what you entered in Deal {activeNumber}, including its image.</p>
                    <div className="form-actions">
                      <button type="button" className="button primary" onClick={() => use(offer.id, index, "replace", true)}>
                        Replace Deal {activeNumber}
                      </button>
                      <button type="button" className="text-button" onClick={() => setConfirm(null)}>
                        Keep my form
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" className="text-button" onClick={() => flow.dismissOffer(offer.id)}>
            Dismiss these suggestions
          </button>
        </div>
      ))}
    </section>
  );
}

function FormsPanel({
  flow,
  snap,
  searchLocation,
  onSaved,
}: {
  flow: ImageDraftFlow;
  snap: FlowSnapshot;
  searchLocation?: CanonicalPostProps["searchLocation"];
  onSaved: (formKey: string, id: string) => void;
}) {
  return (
    <section className="form-stack" aria-label="Deals to review">
      <h2>3. Review and publish</h2>
      {snap.forms.length > 1 && (
        <div className="form-actions" role="tablist" aria-label="Deals">
          {snap.forms.map((f, i) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={f.key === snap.activeFormKey}
              className={`button ${f.key === snap.activeFormKey ? "primary" : "secondary"}`}
              onClick={() => flow.setActiveForm(f.key)}
            >
              Deal {i + 1}
              {f.saved ? " (saved)" : ""}
            </button>
          ))}
        </div>
      )}
      {/* Every form stays mounted (hidden when inactive) so typed and partial values survive switching, retries and late results. */}
      {snap.forms.map((f, i) => (
        <div key={f.key} hidden={f.key !== snap.activeFormKey} className="form-stack">
          {f.saved ? (
            <div className="panel success-page" role="status">
              <h3>Deal {i + 1} is published.</h3>
              <p>
                <Link href={savedDealMapHref(f.saved.id)}>See it on the map</Link> · <Link href={`/deal/${f.saved.id}`}>View the deal</Link>
              </p>
            </div>
          ) : (
            <>
              <p className="muted">
                {f.draft.imageId ? `Image attached: ${f.imageName ?? "uploaded image"}.` : "No image attached. Images are optional."}{" "}
                {f.draft.imageId && (
                  <button type="button" className="text-button" disabled={f.submitting} onClick={() => flow.removeImage(f.key)}>
                    Remove image
                  </button>
                )}
              </p>
              <DealReviewForm
                key={`${f.key}:${f.epoch}`}
                draft={f.draft}
                busy={f.submitting}
                onAction={(action) => {
                  flow.dispatch(f.key, action);
                }}
                onPublish={async () => {
                  const result = await flow.publish(f.key);
                  if (!result.ok) throw new Error(result.message);
                  onSaved(f.key, result.id);
                }}
                renderLocation={({ draft, onConfirm }) => (
                  <DealLocationPicker
                    restaurant={draft.fields.restaurant.value ?? ""}
                    address={draft.fields.address.value}
                    location={draft.location}
                    search={searchLocation}
                    onConfirm={onConfirm}
                    onInvalidate={() => {
                      flow.dispatch(f.key, { type: "INVALIDATE_LOCATION" });
                    }}
                  />
                )}
              />
            </>
          )}
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- preview

/**
 * The read-only example Post, kept only as an explicitly labeled preview. It never proves that posting works
 * and cannot edit a saved canonical deal. It renders only when the app is already in example (preview) mode.
 */
export function PreviewPost() {
  const app = useFrontend();
  if (app.mode !== "preview") {
    return (
      <div className="narrow-page">
        <div className="panel empty-state">
          <h1>The example preview is not active here.</h1>
          <p>This build is connected to live data, so the example posting form is not shown.</p>
          <Link className="button primary" href="/post">
            Post a real deal
          </Link>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="page-width">
        <div role="note" className="panel quiet-note">
          <b>Preview only.</b> This page shows example content. Nothing here is saved or published, and it does not show that posting works.{" "}
          <Link href="/post">Go to the real posting page</Link>
        </div>
      </div>
      <Post />
    </>
  );
}

/** Old `?edit=` and `?job=` links: stated honestly, never opened as a preview edit of a saved deal. */
export function LegacyPostLinkNotice({ kind, id }: { kind: "edit" | "job"; id?: string }) {
  const dealHref = kind === "edit" && id && isValidDealId(id) ? `/deal/${id}` : null;
  return (
    <div className="narrow-page">
      <div className="panel empty-state">
        <h1>{kind === "edit" ? "Editing isn’t available on this page." : "That import link is out of date."}</h1>
        <p>
          {kind === "edit"
            ? "Editing a saved deal will move to its own page. Nothing was changed."
            : "New posts no longer use import jobs. Nothing was changed."}
        </p>
        <div className="form-actions">
          {dealHref && (
            <Link className="button secondary" href={dealHref}>
              View the deal
            </Link>
          )}
          <Link className="button primary" href="/post">
            Post a new deal
          </Link>
        </div>
      </div>
    </div>
  );
}
