"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createTipRequest } from "@/lib/tipRequest";
import {
  TIP_AMOUNT_SOL,
  DEVNET_RPC_URL,
  createDevnetDeps,
  createFreshReference,
  createTipController,
  type TipController,
  type TipState,
} from "@/lib/tipReceipt";

/**
 * Minimal Solana Devnet tip: 0.01 SOL to the deal author's actual wallet.
 * Nothing is requested or polled until the viewer acknowledges Devnet and presses the button.
 * The wallet link and QR carry no cluster, so the acknowledgement is how Devnet is confirmed by the human.
 */
export function TipQR({ recipient }: { recipient: string }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [state, setState] = useState<TipState>({ status: "idle" });
  const [setupError, setSetupError] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<TipController | null>(null);
  const usedSignatures = useRef<Set<string>>(new Set());
  const alive = useRef(true);

  const stop = useCallback(() => {
    controllerRef.current?.cancel();
    controllerRef.current = null;
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
    };
  }, [stop]);

  async function begin() {
    if (!acknowledged) return;
    stop();
    setSetupError(null);
    setState({ status: "idle" });
    try {
      const request = createTipRequest({ recipient, reference: createFreshReference(), amount: TIP_AMOUNT_SOL });
      const [kit, pay] = await Promise.all([import("@solana/kit"), import("@solana/pay")]);
      if (!alive.current) return;
      setUri(request.uri);
      if (qrRef.current) {
        qrRef.current.replaceChildren();
        pay.createQR(request.uri, 220).append(qrRef.current);
      }
      const deps = createDevnetDeps({
        rpc: kit.createSolanaRpc(DEVNET_RPC_URL),
        pay,
        toAddress: kit.address,
      });
      const controller = createTipController(
        deps,
        { recipient, reference: request.reference, amount: request.amount },
        (next) => {
          if (alive.current && controllerRef.current === controller) setState(next);
        },
        usedSignatures.current,
      );
      controllerRef.current = controller;
      void controller.start();
    } catch {
      setSetupError("Could not prepare the tip request. Nothing was sent.");
    }
  }

  const polling = state.status === "polling";

  return (
    <section className="community-panel" aria-label="Tip the finder">
      <h2 className="detail-subheading">Tip the finder</h2>
      <p>Send {TIP_AMOUNT_SOL} SOL on Solana Devnet. Devnet SOL has no real value.</p>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={acknowledged}
          disabled={polling}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        <span>My wallet is set to Solana Devnet. The QR code cannot switch it for me.</span>
      </label>
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <button type="button" className="button secondary" disabled={!acknowledged || polling} onClick={() => void begin()}>
          Show tip QR
        </button>
        {polling && (
          <button type="button" className="button secondary" onClick={stop}>
            Cancel
          </button>
        )}
      </div>
      <div ref={qrRef} aria-label="Tip QR code" style={{ marginTop: 12 }} />
      {uri && acknowledged && (
        <p>
          <a href={uri}>Open in wallet</a>
        </p>
      )}
      <div role="status" aria-live="polite">
        {setupError && <p>{setupError}</p>}
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
