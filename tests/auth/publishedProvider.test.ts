// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// N-REMOTE-B: the published Anonymous provider is restored beside the canonical Password provider. Local mock backend
// with a synthetic, locally generated signing key; this is NOT live Convex Auth, a deployment, native auth or phone proof.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import * as authModule from "../../convex/auth";

const modules = import.meta.glob("../../convex/**/*.ts");
const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
async function signingEnv() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { pem, jwks: JSON.stringify({ keys: [{ use: "sig", ...jwk }] }) };
}
beforeEach(async () => {
  const keys = await signingEnv();
  vi.stubEnv("JWT_PRIVATE_KEY", keys.pem); vi.stubEnv("JWKS", keys.jwks); vi.stubEnv("SITE_URL", "https://app.example.test");
  vi.stubEnv("CONVEX_SITE_URL", "https://synthetic.convex.site");
});
afterEach(() => vi.unstubAllEnvs());

describe("published Anonymous provider alongside canonical Password", () => {
  it("signs an anonymous guest in as a real users row with no profile, and the guest is the workflow owner", async () => {
    const t = convexTest(schema, modules);
    const result = await t.action(api.auth.signIn, { provider: "anonymous", params: {} });
    expect(result.tokens?.token).toEqual(expect.any(String));
    const users = await t.run(ctx => ctx.db.query("users").collect());
    expect(users).toHaveLength(1);
    expect(users[0].isAnonymous).toBe(true);
    expect(await t.run(ctx => ctx.db.query("profiles").collect())).toEqual([]); // no fake account/profile
    // Existing guest identifiers keep working: the workflow owner is the user id before "|".
    const guest = t.withIdentity({ subject: `${users[0]._id}|session-1` });
    const { jobId } = await guest.mutation(api.workflow.jobs.submit, { inputJson: JSON.stringify({ source: { type: "text", text: "Example Ramen: 50% off bowls every Tuesday at 123 Example Street." } }) });
    expect((await t.run(ctx => ctx.db.get(jobId)))?.owner).toBe(users[0]._id);
  });

  it("still signs a password account up, so the canonical (native) path is unchanged", async () => {
    const t = convexTest(schema, modules);
    const result = await t.action(api.auth.signIn, { provider: "password", params: { flow: "signUp", email: "guest@example.com", password: "correct horse battery 9" } });
    expect(result.tokens?.token).toEqual(expect.any(String));
    const users = await t.run(ctx => ctx.db.query("users").collect());
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("guest@example.com");
    expect(users[0].isAnonymous).toBeUndefined();
    const accounts = await t.run(ctx => ctx.db.query("authAccounts").collect());
    expect(accounts.map(a => a.provider)).toEqual(["password"]);
  });

  it("keeps the single canonical auth export surface", () => {
    expect(Object.keys(authModule).sort()).toEqual(["auth", "isAuthenticated", "signIn", "signOut", "store"]);
  });

  it("rejects an unknown provider id", async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(api.auth.signIn, { provider: "email-link", params: {} })).rejects.toThrow();
  });

  it("leaves the canonical auth/profile/owner checks in force for signed-out callers and profile-less guests", async () => {
    const t = convexTest(schema, modules);
    const publish = { restaurant: "Synthetic Cafe", dealText: "Synthetic 2-for-1", validDays: [] as string[], conditions: [] as string[], lat: 49.25, lng: -122.95 };
    await t.action(api.auth.signIn, { provider: "anonymous", params: {} });
    const [guest] = await t.run(ctx => ctx.db.query("users").collect());
    const asGuest = t.withIdentity({ subject: `${guest._id}|session-1` });
    expect(await t.query(api.users.me, {})).toBeNull();
    expect(await asGuest.query(api.users.me, {})).toBeNull(); // a guest has no profile until it creates one
    await expect(t.mutation(api.deals.create, publish)).rejects.toThrow("Not signed in");
    await expect(asGuest.mutation(api.deals.create, publish)).rejects.toThrow("profile");
    await expect(t.mutation(api.users.upsertProfile, { displayName: "Sam" })).rejects.toThrow("Not signed in");
    expect(await t.run(ctx => ctx.db.query("deals").collect())).toEqual([]);
  });

  it("keeps the Convex Auth discovery routes, canonical upload routes and the /v1 token gate", async () => {
    const t = convexTest(schema, modules);
    expect((await t.fetch("/.well-known/openid-configuration")).status).toBe(200);
    const jwks = await t.fetch("/.well-known/jwks.json");
    expect(jwks.status).toBe(200);
    expect(Object.keys(await jwks.json())).toEqual(["keys"]);
    for (const path of ["/reel-source", "/deal-image"]) expect((await t.fetch(path, { method: "OPTIONS" })).status, path).not.toBe(404);
    expect((await t.fetch("/v1/jobs", { method: "POST", body: "{}" })).status).toBe(401); // no WORKFLOW_API_TOKEN configured
  });
});
