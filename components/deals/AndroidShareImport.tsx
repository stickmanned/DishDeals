"use client";

// Minimal "use the image you shared" panel for the canonical post page (T-13B). Harry classes, no polish.
// It privately reads the staged share from this browser's IndexedDB (nothing leaves the device), tells the user
// what is waiting, and only after an explicit tap AND a signed-in account with a profile hands the image and
// text to the SAME ImageDraftFlow controller. It never uploads, analyzes, submits or publishes by itself, never
// overwrites what the user already entered, and deletes exactly one stored item only after the controller has
// adopted it (or the user discards it). Nothing here ran on a real Android phone or installed PWA.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  adoptShare,
  clearShares,
  createIdbShareStore,
  discardShare,
  forgetPendingShare,
  isShareInboxSupported,
  parseShareQuery,
  readShare,
  recallPendingShare,
  rememberPendingShare,
  SHARE_ERROR_COPY,
  type LoadedShare,
  type ShareErrorCode,
} from "@/lib/androidShareInbox";
import type { ImageDraftFlow } from "@/lib/imageDraftFlow";

type View =
  | { k: "idle" }
  | { k: "loading" }
  | { k: "error"; code: ShareErrorCode }
  | { k: "note"; message: string }
  | { k: "waiting"; share: LoadedShare }
  | { k: "done"; message: string };

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const preview = (value: string) => (value.length > 160 ? `${value.slice(0, 160)}…` : value);

export function AndroidShareImport({ flow, ready, signedIn }: { flow: ImageDraftFlow; ready: boolean; signedIn: boolean }) {
  const [view, setView] = useState<View>({ k: "idle" });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let live = true;
    const set = (next: View) => {
      if (live) setView(next);
    };
    const query = parseShareQuery(window.location.search);
    if (query.kind === "error") return set({ k: "error", code: query.code }), undefined;
    if (query.kind === "invalid") return set({ k: "note", message: "That share link is not valid, so nothing was read." }), undefined;
    const id = query.kind === "id" ? query.id : recallPendingShare(session());
    if (!id) return undefined;
    if (!isShareInboxSupported()) return set({ k: "error", code: "unavailable" }), undefined;
    set({ k: "loading" });
    rememberPendingShare(session(), id);
    void readShare(createIdbShareStore(), id).then((result) => {
      if (result.ok) return set({ k: "waiting", share: result.share });
      forgetPendingShare(session());
      if (result.reason === "unavailable") return set({ k: "error", code: "unavailable" });
      set({ k: "note", message: "That shared image is no longer stored here. It may have been used, discarded or expired. Share it again if you still need it." });
    });
    return () => {
      live = false;
    };
  }, []);

  if (view.k === "idle") return null;

  async function use(share: LoadedShare) {
    setNotice("");
    const result = adoptShare(flow, share);
    if (!result.ok) {
      setNotice(
        result.reason === "busy"
          ? "An analysis is running. Wait for it to finish or cancel it, then use the shared image."
          : result.reason === "source_exists"
            ? "You already chose an image or recording on this page, so it was kept. Remove it first, or discard the shared image."
            : "The shared image could not be used here. Discard it and choose the image from the post page.",
      );
      return;
    }
    forgetPendingShare(session());
    const removed = await discardShare(createIdbShareStore(), share.id);
    const parts = [result.applied.caption && "title", result.applied.text && "text", result.applied.provenanceUrl && "link"].filter(Boolean);
    setView({
      k: "done",
      message: `The shared image is ready${parts.length ? ` with its ${parts.join(", ")}` : ""}. Nothing has been uploaded yet: choose Get suggestions when you are ready.${removed ? "" : " It could not be removed from this device's inbox and will expire on its own."}`,
    });
  }

  async function discard(share: LoadedShare) {
    setNotice("");
    forgetPendingShare(session());
    const removed = await discardShare(createIdbShareStore(), share.id);
    setView({ k: "note", message: removed ? "The shared image was discarded from this device." : "The shared image could not be removed now; it will expire on its own." });
  }

  async function clearAll() {
    forgetPendingShare(session());
    const cleared = await clearShares(createIdbShareStore());
    setView({ k: "note", message: cleared ? "Stored shared images were cleared from this device." : "Stored shared images could not be cleared." });
  }

  return (
    <section className="panel form-stack" aria-label="Shared image">
      <h2>Image shared to DishDeals</h2>
      {view.k === "loading" && <p role="status">Opening your shared image…</p>}
      {view.k === "error" && (
        <>
          <p role="alert" className="field-error">
            {SHARE_ERROR_COPY[view.code]}
          </p>
          {view.code === "inbox_full" && (
            <button type="button" className="button secondary" onClick={() => void clearAll()}>
              Clear stored shared images
            </button>
          )}
        </>
      )}
      {view.k === "note" && <p role="status">{view.message}</p>}
      {view.k === "done" && <p role="status">{view.message}</p>}
      {view.k === "waiting" && (
        <>
          <p>
            A shared image ({(view.share.file.size / 1048576).toFixed(1)} MB) is waiting. It is kept on this device only, for up to 24 hours, and is not uploaded until you
            choose to analyze it.
          </p>
          {view.share.title && <p className="muted">Title: {preview(view.share.title)}</p>}
          {view.share.text && <p className="muted">Text: {preview(view.share.text)}</p>}
          {view.share.url && <p className="muted">Link (kept as the source, never opened): {preview(view.share.url)}</p>}
          {!ready && (
            <p role="status">
              {signedIn ? (
                <>
                  Create your profile to use it: <Link href="/profile">go to your profile</Link>.
                </>
              ) : (
                <>
                  Sign in to use it: <Link href="/signin?next=/post">sign in</Link>.
                </>
              )}{" "}
              The shared image stays here meanwhile.
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="button primary" disabled={!ready} onClick={() => void use(view.share)}>
              Use this shared image
            </button>
            <button type="button" className="button secondary" onClick={() => void discard(view.share)}>
              Discard it
            </button>
          </div>
          {notice && (
            <p role="alert" className="field-error">
              {notice}
            </p>
          )}
        </>
      )}
    </section>
  );
}
