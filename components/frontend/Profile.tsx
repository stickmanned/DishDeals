"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useFrontend } from "./FrontendProvider";
import { Gate, PreviewNote } from "./Shell";
import { Icon } from "./Icon";
import { DealCard } from "./DealCard";
import { useClock } from "./useClock";
import { Dialog } from "./Dialog";
export function Profile() {
  const app = useFrontend();
  const router = useRouter();
  const { now } = useClock();
  const [name, setName] = useState(app.profile.displayName),
    [wallet, setWallet] = useState(app.profile.walletAddress),
    [saved, setSaved] = useState(false),
    [error, setError] = useState(""),
    [logoutOpen, setLogoutOpen] = useState(false);
  if (!app.authenticated)
    return (
      <div className="narrow-page">
        <Gate title="Your finds belong here." next="/profile" />
      </div>
    );
  function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2 || name.trim().length > 24) {
      setError("Use a display name between 2 and 24 characters.");
      return;
    }
    if (wallet && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
      setError(
        "Check the wallet address. Use a Solana address, or leave it empty.",
      );
      return;
    }
    app.savePreviewProfile({ displayName: name.trim(), walletAddress: wallet });
    setSaved(true);
  }
  async function leave() {
    try {
      await app.signOut();
      router.push("/");
    } catch {
      setError(
        "We couldn’t sign you out. Check your connection and try again.",
      );
    }
  }
  return (
    <div className="narrow-page">
      <PreviewNote short />
      <div className="profile-header">
        <div className="profile-avatar">
          {app.profile.displayName.slice(0, 1) || <Icon name="user" />}
        </div>
        <div>
          <h1>
            Hello
            {app.profile.displayName
              ? `, ${app.profile.displayName}`
              : " there"}
            .
          </h1>
          <p>
            {app.mode === "preview"
              ? "Your preview profile"
              : "Your community account"}
          </p>
        </div>
        <button
          className="icon-button"
          style={{ marginLeft: "auto" }}
          aria-label="Sign out"
          disabled={app.mode === "live" && !app.auth?.signOut}
          onClick={() => {
            if (
              app.sourceText ||
              app.sourceImage ||
              app.draft.restaurant ||
              app.sourceUrl ||
              app.publishedAt ||
              Object.keys(app.editDrafts).length ||
              name !== app.profile.displayName ||
              wallet !== app.profile.walletAddress
            )
              setLogoutOpen(true);
            else void leave();
          }}
        >
          <Icon name="logout" size={20} />
        </button>
      </div>
      <section className="panel">
        <h2 className="detail-subheading">Make yourself at home.</h2>
        <form className="form-stack" onSubmit={save}>
          <label className="field">
            <span className="field-label">
              Display name
              <small>{app.mode === "preview" ? name.length : 0}/24</small>
            </span>
            <input
              value={app.mode === "preview" ? name : ""}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              minLength={2}
              maxLength={24}
              required
              autoComplete="nickname"
              disabled={app.mode === "live"}
            />
            <small>The name people see beside your finds.</small>
          </label>
          <label className="field">
            Solana wallet <span className="quiet-note">Optional</span>
            <input
              value={app.mode === "preview" ? wallet : ""}
              onChange={(e) => {
                setWallet(e.target.value);
                setSaved(false);
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Your devnet receiving address"
              disabled={app.mode === "live"}
            />
            <small>
              For future devnet tips. Tipping isn’t available in this version.
            </small>
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {saved && (
            <p className="form-success" role="status">
              <Icon name="check" size={18} /> Preview profile updated for this
              tab.
            </p>
          )}
          <button className="button primary" disabled={app.mode === "live"}>
            Save {app.mode === "preview" ? "preview " : ""}profile
          </button>
          {app.mode === "live" && (
            <p className="quiet-note">
              Profile changes aren’t available here yet.
            </p>
          )}
        </form>
      </section>
      <div className="profile-title">
        <h2>Your finds</h2>
        <Link href="/post" className="text-link">
          <Icon name="plus" size={16} /> Add a deal
        </Link>
      </div>
      {app.mode === "preview" && app.previewPosts.length ? (
        <div className="deal-grid" style={{ gridTemplateColumns: "1fr" }}>
          {app.previewPosts.map((d) => (
            <DealCard key={d.id} deal={d} now={now} featured />
          ))}
        </div>
      ) : (
        <div className="panel empty-state compact-empty">
          <Icon name="photo" size={28} />
          <h2>
            {app.mode === "preview"
              ? "Your first find is waiting."
              : "Your posts aren’t available here yet."}
          </h2>
          <p>
            {app.mode === "preview"
              ? "Try the posting flow. Preview drafts stay in this tab."
              : "Keep exploring the public feed while account features get ready."}
          </p>
          {app.mode === "preview" && (
            <Link className="button secondary" href="/post">
              Try a preview post
            </Link>
          )}
        </div>
      )}
      {app.activeJobId && (
        <div className="panel" style={{ marginTop: 24 }}>
          <h2 className="detail-subheading">Your active submission</h2>
          <Link
            className="text-link"
            href={`/post?job=${encodeURIComponent(app.activeJobId)}`}
          >
            Check its progress <Icon name="arrow" size={16} />
          </Link>
        </div>
      )}
      <Dialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Leave your draft behind?"
      >
        <p className="muted">
          Signing out clears this tab’s unsaved sources and preview changes.
        </p>
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => setLogoutOpen(false)}
          >
            Keep editing
          </button>
          <button className="button danger" onClick={() => void leave()}>
            Discard and sign out
          </button>
        </div>
      </Dialog>
    </div>
  );
}
