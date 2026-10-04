// Synthetic pure checks of the production resolver and URL builders. No live auth, no phone, no router.
import { describe, expect, it } from "vitest";
import { MAX_NEXT_LENGTH, parseReturn, profileFlow, profileHref, returnFromParams, signInHref } from "../../lib/authReturn";

const accepted = ["/post", "/reels", "/reels?item=Abc123", "/deal/k17abc", "/deal/k17abc/edit", `/reels?item=${"a".repeat(128)}`];
const rejected: [string, string | null | undefined][] = [
  ["absolute URL", "https://evil.example/post"],
  ["scheme", "javascript:alert(1)"],
  ["data scheme", "data:text/html,x"],
  ["protocol-relative", "//evil.example/post"],
  ["backslash", "/\\evil.example"],
  ["backslash trick", "/post\\@evil"],
  ["credentials", "/post@evil.example"],
  ["colon", "/deal/a:b"],
  ["control char", "/post\u0000"],
  ["newline", "/post\n"],
  ["tab", "/reels?item=a\tb"],
  ["space", "/post "],
  ["encoded traversal", "/deal/%2e%2e/edit"],
  ["encoded slash", "/deal/a%2fb"],
  ["double encoded", "/deal/%252e%252e"],
  ["dot traversal", "/deal/../post"],
  ["traversal", "/deal/abc/../../post"],
  ["fragment", "/post#x"],
  ["trailing slash", "/post/"],
  ["case variant", "/Post"],
  ["extra segment", "/post/new"],
  ["unapproved query on post", "/post?preview=1"],
  ["legacy edit query", "/post?edit=abc"],
  ["shared private link", "/reels?shared=https%3A%2F%2Fwww.instagram.com%2Freel%2FX%2F"],
  ["shared plain", "/reels?shared=x"],
  ["reels extra query", "/reels?item=a&x=1"],
  ["reels bad id", "/reels?item=a/b"],
  ["reels empty id", "/reels?item="],
  ["deal id empty", "/deal/"],
  ["deal edit extra", "/deal/abc/edit/x"],
  ["deal id too long", `/deal/${"a".repeat(129)}`],
  ["token-like query", "/post?token=secret"],
  ["unrelated route", "/profile"],
  ["signin loop", "/signin"],
  ["map", "/map"],
  ["root", "/"],
  ["relative", "post"],
  ["empty", ""],
  ["null", null],
  ["undefined", undefined],
  ["unbounded", `/reels?item=${"a".repeat(MAX_NEXT_LENGTH)}`],
];

describe("parseReturn", () => {
  it.each(accepted)("accepts %s", (value) => expect(parseReturn(value)).toBe(value));
  it.each(rejected)("rejects %s", (_label, value) => expect(parseReturn(value)).toBeNull());
  it("rejects arrays (multiple values) and non-strings", () => {
    expect(parseReturn(["/post", "/post"])).toBeNull();
    expect(parseReturn(["/post"])).toBeNull();
    expect(parseReturn(42 as unknown as string)).toBeNull();
  });
});

describe("returnFromParams", () => {
  it("reads one next value through the same resolver", () => {
    expect(returnFromParams(new URLSearchParams("next=%2Fdeal%2Fabc%2Fedit"))).toBe("/deal/abc/edit");
    expect(returnFromParams(new URLSearchParams("next=%2Freels%3Fitem%3DAbc1"))).toBe("/reels?item=Abc1");
  });
  it("rejects multiple next values even if each is safe", () => {
    expect(returnFromParams(new URLSearchParams("next=/post&next=/post"))).toBeNull();
    expect(returnFromParams(new URLSearchParams("next=/post&next=//evil.example"))).toBeNull();
  });
  it("is null when absent, empty, unsafe or the params are missing", () => {
    expect(returnFromParams(new URLSearchParams(""))).toBeNull();
    expect(returnFromParams(new URLSearchParams("next="))).toBeNull();
    expect(returnFromParams(new URLSearchParams("next=https%3A%2F%2Fevil.example"))).toBeNull();
    expect(returnFromParams(new URLSearchParams("next=%2Fdeal%2F%252e%252e"))).toBeNull();
    expect(returnFromParams(null)).toBeNull();
  });
  it("decodes once: an encoded traversal that decodes to '..' is rejected", () => {
    expect(returnFromParams(new URLSearchParams("next=%2Fdeal%2F%2e%2e%2Fedit"))).toBeNull();
  });
});

describe("URL builders", () => {
  it("keep a validated target, encoded, through signin → profile", () => {
    expect(signInHref("/post")).toBe("/signin?next=%2Fpost");
    expect(profileHref("/reels?item=Abc1")).toBe("/profile?next=%2Freels%3Fitem%3DAbc1");
    expect(returnFromParams(new URL(`https://x${profileHref("/deal/k1/edit")}`).searchParams)).toBe("/deal/k1/edit");
  });
  it("round-trip: builder output parses back to the same target", () => {
    for (const value of accepted) {
      const url = new URL(`https://x${signInHref(value)}`);
      expect(returnFromParams(url.searchParams)).toBe(value);
    }
  });
  it("never emit an unvalidated target; ordinary behavior is preserved", () => {
    expect(signInHref(null)).toBe("/signin");
    expect(profileHref(null)).toBe("/profile");
    expect(profileHref("//evil.example")).toBe("/profile");
    expect(signInHref("https://evil.example")).toBe("/signin");
    expect(profileHref("/reels?shared=x")).toBe("/profile");
  });
});

describe("profileFlow", () => {
  it("ordinary profile when there is no valid target", () => {
    expect(profileFlow(null, false)).toBe("none");
    expect(profileFlow(null, true)).toBe("none");
    expect(profileFlow("//evil.example", true)).toBe("none");
  });
  it("existing profile continues; missing profile shows the form first", () => {
    expect(profileFlow("/post", true)).toBe("continue");
    expect(profileFlow("/post", false)).toBe("form");
  });
});
