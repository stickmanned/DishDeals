"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  TIP_AMOUNT_SOL,
  DEVNET_RPC_URL,
  createDevnetDeps,
  createTipSession,
  type TipSession,
  type TipView,
} from "@/lib/tipReceipt";

const IDLE: TipView = { status: "idle", uri: null, state: { status: "idle" } };

/**
 * Minimal Solana Devnet tip: 0.01 SOL to the deal author's actual wallet.
 * Nothing is requested or polled until the viewer acknowledges Devnet and presses the button.
 * The wallet link and QR carry no cluster, so the acknowledgement is how Devnet is confirmed by the human.
 *
 * Request lifetime lives in `createTipSession` (single flight, generations, abort). The QR and wallet link are
 * rendered only from `view.uri`, which the session clears at start, cancel, reset, setup failure and every
 * terminal state, so they never point at a request that is no longer tracked.
 */
export function TipQR({ recipient }: { recipient: string }) {
  // Keyed by recipient: a different recipient remounts, which disposes the old session and resets all state.
  return <TipQRForRecipient key={recipient} recipient={recipient} />;
}

function TipQRForRecipient({ recipient }: { recipient: string }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [view, setView] = useState<TipView>(IDLE);
  const sessionRef = useRef<TipSession | null>(null);
  const qrRef = useRef<HTMLDivElement | null>(null);

  // One session per mounted recipient. Unmount aborts the request; no callback can fire afterwards.
  useEffect(() => {
    const session = createTipSession({
      recipient,
      loadDeps: async () => {
        const [kit, pay] = await Promise.all([import("@solana/kit"), import("@solana/pay")]);
        return createDevnetDeps({ rpc: kit.createSolanaRpc(DEVNET_RPC_URL), pay, toAddress: kit.address });
      },
      onChange: setView,
    });
    sessionRef.current = session;
    return () => {
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [recipient]);

  // Draw the QR for the tracked URI only; clear it whenever the URI goes away. Stale imports are dropped.
  useEffect(() => {
    const target = qrRef.current;
    if (!target) return;
    target.replaceChildren();
    const uri = view.uri;
    if (!uri) return;
    let current = true;
    void import("@solana/pay").then((pay) => {
      if (!current || !qrRef.current) return;
      qrRef.current.replaceChildren();
      pay.createQR(uri, 220).append(qrRef.current);
    });
    return () => {
      current = false;
      target.replaceChildren();
    };
  }, [view.uri]);

  const busy = view.status !== "idle";
  const { state } = view;

  return (
    <section className="community-panel" aria-label="Tip the finder">
      <h2 className="detail-subheading">Tip the finder</h2>
      <p>Send {TIP_AMOUNT_SOL} SOL on Solana Devnet. Devnet SOL has no real value.</p>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => {
            setAcknowledged(e.target.checked);
            if (!e.target.checked) sessionRef.current?.reset();
          }}
        />
        <span>My wallet is set to Solana Devnet. The QR code cannot switch it for me.</span>
      </label>
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <button
          type="button"
          className="button secondary"
          disabled={!acknowledged || busy}
          onClick={() => {
            if (acknowledged) sessionRef.current?.begin();
          }}
        >
          Show tip QR
        </button>
        {busy && (
          <button type="button" className="button secondary" onClick={() => sessionRef.current?.cancel()}>
            Cancel
          </button>
        )}
      </div>
      <div ref={qrRef} aria-label="Tip QR code" style={{ marginTop: 12 }} />
      {view.uri && acknowledged && (
        <p>
          <a href={view.uri}>Open in wallet</a>
        </p>
      )}
      <div role="status" aria-live="polite">
        {view.status === "preparing" && <p>Preparing the tip request…</p>}
        {state.status === "polling" && <p>Waiting for your Devnet payment (up to 2 minutes)…</p>}
        {state.status === "received" && (
          <p>
            Tip received.{" "}
            <a href={state.explorerUrl} target="_blank" rel="noopener noreferrer">
              View on Solana Explorer (Devnet)
            </a>
          </p>
        )}
        {state.status === "unknown" && <p>{state.message}</p>}
        {state.status === "failed" && <p>{state.message}</p>}
        {state.status === "cancelled" && <p>Stopped checking. If you already paid, it may still arrive.</p>}
      </div>
    </section>
  );
}
