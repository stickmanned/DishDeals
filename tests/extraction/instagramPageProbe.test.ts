/// <reference types="vite/client" />
// Synthetic SDK replies + real in-memory internal action. No live page/provider call.
import { vi } from "vitest";
const sdk = vi.hoisted(() => ({ create: vi.fn(), construct: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: vi.fn(function (options: unknown) {
  sdk.construct(options); return { interactions: { create: sdk.create } };
}) }));
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import type { PageProbeOutcome } from "../../lib/instagramPageProbe";

const URL = "https://www.instagram.com/p/C8AMUvOxv8m/";
const KEY = "SYNTHETIC-PROBE-KEY";
const modules = import.meta.glob("../../convex/**/*.ts");
const probe = makeFunctionReference<"action", { url: string }, PageProbeOutcome>("instagramPageProbe:probe");
const text = "Caption: Fixture cafe offer. Address: unknown.";
const resultStep = (status = "success", url = URL) => ({ type: "url_context_result", call_id: "fixture", result: [{ url, status }] });
const outputStep = (value = text) => ({ type: "model_output", content: [{ type: "text", text: value }] });
const reply = (steps: unknown[] = [resultStep(), outputStep()]) => ({ id: "fixture", status: "completed", steps });
const run = (url = URL) => convexTest(schema, modules).action(probe, { url });
function enable() {
  vi.stubEnv("IMAGE_PROVIDER_USAGE_AUTHORIZED", "true"); vi.stubEnv("GEMINI_API_KEY", KEY); vi.stubEnv("GEMINI_IMAGE_MODEL", "gemini-3.8-flash");
}
beforeEach(() => {
  vi.stubEnv("IMAGE_PROVIDER_USAGE_AUTHORIZED", ""); vi.stubEnv("GEMINI_API_KEY", ""); vi.stubEnv("GEMINI_IMAGE_MODEL", "");
  sdk.create.mockReset(); sdk.construct.mockReset(); sdk.create.mockResolvedValue(reply());
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected live network"); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("bounded exact-page internal diagnostic", () => {
  it.each(["https://www.instagram.com/p/OTHER/", "https://www.instagram.com/reel/C8AMUvOxv8m/", "https://instagram.com/p/C8AMUvOxv8m/", `${URL}?x=1`, `${URL}#caption`, URL.slice(0, -1), ` ${URL}`, "https://example.invalid/", "http://www.instagram.com/p/C8AMUvOxv8m/"])("blocks URL %s before SDK construction", async url => {
    enable(); await expect(run(url)).rejects.toMatchObject({ data: { code: "INVALID_URL" } });
    expect(sdk.construct).not.toHaveBeenCalled(); expect(sdk.create).not.toHaveBeenCalled();
  });
  it.each(["IMAGE_PROVIDER_USAGE_AUTHORIZED", "GEMINI_API_KEY", "GEMINI_IMAGE_MODEL"])("blocks absent config %s before SDK construction", async key => {
    enable(); vi.stubEnv(key, ""); await expect(run()).rejects.toMatchObject({ data: { code: "CONFIGURATION" } });
    expect(sdk.construct).not.toHaveBeenCalled(); expect(sdk.create).not.toHaveBeenCalled();
  });
  it("requires the exact provider authorization value", async () => {
    enable(); vi.stubEnv("IMAGE_PROVIDER_USAGE_AUTHORIZED", "TRUE");
    await expect(run()).rejects.toMatchObject({ data: { code: "CONFIGURATION" } }); expect(sdk.construct).not.toHaveBeenCalled();
  });
  it("returns genuine exact-page metadata and only unconfirmed bounded model text", async () => {
    enable(); const got = await run();
    expect(got).toMatchObject({ status: "retrieved", sourceUrl: URL, retrieval: { url: URL, status: "success" }, text, unconfirmed: true, videoExamined: false });
    expect(got.notice).toContain("Unconfirmed");
    expect(sdk.create).toHaveBeenCalledTimes(1);
    const [request, options] = sdk.create.mock.calls[0];
    expect(request).toMatchObject({ model: "gemini-3.8-flash", tools: [{ type: "url_context" }], store: false, stream: false, background: false });
    expect(request.input).toContain(URL); expect(request.system_instruction).toMatch(/untrusted/i);
    expect(request.system_instruction).toMatch(/video|audio/i); expect(request.system_instruction).toMatch(/nested|other URL/i);
    expect(options).toMatchObject({ timeout_ms: 60000, retries: { strategy: "none" } });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(request)).not.toContain(KEY);
    expect(fetch).not.toHaveBeenCalled(); // SDK is mocked; no direct Instagram fetching
  });
  it.each(["x", "\n", '"', "\\", "\u0001", "🍜"])("bounds the entire returned diagnostic below 2000 chars for %s", async character => {
    enable(); sdk.create.mockResolvedValue(reply([resultStep(), outputStep(character.repeat(10000))]));
    const got = await run(); expect(got.text.length).toBeGreaterThan(0); expect(got.text.length).toBeLessThanOrEqual(2000);
    expect(JSON.stringify(got).length).toBeLessThanOrEqual(2000);
  });
  it.each(["error", "paywall", "unsafe", "unknown-new-status"])("suppresses guesses on retrieval %s", async status => {
    enable(); sdk.create.mockResolvedValue(reply([resultStep(status), outputStep("GUESSED OFFER")]));
    const got = await run(); expect(got.status).toBe("unsupported"); expect(got.text).toBe(""); expect(JSON.stringify(got)).not.toContain("GUESSED");
    expect(got.retrieval?.url).toBe(URL); expect(got.unconfirmed).toBe(true); expect(got.videoExamined).toBe(false);
  });
  it.each([
    reply([outputStep("GUESSED")]),
    reply([{ type: "url_context_result", result: [] }, outputStep("GUESSED")]),
    reply([{ type: "url_context_result", result: [{ url: URL, status: "success" }] }, outputStep("GUESSED")]),
    reply([{ type: "url_context_result", result: [{ url: URL }] }, outputStep("GUESSED")]),
    reply([resultStep("success", "https://example.invalid/"), outputStep("GUESSED")]),
    reply([resultStep(), resultStep("success", "https://example.invalid/"), outputStep("GUESSED")]),
    reply([resultStep(), resultStep("error"), outputStep("GUESSED")]),
    reply([{ ...resultStep(), is_error: true }, outputStep("GUESSED")]),
    reply([{ ...resultStep(), is_error: "false" }, outputStep("GUESSED")]),
    { ...reply(), status: "incomplete" }, { ...reply(), errors: [{ message: "PROVIDER PRIVATE DETAILS" }] },
    reply([resultStep(), { ...outputStep("GUESSED"), error: { message: "PRIVATE" } }]),
    reply([resultStep(), { type: "url_context_call", arguments: { urls: ["https://example.invalid/"] } }, outputStep("GUESSED")]),
    reply([resultStep(), { type: "model_output", content: [{ type: "text", text: "GUESSED", annotations: [{ type: "url_citation", url: "https://example.invalid/" }] }] }]),
    null,
  ])("fails closed on missing, conflicting or unrelated metadata %#", async response => {
    enable(); sdk.create.mockResolvedValue(response);
    const got = await run(); expect(got.status).toBe("unsupported"); expect(got.text).toBe("");
    expect(JSON.stringify(got)).not.toMatch(/GUESSED|PROVIDER PRIVATE|example.invalid/);
  });
  it("sanitizes constructor/provider errors, never logs and never retries", async () => {
    enable(); const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    sdk.create.mockRejectedValue(new Error(`private headers key=${KEY} request body`));
    const failure = await run().catch(error => error);
    expect(failure.data).toEqual({ code: "PROVIDER_ERROR", message: "The page diagnostic failed. No retry was attempted." });
    expect(String(failure)).not.toContain(KEY); expect(sdk.create).toHaveBeenCalledTimes(1);
    sdk.construct.mockImplementationOnce(() => { throw new Error(KEY); });
    await expect(run()).rejects.toMatchObject({ data: { code: "PROVIDER_ERROR" } });
    expect(sdk.create).toHaveBeenCalledTimes(1); for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
  it("enforces a 60s deadline, aborts and never falls back", async () => {
    enable(); vi.useFakeTimers(); sdk.create.mockImplementation(() => new Promise(() => {}));
    const failure = run().then(() => null, (error: unknown) => error);
    await vi.waitFor(() => expect(sdk.create).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(60000);
    expect(await failure).toMatchObject({ data: { code: "TIMEOUT" } });
    expect(sdk.create.mock.calls[0][1].signal.aborted).toBe(true); expect(sdk.create).toHaveBeenCalledTimes(1);
  });
  it("is a Node internal action with a strict URL argument", async () => {
    const { probe: registered } = await import("../../convex/instagramPageProbe");
    expect(registered.isInternal).toBe(true);
    const t = convexTest(schema, modules); enable();
    for (const args of [{}, { url: 123 }, { url: URL, apiKey: KEY }]) await expect(t.action(probe, args as never)).rejects.toThrow();
    expect(sdk.create).not.toHaveBeenCalled();
  });
  it.each([200, 503])("installed SDK uses only Google interactions and one simulated HTTP call on %s", async status => {
    enable(); await run();
    const [request, options] = sdk.create.mock.calls[0];
    const { GoogleGenAI } = await vi.importActual<typeof import("@google/genai")>("@google/genai");
    const network = vi.fn(async (input: RequestInfo | URL) => {
      const target = input instanceof Request ? input.url : String(input);
      expect(new globalThis.URL(target).hostname).toBe("generativelanguage.googleapis.com");
      return new Response(JSON.stringify(status === 200 ? reply() : { error: { message: "Synthetic unavailable" } }), { status, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", network);
    const actual = new GoogleGenAI({ apiKey: KEY, vertexai: false });
    if (status === 200) {
      const response = await actual.interactions.create(request, options);
      expect(response.steps).toContainEqual(resultStep());
    } else {
      await expect(actual.interactions.create(request, options)).rejects.toThrow();
    }
    expect(network).toHaveBeenCalledTimes(1);
    const sent = network.mock.calls[0][0];
    const target = sent instanceof Request ? sent.url : String(sent);
    expect(target).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/interactions/);
    expect(target).not.toContain(KEY); expect(target).not.toContain("instagram.com");
  });
});
