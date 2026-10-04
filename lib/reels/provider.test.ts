import { expect, test, vi } from "vitest";
import { retrieveReel, safeMediaUrl } from "./provider";
const url = "https://instagram.com/reel/AbCdEf123/";
const media = { shortcode: "AbCdEf123", video_url: "https://scontent.cdninstagram.com/video.mp4", video_duration: 12, edge_media_to_caption: { edges: [{ node: { text: "Offer caption" } }] } };
test("downloads actual video and caption via documented server-authenticated provider", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ success: true, data: { xdt_shortcode_media: media } }))
    .mockResolvedValueOnce(new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]), { headers: { "content-type": "video/mp4" } }));
  const result = await retrieveReel(url, "server-secret", fetcher);
  expect(result.caption).toBe("Offer caption"); expect(result.blob.size).toBeGreaterThan(0);
  expect(fetcher.mock.calls[0][1]?.headers).toEqual({ "x-api-key": "server-secret" });
  expect(fetcher.mock.calls[1][1]).not.toHaveProperty("headers");
});
test.each([403, 404, 429, 500])("handles retrieval status %i without exposing provider response", async status => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("sensitive upstream text", { status }));
  await expect(retrieveReel(url, "key", fetcher)).rejects.not.toThrow("sensitive");
});
test("rejects private/missing media, mismatched reels, redirects and oversized content", async () => {
  for (const m of [{ ...media, video_url: undefined }, { ...media, shortcode: "different" }, { ...media, video_duration: 999 }]) {
    const f = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true, data: { xdt_shortcode_media: m } }));
    await expect(retrieveReel(url, "key", f)).rejects.toThrow();
  }
  for (const host of ["https://localhost/video", "https://evil.com/video", "https://cdninstagram.com.evil/video", "https://user:pass@s.cdninstagram.com/video"]) expect(() => safeMediaUrl(host)).toThrow();
  const f = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ success: true, data: { xdt_shortcode_media: media } })).mockResolvedValueOnce(new Response("x", { headers: { "content-type": "video/mp4", "content-length": "99999999" } }));
  await expect(retrieveReel(url, "key", f)).rejects.toThrow("12 MB");
});

// The provider documents these fields as nullable, e.g. for photo posts and unavailable media.
test.each([
  ["video_url", { ...media, video_url: null }],
  ["video_duration", { ...media, video_duration: null }],
  ["taken_at_timestamp", { ...media, taken_at_timestamp: null }],
  ["edge_media_to_caption", { ...media, edge_media_to_caption: null }],
  ["caption text", { ...media, edge_media_to_caption: { edges: [{ node: { text: null } }] } }],
])("treats a null %s as missing data, not a malformed response", async (_name, m) => {
  const f = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true, data: { xdt_shortcode_media: m } }));
  const error = await retrieveReel(url, "key", f).catch(e => e);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).not.toContain("unexpected data");
});
test.each([
  { success: false, data: null }, { success: false, message: "failed" }, { success: true, data: { xdt_shortcode_media: null } },
])("reports an unavailable post for provider failures shaped %j", async body => {
  const f = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
  const error = await retrieveReel(url, "key", f).catch(e => e);
  expect(error).toMatchObject({ code: "UNAVAILABLE" });
  expect(error.message).not.toContain("unexpected data");
});
test("a photo post (no video) points the user to upload instead of a provider-data error", async () => {
  const photo = { shortcode: "AbCdEf123", video_url: null, video_duration: null, edge_media_to_caption: { edges: [{ node: { text: "caption" } }] } };
  const f = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true, data: { xdt_shortcode_media: photo } }));
  await expect(retrieveReel(url, "key", f)).rejects.toMatchObject({ code: "UNAVAILABLE", message: expect.stringContaining("No accessible video") });
});
test("a genuinely malformed response is still rejected, and reports only field paths", async () => {
  const f = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true, data: { xdt_shortcode_media: { shortcode: 42 } } }));
  const error = await retrieveReel(url, "key", f).catch(e => e);
  expect(error).toMatchObject({ code: "RETRIEVAL_FAILED" });
  expect(error.detail).toContain("data.xdt_shortcode_media.shortcode");
  expect(JSON.stringify(error)).not.toContain("42");
});

test("retrieves a shared single-photo post using its full image instead of requiring video", async () => {
  const photo = { ...media, __typename: "XDTGraphImage", is_video: false, video_url: null, video_duration: null, display_url: "https://scontent.cdninstagram.com/post.jpg" };
  const f = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ success: true, data: { xdt_shortcode_media: photo } }))
    .mockResolvedValueOnce(new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { headers: { "content-type": "image/jpeg" } }));
  const result = await retrieveReel(url.replace("/reel/", "/p/"), "key", f);
  expect(result.blob.type).toBe("image/jpeg");
  expect(result.duration).toBe(0);
  expect(result.caption).toBe("Offer caption");
  expect(f.mock.calls[1][0]).toBe(photo.display_url);
  expect(f.mock.calls[1][1]).not.toHaveProperty("headers");
});

test.each([
  ["bad signature", new Uint8Array([1, 2, 3]), {}],
  ["over limit", new Uint8Array([0xff, 0xd8, 0xff]), { "content-length": "5242881" }],
])("rejects a photo with %s before extraction", async (_name, bytes, extraHeaders) => {
  const photo = { ...media, __typename: "XDTGraphImage", is_video: false, video_url: null, display_url: "https://scontent.cdninstagram.com/photo.jpg" };
  const f = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ success: true, data: { xdt_shortcode_media: photo } }))
    .mockResolvedValueOnce(new Response(bytes, { headers: { "content-type": "image/jpeg", ...extraHeaders } }));
  await expect(retrieveReel(url, "key", f)).rejects.toMatchObject({ code: "MEDIA_UNSUPPORTED" });
});
test("never treats a carousel cover or unavailable video thumbnail as the full source", async () => {
  for (const kind of ["XDTGraphSidecar", "XDTGraphVideo"]) {
    const photo = { ...media, __typename: kind, is_video: false, video_url: null, display_url: "https://scontent.cdninstagram.com/cover.jpg" };
    const f = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true, data: { xdt_shortcode_media: photo } }));
    await expect(retrieveReel(url, "key", f)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(f).toHaveBeenCalledTimes(1);
  }
});
