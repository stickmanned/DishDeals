// @vitest-environment node
// Synthetic replay of the Android share target (T-13B): the REAL public/sw.js runs in a vm sandbox with an
// injected request, an in-memory IndexedDB fake, a controllable clock and timers; the REAL lib reader then
// reads what the worker stored. The images, titles and links are made-up bytes/text.
//
// This is NOT an installed Android PWA, a real share sheet, Chrome's service-worker lifecycle, a real
// multipart upload from the OS or real IndexedDB quota behavior. A human Android phone is still required.
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  clearShares,
  createIdbShareStore,
  discardShare,
  isShareInboxSupported,
  parseShareQuery,
  readShare,
  SHARE_DB_NAME,
  SHARE_DB_VERSION,
  SHARE_MAX_ITEMS,
  SHARE_STORE,
  SHARE_TTL_MS,
} from "../../lib/androidShareInbox";

const file = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const read = (rel: string) => fs.readFileSync(file(rel), "utf8");
const swSource = read("public/sw.js");

// --------------------------------------------------------------- fake IndexedDB

type Row = Record<string, unknown>;
class FakeIdb {
  rows = new Map<string, Row>();
  hasStore = false;
  keyPath: string | null = null;
  version = 0;
  opens: { name: string; version: number }[] = [];
  closes = 0;
  failWrite = false;
  failOpen = false;

  open = (name: string, version: number) => {
    const req: Record<string, any> = { result: undefined, error: null }; // eslint-disable-line @typescript-eslint/no-explicit-any
    setTimeout(() => {
      if (this.failOpen) {
        req.error = new Error("open failed");
        req.onerror?.();
        return;
      }
      this.opens.push({ name, version });
      req.result = this.makeDb();
      if (this.version < version) {
        this.version = version;
        req.onupgradeneeded?.();
      }
      req.onsuccess?.();
    }, 0);
    return req;
  };

  private makeDb() {
    return {
      objectStoreNames: { contains: (n: string) => n === SHARE_STORE && this.hasStore },
      createObjectStore: (n: string, o: { keyPath: string }) => {
        if (n === SHARE_STORE) {
          this.hasStore = true;
          this.keyPath = o.keyPath;
        }
        return {};
      },
      close: () => {
        this.closes += 1;
      },
      transaction: (n: string) => {
        if (n !== SHARE_STORE || !this.hasStore) throw new Error("NotFoundError");
        return this.makeTx();
      },
    };
  }

  private makeTx() {
    let pending = 0;
    let done = false;
    const tx: Record<string, any> = { error: null }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const finish = () =>
      setTimeout(() => {
        if (pending === 0 && !done) {
          done = true;
          if (tx.error) tx.onabort?.();
          else tx.oncomplete?.();
        }
      }, 0);
    const request = (op: () => unknown, write = false) => {
      const req: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      pending += 1;
      setTimeout(() => {
        try {
          if (write && this.failWrite) throw new Error("QuotaExceededError");
          req.result = op();
          req.onsuccess?.();
        } catch (e) {
          tx.error = e;
          req.error = e;
        }
        pending -= 1;
        finish();
      }, 0);
      return req;
    };
    tx.objectStore = () => ({
      put: (v: Row) => request(() => (this.rows.set(v.id as string, v), v.id), true),
      get: (k: string) => request(() => this.rows.get(k)),
      getAll: () => request(() => [...this.rows.values()]),
      delete: (k: string) => request(() => (this.rows.delete(k), undefined), true),
      clear: () => request(() => (this.rows.clear(), undefined), true),
    });
    return tx;
  }
}

// ------------------------------------------------------------------ worker host

const ORIGIN = "https://app.example";

function loadWorker(idb: FakeIdb, opts: { controlledTimers?: boolean } = {}) {
  const clock = { now: 1_800_000_000_000 };
  const timerCallbacks: (() => void)[] = [];
  const handlers: Record<string, (event: unknown) => void> = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers[type] = handler;
    },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const sandbox = {
    self, indexedDB: idb, Response, Request, URL, Blob, Uint8Array, Promise, crypto, String, Number, Array, Error,
    Date: { now: () => clock.now },
    setTimeout: opts.controlledTimers ? (cb: () => void) => (timerCallbacks.push(cb), timerCallbacks.length) : setTimeout,
    clearTimeout: opts.controlledTimers ? () => undefined : clearTimeout,
  };
  vm.runInNewContext(swSource, sandbox, { filename: "sw.js" });

  async function dispatch(request: unknown): Promise<Response | null> {
    let responded: Promise<Response> | null = null;
    handlers.fetch({ request, respondWith: (p: Promise<Response>) => { responded = Promise.resolve(p); } });
    return responded;
  }
  return { clock, handlers, self, dispatch, fireTimer: () => timerCallbacks.forEach((cb) => cb()) };
}

// ------------------------------------------------------------------- fixtures

const bytes = (head: number[], size: number) => Uint8Array.from({ length: size }, (_, i) => head[i] ?? (i * 7) % 251);
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPG = [0xff, 0xd8, 0xff, 0xe0];
const pngFile = (size = 400, type = "image/png") => new File([bytes(PNG, size)], "Screenshot_private_name.png", { type });
const jpgFile = (size = 400) => new File([bytes(JPG, size)], "x.jpg", { type: "image/jpeg" });
const webpBytes = () => { const b = bytes([], 40); "RIFF".split("").forEach((c, i) => (b[i] = c.charCodeAt(0))); "WEBP".split("").forEach((c, i) => (b[8 + i] = c.charCodeAt(0))); return b; };

type Part = [string, string | File];
function shareRequest(parts: Part[], over: Record<string, unknown> = {}) {
  const form = new FormData();
  for (const [k, v] of parts) form.append(k, v);
  const real = new Request(`${ORIGIN}/share-target`, { method: "POST", body: form });
  // Request construction cannot set mode "navigate" in Node, so the worker gets a controlled stand-in.
  return { method: "POST", mode: "navigate", url: real.url, headers: real.headers, body: real.body, ...over };
}
const okParts = (): Part[] => [["image", pngFile()], ["title", "Private title"], ["text", "private words after 9pm"], ["url", "https://example.invalid/post/1"]];

const location = (res: Response | null) => res!.headers.get("location")!;
const shareId = (res: Response | null) => /^\/post\?share=([0-9a-f]{32})$/.exec(location(res))![1];
const errorCode = (res: Response | null) => /^\/post\?share_error=([a-z_]+)$/.exec(location(res))![1];

// ================================================================= manifest

describe("web app manifest and layout registration (static files)", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));

  it("declares a POST multipart share_target for one image plus title/text/url", () => {
    expect(manifest.share_target).toEqual({
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url", files: [{ name: "image", accept: ["image/jpeg", "image/png", "image/webp"] }] },
    });
    expect(manifest).toMatchObject({ display: "standalone", scope: "/", start_url: "/" });
  });

  it("points at real 192 and 512 PNG icons", () => {
    for (const [size, src] of [[192, "/share-icon-192.png"], [512, "/share-icon-512.png"]] as const) {
      expect(manifest.icons).toContainEqual(expect.objectContaining({ src, sizes: `${size}x${size}`, type: "image/png" }));
      const png = fs.readFileSync(file(`public${src}`));
      expect([...png.subarray(0, 8)]).toEqual(PNG);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
    }
  });

  it("the root layout only adds the manifest link and the registration mount", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/manifest: "\/manifest\.webmanifest"/);
    expect(layout).toMatch(/<PwaShareRegistration \/>/);
    for (const kept of ["ConvexClientProvider", "FrontendBoundary", "FrontendProvider", "<Shell>", 'import "./globals.css"', 'icons: { icon: "/icon.svg" }']) expect(layout).toContain(kept);
    const mount = read("components/PwaShareRegistration.tsx");
    expect(mount.startsWith('"use client"')).toBe(true);
    expect(mount).toMatch(/registerShareWorker/);
  });
});

// ====================================================================== routing

describe("service worker routing and non-caching", () => {
  it("never caches, fetches, logs or imports anything", () => {
    for (const forbidden of [/\bcaches\b/, /\bfetch\s*\(/, /importScripts/, /console\./, /XMLHttpRequest/, /sendBeacon/, /localStorage/]) expect(swSource).not.toMatch(forbidden);
    const worker = loadWorker(new FakeIdb());
    expect(Object.keys(worker.handlers).sort()).toEqual(["activate", "fetch", "install"]);
  });

  it("install and activate only take control; they cache nothing", async () => {
    const worker = loadWorker(new FakeIdb());
    const waits: Promise<unknown>[] = [];
    worker.handlers.install({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    worker.handlers.activate({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
    expect(worker.self.clients.claim).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["GET /share-target", { method: "GET" }],
    ["POST elsewhere", { url: `${ORIGIN}/api/deals` }],
    ["POST auth path", { url: `${ORIGIN}/.well-known/openid-configuration` }],
    ["POST trailing slash", { url: `${ORIGIN}/share-target/` }],
    ["POST prefix", { url: `${ORIGIN}/share-target-evil` }],
    ["other origin", { url: "https://evil.example/share-target" }],
    ["subdomain of origin", { url: "https://x.app.example/share-target" }],
    ["non-navigation POST", { mode: "cors" }],
    ["garbage url", { url: "not a url" }],
  ])("passes through untouched: %s", async (_name, over) => {
    const idb = new FakeIdb();
    const worker = loadWorker(idb);
    expect(await worker.dispatch(shareRequest(okParts(), over))).toBeNull();
    expect(idb.opens).toHaveLength(0);
  });

  it("handles exactly same-origin POST navigation to /share-target", async () => {
    const worker = loadWorker(new FakeIdb());
    expect(await worker.dispatch(shareRequest(okParts()))).not.toBeNull();
  });
});

// ================================================================ receive + store

describe("receiving a share (real worker, injected request and store)", () => {
  async function receiveOk(over: Part[] | null = null) {
    const idb = new FakeIdb();
    const worker = loadWorker(idb);
    const res = await worker.dispatch(shareRequest(over ?? okParts()));
    return { idb, worker, res };
  }

  it("stores one validated image privately and redirects 303 with only an opaque id", async () => {
    const { idb, res } = await receiveOk();
    expect(res!.status).toBe(303);
    const loc = location(res);
    expect(loc).toMatch(/^\/post\?share=[0-9a-f]{32}$/);
    for (const secret of ["Private", "private", "example.invalid", "Screenshot", "png", "token"]) expect(loc).not.toContain(secret);
    expect(res!.headers.get("set-cookie")).toBeNull();
    expect(idb.opens).toEqual([{ name: SHARE_DB_NAME, version: SHARE_DB_VERSION }]);
    expect(idb.keyPath).toBe("id");
    expect(idb.closes).toBe(1);
    const row = idb.rows.get(shareId(res))!;
    expect(row).toMatchObject({ v: 1, mime: "image/png", title: "Private title", text: "private words after 9pm", url: "https://example.invalid/post/1" });
    expect(row.expiresAt as number).toBe((row.createdAt as number) + SHARE_TTL_MS);
    expect(JSON.stringify(Object.keys(row))).not.toMatch(/name/); // the original file name is not kept
  });

  it("round trip: the real reader returns exactly the stored bytes and text", async () => {
    const original = pngFile(400);
    const { idb, res, worker } = await receiveOk([["image", original], ["title", "T"], ["url", "https://example.invalid/p"]]);
    const store = createIdbShareStore(idb as unknown as IDBFactory);
    const out = await readShare(store, shareId(res), worker.clock.now);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.share).toMatchObject({ title: "T", text: "", url: "https://example.invalid/p" });
    expect(out.share.file.type).toBe("image/png");
    expect(new Uint8Array(await out.share.file.arrayBuffer())).toEqual(new Uint8Array(await original.arrayBuffer()));
    // discard removes exactly one
    const second = await loadWorker(idb).dispatch(shareRequest(okParts()));
    expect(idb.rows.size).toBe(2);
    expect(await discardShare(store, shareId(res))).toBe(true);
    expect([...idb.rows.keys()]).toEqual([shareId(second)]);
    expect(await clearShares(store)).toBe(true);
    expect(idb.rows.size).toBe(0);
  });

  it("accepts JPEG and WebP and optional fields may be absent", async () => {
    for (const f of [jpgFile(), new File([webpBytes()], "w.webp", { type: "image/webp" })]) {
      const { res, idb } = await receiveOk([["image", f]]);
      expect(res!.status).toBe(303);
      expect(idb.rows.get(shareId(res))).toMatchObject({ mime: f.type, title: "", text: "", url: "" });
    }
  });

  const rejected: [string, Part[], string][] = [
    ["no files", [["title", "t"]], "no_image"],
    ["two images", [["image", pngFile()], ["image", pngFile()]], "multiple"],
    ["image plus a second file under another name", [["image", pngFile()], ["other", jpgFile()]], "multiple"],
    ["file under the wrong field name", [["photo", pngFile()]], "malformed"],
    ["empty file", [["image", new File([], "e.png", { type: "image/png" })]], "malformed"],
    ["gif", [["image", new File([bytes([0x47, 0x49, 0x46], 50)], "a.gif", { type: "image/gif" })]], "unsupported"],
    ["heic", [["image", new File([bytes([], 50)], "a.heic", { type: "image/heic" })]], "unsupported"],
    ["no declared type", [["image", new File([bytes(PNG, 50)], "a.png", { type: "" })]], "unsupported"],
    ["declared png but jpeg bytes", [["image", new File([bytes(JPG, 50)], "a.png", { type: "image/png" })]], "unsupported"],
    ["declared png but garbage bytes", [["image", new File([bytes([1, 2, 3], 50)], "a.png", { type: "image/png" })]], "unsupported"],
    ["image over 5 MiB", [["image", pngFile(5 * 1024 * 1024 + 1)]], "too_large"],
    ["title too long", [["image", pngFile()], ["title", "x".repeat(301)]], "malformed"],
    ["text too long", [["image", pngFile()], ["text", "x".repeat(5001)]], "malformed"],
    ["repeated text field", [["image", pngFile()], ["text", "a"], ["text", "b"]], "malformed"],
    ["text field sent as a file", [["image", pngFile()], ["text", jpgFile()]], "multiple"],
    ["javascript: url", [["image", pngFile()], ["url", "javascript:alert(1)"]], "malformed"],
    ["url with credentials", [["image", pngFile()], ["url", "https://user:pw@example.invalid/"]], "malformed"],
    ["url that is not a url", [["image", pngFile()], ["url", "just words"]], "malformed"],
  ];
  it.each(rejected)("rejects explicitly and stores nothing: %s", async (_name, parts, code) => {
    const { idb, res } = await receiveOk(parts);
    expect(res!.status).toBe(303);
    expect(location(res)).toBe(`/post?share_error=${code}`);
    expect(idb.rows.size).toBe(0);
  });

  it("rejects non-multipart and malformed bodies", async () => {
    const idb = new FakeIdb();
    const worker = loadWorker(idb);
    const base = shareRequest(okParts());
    for (const headers of [new Headers({ "content-type": "application/json" }), new Headers()]) {
      expect(errorCode(await worker.dispatch({ ...base, body: new Response("x").body, headers }))).toBe("malformed");
    }
    const broken = new Headers({ "content-type": "multipart/form-data; boundary=zzz" });
    expect(errorCode(await worker.dispatch({ ...base, body: new Response("not multipart at all").body, headers: broken }))).toBe("malformed");
    expect(errorCode(await worker.dispatch({ ...base, body: null }))).toBe("malformed");
    const badLength = new Headers({ "content-type": "multipart/form-data; boundary=zzz", "content-length": "12abc" });
    expect(errorCode(await worker.dispatch({ ...base, headers: badLength }))).toBe("malformed");
    expect(idb.rows.size).toBe(0);
  });

  it("refuses an oversize declared body without reading it", async () => {
    const idb = new FakeIdb();
    const worker = loadWorker(idb);
    const pull = vi.fn();
    const body = new ReadableStream({ pull }, { highWaterMark: 0 });
    const headers = new Headers({ "content-type": "multipart/form-data; boundary=zzz", "content-length": String(6 * 1024 * 1024) });
    const res = await worker.dispatch({ method: "POST", mode: "navigate", url: `${ORIGIN}/share-target`, headers, body });
    expect(errorCode(res)).toBe("too_large");
    expect(pull).not.toHaveBeenCalled();
    expect(body.locked).toBe(false); // the worker never even took a reader
  });

  it("stops reading an oversize body that declares no length", async () => {
    const idb = new FakeIdb();
    const worker = loadWorker(idb);
    let sent = 0;
    const cancel = vi.fn();
    const body = new ReadableStream({
      pull(controller) {
        sent += 1;
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel,
    });
    const headers = new Headers({ "content-type": "multipart/form-data; boundary=zzz" });
    const res = await worker.dispatch({ method: "POST", mode: "navigate", url: `${ORIGIN}/share-target`, headers, body });
    expect(errorCode(res)).toBe("too_large");
    expect(sent).toBeLessThan(10); // stopped near the 5.25 MB bound instead of draining forever
    expect(cancel).toHaveBeenCalled();
    expect(idb.rows.size).toBe(0);
  });

  it("times out a stalled body, cancels the read and stores nothing", async () => {
    const idb = new FakeIdb();
    const worker = loadWorker(idb, { controlledTimers: true });
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const headers = new Headers({ "content-type": "multipart/form-data; boundary=zzz" });
    const pending = worker.dispatch({ method: "POST", mode: "navigate", url: `${ORIGIN}/share-target`, headers, body });
    await new Promise((r) => setTimeout(r, 5));
    worker.fireTimer();
    expect(errorCode(await pending)).toBe("timeout");
    expect(cancel).toHaveBeenCalled();
    expect(idb.rows.size).toBe(0);
  });

  it("storage failure is a visible error redirect, never a fake receipt", async () => {
    const failing = new FakeIdb();
    failing.failWrite = true;
    const res = await loadWorker(failing).dispatch(shareRequest(okParts()));
    expect(location(res)).toBe("/post?share_error=storage");
    expect(failing.rows.size).toBe(0);

    const closed = new FakeIdb();
    closed.failOpen = true;
    expect(location(await loadWorker(closed).dispatch(shareRequest(okParts())))).toBe("/post?share_error=storage");
  });

  it("keeps at most 8 items: the 9th is refused, and expired items are pruned (TTL 24 h)", async () => {
    const idb = new FakeIdb();
    const worker = loadWorker(idb);
    const ids: string[] = [];
    for (let i = 0; i < SHARE_MAX_ITEMS; i += 1) ids.push(shareId(await worker.dispatch(shareRequest(okParts()))));
    expect(new Set(ids).size).toBe(SHARE_MAX_ITEMS); // random, distinct ids
    expect(errorCode(await worker.dispatch(shareRequest(okParts())))).toBe("inbox_full");
    expect(idb.rows.size).toBe(SHARE_MAX_ITEMS);

    worker.clock.now += SHARE_TTL_MS + 1;
    const res = await worker.dispatch(shareRequest(okParts()));
    expect(res!.status).toBe(303);
    expect(shareId(res)).toMatch(/^[0-9a-f]{32}$/);
    expect(idb.rows.size).toBe(1); // the 8 expired rows were removed in the same transaction

    const store = createIdbShareStore(idb as unknown as IDBFactory);
    expect(await readShare(store, ids[0], worker.clock.now)).toEqual({ ok: false, reason: "missing" });
  });
});

// ================================================================== reader vs store

describe("page reader against the same store", () => {
  it("expired records are refused and deleted; corrupt and mismatched records are refused", async () => {
    const idb = new FakeIdb();
    const worker = loadWorker(idb);
    const id = shareId(await worker.dispatch(shareRequest(okParts())));
    const store = createIdbShareStore(idb as unknown as IDBFactory);
    expect(await readShare(store, id, worker.clock.now + SHARE_TTL_MS)).toEqual({ ok: false, reason: "expired" });
    expect(idb.rows.has(id)).toBe(false);

    const again = shareId(await worker.dispatch(shareRequest(okParts())));
    idb.rows.get(again)!.mime = "image/jpeg"; // bytes are PNG
    expect(await readShare(store, again, worker.clock.now)).toEqual({ ok: false, reason: "invalid" });
    expect(idb.rows.has(again)).toBe(false);

    const third = shareId(await worker.dispatch(shareRequest(okParts())));
    idb.rows.get(third)!.url = "javascript:alert(1)";
    expect((await readShare(store, third, worker.clock.now)).ok).toBe(false);
  });

  it("never opens the store for a malformed id and reports an unavailable store", async () => {
    const idb = new FakeIdb();
    const store = createIdbShareStore(idb as unknown as IDBFactory);
    expect(await readShare(store, "../../etc/passwd")).toEqual({ ok: false, reason: "invalid_id" });
    expect(await readShare(store, "ABCDEF".repeat(6))).toEqual({ ok: false, reason: "invalid_id" });
    expect(idb.opens).toHaveLength(0);
    idb.failOpen = true;
    expect(await readShare(store, "a".repeat(32))).toEqual({ ok: false, reason: "unavailable" });
    expect(await discardShare(store, "a".repeat(32))).toBe(false);
    expect(await clearShares(store)).toBe(false);
  });

  it("feature-detects IndexedDB and uses the app's own database name and version", async () => {
    expect(isShareInboxSupported(undefined)).toBe(false);
    expect(isShareInboxSupported({})).toBe(false);
    expect(isShareInboxSupported(new FakeIdb())).toBe(true);
    const throwing = createIdbShareStore(undefined);
    await expect(throwing.get("a".repeat(32))).rejects.toThrow();
    expect(SHARE_DB_NAME).toBe("dishdeals-share-inbox");
    expect(SHARE_DB_VERSION).toBe(1);
  });

  it("the redirect targets round-trip through the strict query parser", async () => {
    const worker = loadWorker(new FakeIdb());
    const ok = await worker.dispatch(shareRequest(okParts()));
    expect(parseShareQuery(location(ok).split("?")[1])).toEqual({ kind: "id", id: shareId(ok) });
    const bad = await worker.dispatch(shareRequest([["title", "t"]]));
    expect(parseShareQuery(location(bad).split("?")[1])).toEqual({ kind: "error", code: "no_image" });
  });
});
