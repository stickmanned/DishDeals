/* DishDeals share-target service worker (T-13B).
 *
 * Does exactly one thing: receive the Android share-target POST (same-origin POST /share-target, a navigation),
 * validate it, keep ONE image plus optional title/text/url in a private IndexedDB inbox, and answer 303 to
 * /post?share=<opaque random id>. Everything else passes through untouched: no respondWith for any other
 * request, no Cache API, no fetch of any kind, so no auth, API, backend or private response is ever cached or
 * proxied and nothing is offline-published. File bytes, text and links never appear in a URL or a log (this
 * file never logs).
 *
 * Plain JS (it is served as a static file), so the constants below duplicate lib/androidShareInbox.ts; a
 * round-trip test runs this worker and that reader against the same store.
 *
 * Honest limit: multipart parsing needs Response.formData(), which buffers the whole (bounded) body in memory.
 * The body is therefore read through a byte counter first and refused above MAX_BODY_BYTES (about 5.25 MB),
 * with a 25 s deadline for the whole receive.
 */
"use strict";

var DB_NAME = "dishdeals-share-inbox";
var DB_VERSION = 1;
var STORE = "shares";
var SHARE_PATH = "/share-target";
var TTL_MS = 24 * 60 * 60 * 1000;
var MAX_ITEMS = 8;
var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
var MAX_BODY_BYTES = MAX_IMAGE_BYTES + 256 * 1024;
var MAX_TITLE = 300;
var MAX_TEXT = 5000;
var MAX_URL = 2048;
var DEADLINE_MS = 25000;
var ALLOWED = ["image/jpeg", "image/png", "image/webp"];

function redirect(path) {
  return new Response(null, { status: 303, headers: { Location: path } });
}

function failure(code) {
  return redirect("/post?share_error=" + code);
}

function isShareRequest(request) {
  if (request.method !== "POST" || request.mode !== "navigate") return false;
  var url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  return url.origin === self.location.origin && url.pathname === SHARE_PATH;
}

/* Per-receive state shared by every stage. `cancelled` is set by the deadline; from then on no stage may start or
 * finish a write, a late-opened database closes itself, and a pending write transaction is aborted. `committed`
 * is set synchronously when the write transaction completes so a deadline firing afterwards cannot discard it. */
function newState() {
  return { cancelled: false, committed: false, reader: null, db: null, tx: null };
}

function cancelled() {
  return new Error("cancelled");
}

function openDb(state) {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function () {
      if (state.cancelled) {
        try {
          request.transaction.abort();
        } catch {
          /* nothing to abort */
        }
        return;
      }
      var db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = function () {
      var db = request.result;
      if (state.cancelled) {
        db.close(); /* opened after the deadline: never leave the connection open */
        reject(cancelled());
        return;
      }
      state.db = db;
      resolve(db);
    };
    request.onerror = function () {
      reject(request.error || new Error("open failed"));
    };
    request.onblocked = function () {
      reject(new Error("open blocked"));
    };
  });
}

/* One readwrite transaction: prune expired rows, refuse when still full, otherwise add the record. */
function saveShare(record, state) {
  return openDb(state).then(function (db) {
    return new Promise(function (resolve, reject) {
      var full = false;
      var tx;
      function closeDb() {
        try {
          db.close();
        } catch {
          /* already closed */
        }
        if (state.db === db) state.db = null;
      }
      if (state.cancelled) {
        closeDb();
        reject(cancelled());
        return;
      }
      try {
        tx = db.transaction(STORE, "readwrite");
        state.tx = tx;
        var store = tx.objectStore(STORE);
        var all = store.getAll();
        all.onsuccess = function () {
          if (state.cancelled) {
            /* the deadline passed while reading: write nothing and roll the transaction back */
            try {
              tx.abort();
            } catch {
              /* already finishing */
            }
            return;
          }
          var live = 0;
          var rows = all.result || [];
          for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row || typeof row.expiresAt !== "number" || row.expiresAt <= Date.now()) {
              if (row && row.id) store.delete(row.id);
            } else live++;
          }
          if (live >= MAX_ITEMS) full = true;
          else store.put(record);
        };
      } catch (e) {
        closeDb();
        reject(e);
        return;
      }
      tx.oncomplete = function () {
        if (state.cancelled && !full) {
          /* abort lost the race with the commit: remove the ghost record, then report cancellation */
          try {
            var undo = db.transaction(STORE, "readwrite");
            undo.objectStore(STORE).delete(record.id);
            undo.oncomplete = undo.onerror = undo.onabort = closeDb;
          } catch {
            closeDb();
          }
          reject(cancelled());
          return;
        }
        state.committed = true;
        closeDb();
        resolve(full ? "inbox_full" : "ok");
      };
      tx.onerror = tx.onabort = function () {
        closeDb();
        reject(tx.error || new Error("transaction failed"));
      };
    });
  });
}

function randomId() {
  var bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  var out = "";
  for (var i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
  return out;
}

function detectType(b) {
  var s = function (i, n) {
    return String.fromCharCode.apply(null, Array.prototype.slice.call(b, i, i + n));
  };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && s(0, 4) === "RIFF" && s(8, 4) === "WEBP") return "image/webp";
  return null;
}

/* Reads the body through a byte counter; resolves null when it would exceed the bound or the receive was cancelled. */
function readBounded(body, state) {
  var reader = body.getReader();
  state.reader = reader;
  var chunks = [];
  var total = 0;
  function step() {
    return reader.read().then(function (r) {
      if (state.cancelled) return null;
      if (r.done) return chunks;
      total += r.value.byteLength;
      if (total > MAX_BODY_BYTES) {
        reader.cancel().catch(function () {});
        return null;
      }
      chunks.push(r.value);
      return step();
    });
  }
  return step();
}

function textField(form, name, max) {
  var values = form.getAll(name);
  if (values.length === 0) return "";
  if (values.length > 1 || typeof values[0] !== "string") return null;
  var value = values[0].trim();
  return value.length > max ? null : value;
}

function validLink(value) {
  try {
    var url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

/* Resolves { id } or { code }. Never stores anything unless every check passed and the receive is still live. */
function receive(request, state) {
  var contentType = request.headers.get("content-type") || "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) return Promise.resolve({ code: "malformed" });
  var length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d{1,10}$/.test(length)) return Promise.resolve({ code: "malformed" });
    if (Number(length) > MAX_BODY_BYTES) return Promise.resolve({ code: "too_large" });
  }
  if (!request.body) return Promise.resolve({ code: "malformed" });

  return readBounded(request.body, state).then(function (chunks) {
    if (state.cancelled) return { code: "timeout" };
    if (chunks === null) return { code: "too_large" };
    return new Response(new Blob(chunks), { headers: { "content-type": contentType } }).formData().then(
      function (form) {
        return state.cancelled ? { code: "timeout" } : inspect(form, state);
      },
      function () {
        return { code: "malformed" };
      }
    );
  });
}

function inspect(form, state) {
  var files = [];
  form.forEach(function (value, key) {
    if (typeof value !== "string") files.push({ key: key, file: value });
  });
  if (files.length === 0) return { code: "no_image" };
  if (files.length > 1) return { code: "multiple" };
  if (files[0].key !== "image") return { code: "malformed" };
  var file = files[0].file;
  if (!(file.size > 0)) return { code: "malformed" };
  if (file.size > MAX_IMAGE_BYTES) return { code: "too_large" };
  var type = String(file.type || "").toLowerCase();
  if (ALLOWED.indexOf(type) < 0) return { code: "unsupported" };
  var title = textField(form, "title", MAX_TITLE);
  var text = textField(form, "text", MAX_TEXT);
  var url = textField(form, "url", MAX_URL);
  if (title === null || text === null || url === null) return { code: "malformed" };
  if (url !== "" && !validLink(url)) return { code: "malformed" };

  return file.slice(0, 12).arrayBuffer().then(
    function (buffer) {
      if (state.cancelled) return { code: "timeout" }; /* the deadline passed during the signature read: no storage */
      if (detectType(new Uint8Array(buffer)) !== type) return { code: "unsupported" };
      var now = Date.now();
      var id = randomId();
      return saveShare({ v: 1, id: id, createdAt: now, expiresAt: now + TTL_MS, mime: type, image: file, title: title, text: text, url: url }, state).then(
        function (outcome) {
          return outcome === "ok" ? { id: id } : { code: outcome };
        },
        function () {
          return { code: state.cancelled ? "timeout" : "storage" };
        }
      );
    },
    function () {
      return { code: "malformed" };
    }
  );
}

/* Stops everything still in flight for this receive. Called only by the deadline. */
function cancelReceive(state) {
  state.cancelled = true;
  if (state.reader) state.reader.cancel().catch(function () {});
  if (state.tx) {
    try {
      state.tx.abort();
    } catch {
      /* already committing or finished; the commit path removes any ghost record */
    }
  }
  if (state.db) {
    try {
      state.db.close();
    } catch {
      /* already closed */
    }
    state.db = null;
  }
}

function handleShare(request) {
  var state = newState();
  var timer;
  var deadline = new Promise(function (resolve) {
    timer = setTimeout(function () {
      if (state.committed) return; /* the write already completed: its result stands */
      cancelReceive(state);
      resolve({ code: "timeout" });
    }, DEADLINE_MS);
  });
  var work = receive(request, state).catch(function () {
    return { code: state.cancelled ? "timeout" : "storage" };
  });
  return Promise.race([work, deadline]).then(function (result) {
    clearTimeout(timer);
    return result.id ? redirect("/post?share=" + result.id) : failure(result.code);
  });
}

self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  if (!isShareRequest(event.request)) return; /* every other request goes to the network untouched */
  event.respondWith(handleShare(event.request));
});
