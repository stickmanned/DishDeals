"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { safeDestination } from "@/lib/frontend/workflow";
import { useFrontend } from "./FrontendProvider";
import { Icon } from "./Icon";
export function SignIn() {
  const app = useFrontend();
  const router = useRouter();
  const [create, setCreate] = useState(false),
    [show, setShow] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const destination = () =>
    safeDestination(new URLSearchParams(window.location.search).get("next"));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (create && password !== confirm) {
      setError("The passwords don’t match.");
      return;
    }
    if (!app.auth?.signIn) {
      setError("Account sign-in isn’t available in this version yet.");
      return;
    }
    setBusy(true);
    try {
      await app.auth.signIn(email, password, create);
      setPassword("");
      setConfirm("");
      router.push(destination());
    } catch {
      setError("We couldn’t sign you in. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="narrow-page">
      <Link href="/" className="back-link">
        <Icon name="back" size={16} /> Back to Discover
      </Link>
      <div className="page-heading">
        <p className="eyebrow">Come sit with us</p>
        <h1>{create ? "Good finds start with you." : "Welcome back."}</h1>
        <p>Share your finds and help someone eat well for less.</p>
      </div>
      <div className="panel">
        <div className="segmented" role="group" aria-label="Account mode">
          <button
            className={!create ? "active" : ""}
            aria-pressed={!create}
            onClick={() => {
              setCreate(false);
              setError("");
            }}
          >
            Sign in
          </button>
          <button
            className={create ? "active" : ""}
            aria-pressed={create}
            onClick={() => {
              setCreate(true);
              setError("");
            }}
          >
            Create account
          </button>
        </div>
        <form className="form-stack" onSubmit={submit}>
          <label className="field">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label className="field">
            Password
            <div className="password-field">
              <input
                type={show ? "text" : "password"}
                required
                minLength={8}
                autoComplete={create ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={create ? "At least 8 characters" : "Your password"}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
                onClick={() => setShow((s) => !s)}
              >
                <Icon name="eye" size={20} />
              </button>
            </div>
          </label>
          {create && (
            <label className="field">
              Confirm password
              <input
                type={show ? "text" : "password"}
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button
            className="button primary full"
            disabled={busy || !app.auth?.signIn}
          >
            {busy ? "Signing in…" : create ? "Create account" : "Sign in"}
            <Icon name="arrow" size={18} />
          </button>
          {!app.auth?.signIn && (
            <p className="quiet-note">
              Account sign-in isn’t available in this version yet. You can keep
              browsing.
            </p>
          )}
        </form>
        {app.mode === "live" && app.auth?.signInGuest && <button className="button secondary full" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await app.auth?.signInGuest?.(); router.push(destination()); } catch { setError("Guest sign-in failed. Please try again."); } finally { setBusy(false); } }}>Continue as guest</button>}
        {app.mode === "preview" && (
          <div className="preview-account">
            <p className="quiet-note">
              Want to try the screens? A preview account stays in this tab. It
              doesn’t create an account or publish a deal.
            </p>
            <button
              className="button secondary full"
              onClick={() => {
                app.signInPreview();
                router.push(destination());
              }}
            >
              Try the preview <Icon name="arrow" size={18} />
            </button>
          </div>
        )}
      </div>
      <div style={{ textAlign: "center", marginTop: 24 }}>
        <Link className="text-link" href="/">
          Keep exploring
        </Link>
      </div>
    </div>
  );
}
