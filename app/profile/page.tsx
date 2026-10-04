"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
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
  return <ProfileView />;
}

function ProfileView() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  if (isLoading) return <main><p role="status">Loading…</p></main>;
  if (!isAuthenticated) {
    return (
      <main>
        <h1>Profile</h1>
        <p>
          <Link href="/signin">Sign in</Link> to edit your profile.
        </p>
      </main>
    );
  }
  if (me === undefined || me === null) {
    return <main><p role="status">Loading profile…</p></main>;
  }
  return (
    <main>
      <h1>Profile</h1>
      <p>{me.email}</p>
      <ProfileForm
        key={me.profile?.displayName ?? "new"}
        displayName={me.profile?.displayName ?? ""}
        walletAddress={me.profile?.walletAddress ?? ""}
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
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
      <button type="submit">Save</button>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
