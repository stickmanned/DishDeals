"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark, Icon } from "./Icon";
import { useFrontend } from "./FrontendProvider";
import type { ReactNode } from "react";
import { AndroidBridge } from "./AndroidBridge";

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const app = useFrontend();
  const profileHref = app.authenticated ? "/profile" : "/signin";
  return (
    <>
      <AndroidBridge />
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="wordmark" aria-label="Dinedeals home">
            <BrandMark size={25} />
            <span>
              dine<span>deals</span>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="Main navigation">
            <Link href="/" aria-current={path === "/" ? "page" : undefined}>
              Discover
            </Link>
            <Link
              href="/post"
              aria-current={path.startsWith("/post") ? "page" : undefined}
            >
              Share a deal
            </Link>
            <Link href="/tools">Map & AI</Link>
            <Link href="/reels" aria-current={path === "/reels" ? "page" : undefined}>Saved Reels</Link>
          </nav>
          <div className="header-right">
            <span className="place-label">
              <Icon name="pin" size={16} /> Vancouver, BC
            </span>
            <Link
              href={profileHref}
              className="avatar"
              aria-label={app.authenticated ? "Your profile" : "Sign in"}
            >
              {app.authenticated ? (
                app.profile.displayName.slice(0, 1) || (
                  <Icon name="user" size={20} />
                )
              ) : (
                <Icon name="user" size={20} />
              )}
            </Link>
          </div>
        </div>
      </header>
      <main id="content" className="main-content">
        {app.mode === "live" && app.live?.connection && (
          <div className="connection-note page-width" role="status">
            {app.live.connection === "reconnecting"
              ? "Reconnecting… Shown deals may be out of date."
              : "Connecting to the live feed…"}
          </div>
        )}
        {children}
      </main>
      <footer className="site-footer">
        <Link href="/" className="wordmark small">
          <BrandMark size={16} />
          <span>
            dine<span>deals</span>
          </span>
        </Link>
        <span>Good food. A little less.</span>
        <span>Made for the neighbourhood.</span>
      </footer>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <Link href="/" aria-current={path === "/" ? "page" : undefined}>
          <Icon name="compass" />
          <span>Discover</span>
        </Link>
        <Link
          href="/post"
          aria-current={path.startsWith("/post") ? "page" : undefined}
        >
          <Icon name="plus" />
          <span>Post</span>
        </Link>
        <Link href="/tools" aria-current={path.startsWith("/tools") ? "page" : undefined}>
          <Icon name="pin" />
          <span>Map &amp; AI</span>
        </Link>
        <Link href="/reels" aria-current={path.startsWith("/reels") ? "page" : undefined}>
          <Icon name="camera" />
          <span>Reels</span>
        </Link>
        <Link
          href={profileHref}
          aria-current={
            path === "/profile" || path === "/signin" ? "page" : undefined
          }
        >
          <Icon name="user" />
          <span>Profile</span>
        </Link>
      </nav>
    </>
  );
}

export function PreviewNote({ short = false }: { short?: boolean }) {
  const app = useFrontend();
  return app.mode === "preview" ? (
    <div className="preview-note">
      <span className="preview-dot" />
      <span>
        {short
          ? "Preview · example content"
          : "You’re exploring example deals. Nothing here is published."}
      </span>
      <button onClick={() => app.setMode("live")}>
        View live feed <Icon name="arrow" size={14} />
      </button>
    </div>
  ) : null;
}

export function Gate({
  title,
  next,
  children,
}: {
  title: string;
  next: string;
  children?: ReactNode;
}) {
  return (
    <div className="gate panel">
      <div className="illustration-icon">
        <Icon name="user" size={32} />
      </div>
      <p className="eyebrow">A little community goes a long way</p>
      <h1>{title}</h1>
      <p>Join the people finding good food for less.</p>
      {children}
      <Link
        className="button primary"
        href={`/signin?next=${encodeURIComponent(next)}`}
      >
        Sign in <Icon name="arrow" size={18} />
      </Link>
      <Link href="/" className="text-link">
        Keep exploring
      </Link>
    </div>
  );
}
