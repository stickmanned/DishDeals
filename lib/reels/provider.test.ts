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
