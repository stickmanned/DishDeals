import { describe, expect, it } from "vitest";
import { buildSharedSource } from "./share-source";
import { inputSchema } from "../workflow/contracts";

describe("smart sharing", () => {
  it.each(["https://restaurant.example/offers", "https://www.instagram.com/reel/ABC123/?igsh=tracking", "www.restaurant.example/menu.pdf"])("accepts a shared link without an image: %s", (text) => {
    const source = buildSharedSource({ text });
    expect(source.type).toBe("url");
    expect(inputSchema.safeParse({ source }).success).toBe(true);
    expect(JSON.stringify(source)).not.toContain("tracking");
  });
  it("keeps copied share text and attribution together", () => {
    expect(buildSharedSource({ text: "Free tea with lunch https://www.instagram.com/p/ABC123/" })).toMatchObject({
      type: "url", caption: "Free tea with lunch", sourceUrl: "https://www.instagram.com/p/ABC123/",
    });
  });
  it("uses an optional image with the linked source", () => {
    const source = buildSharedSource({ text: "https://restaurant.example/menu", image: "data:image/jpeg;base64,/9j/" });
    expect(source).toMatchObject({ type: "image", sourceUrl: "https://restaurant.example/menu" });
    expect(inputSchema.safeParse({ source }).success).toBe(true);
  });
  it("accepts plain offer text and refuses unsafe shared URLs", () => {
    expect(buildSharedSource({ text: "CAD 5 lunch special, weekdays." }).type).toBe("text");
    expect(() => buildSharedSource({ text: "https://user:password@restaurant.example/offer" })).toThrow("public HTTPS");
    expect(() => buildSharedSource({ text: "https://127.0.0.1/offer" })).toThrow("public HTTPS");
    expect(() => buildSharedSource({ text: "" })).toThrow("Paste a link");
  });
});
