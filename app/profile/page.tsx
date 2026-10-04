"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { profileFlow, returnFromParams, signInHref } from "@/lib/authReturn";
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from "@/lib/profile";

export default function ProfilePage() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <main>
        <h1>Profile</h1>
        <p role="status">Convex is not configured: NEXT_PUBLIC_CONVEX_URL is unset.</p>
      </main>
    );
  }
  // useSearchParams needs a Suspense boundary so the rest of the route can still be prerendered.
  return (
    <Suspense fallback={<main><p role="status">Loading…</p></main>}>
      <ProfileView />
    </Suspense>
  );
}

function ProfileView() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const router = useRouter();
  // Validated same-origin app route (or null) from sign-in; never navigated unless it passed the whitelist.
  const next = returnFromParams(useSearchParams());
  // Continue only for a signed-in user whose profile exists (actual users.me): either they already had one, or the
  // save below just created it. Nothing is navigated away from while the form still holds unsaved or failed edits.
  const flow = isAuthenticated && me !== undefined ? profileFlow(next, Boolean(me?.displayName)) : "none";
  const continued = useRef(false);
  useEffect(() => {
    if (flow === "continue" && next && !continued.current) {
      continued.current = true;
      router.replace(next);
    }
  }, [flow, next, router]);
  if (isLoading) return <main><p role="status">Loading…</p></main>;
  if (!isAuthenticated) {
    return (
      <main>
        <h1>Profile</h1>
        <p>
          <Link href={signInHref(next)}>Sign in</Link> to edit your profile.
        </p>
      </main>
    );
  }
  if (me === undefined) {
    return <main><p role="status">Loading profile…</p></main>;
  }
  if (flow === "continue" && next) {
    return (
      <main>
        <h1>Profile</h1>
        <p role="status">Profile ready. Continuing…</p>
        <p>
          <Link href={next}>Continue</Link>
        </p>
      </main>
    );
  }
  return (
    <main>
      <h1>Profile</h1>
      <ProfileForm
        key={me?.displayName ?? "new"}
        displayName={me?.displayName ?? ""}
        walletAddress={me?.walletAddress ?? ""}
      />
    </main>
  );
}

function ProfileForm(props: { displayName: string; walletAddress: string }) {
  const upsert = useMutation(api.users.upsertProfile);
  const [displayName, setDisplayName] = useState(props.displayName);
  const [walletAddress, setWalletAddress] = useState(props.walletAddress);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return; // no duplicate submission; edits stay in state on error
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      await upsert({
        displayName,
        walletAddress: walletAddress.trim() || undefined,
      });
      setStatus("Saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label>
        Display name
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          minLength={DISPLAY_NAME_MIN}
          maxLength={DISPLAY_NAME_MAX}
          required
        />
      </label>
      <label>
        Solana wallet (optional)
        <input
          value={walletAddress}
          onChange={(e) => setWalletAddress(e.target.value)}
        />
      </label>
      <button type="submit" disabled={busy}>Save</button>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
