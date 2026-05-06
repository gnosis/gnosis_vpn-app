import { describe, expect, it } from "vitest";
import { isAllowedExternalUrl } from "./Markdown.tsx";

describe("isAllowedExternalUrl", () => {
  it("allows http and https", () => {
    expect(isAllowedExternalUrl("http://example.com")).toBe(true);
    expect(isAllowedExternalUrl("https://example.com/path?q=1")).toBe(true);
    expect(isAllowedExternalUrl("HTTP://Example.com")).toBe(true);
  });

  it("rejects schemes that DOMPurify allows but trigger external handlers", () => {
    expect(isAllowedExternalUrl("mailto:a@b.com")).toBe(false);
    expect(isAllowedExternalUrl("tel:+1234")).toBe(false);
    expect(isAllowedExternalUrl("sms:+1234")).toBe(false);
    expect(isAllowedExternalUrl("xmpp:user@host")).toBe(false);
    expect(isAllowedExternalUrl("ftp://example.com")).toBe(false);
  });

  it("rejects dangerous schemes", () => {
    expect(isAllowedExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("slack://open?team=x")).toBe(false);
  });

  it("rejects relative URLs and malformed input", () => {
    expect(isAllowedExternalUrl("/relative/path")).toBe(false);
    expect(isAllowedExternalUrl("#anchor")).toBe(false);
    expect(isAllowedExternalUrl("")).toBe(false);
    expect(isAllowedExternalUrl("not a url")).toBe(false);
  });

  it("rejects leading-whitespace bypass attempts", () => {
    // WHATWG URL strips leading C0 controls and spaces before parsing.
    expect(isAllowedExternalUrl(" javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("\tjavascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("\njavascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("\rjavascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("   javascript:alert(1)")).toBe(false);
  });

  it("rejects schemes split by embedded control characters", () => {
    // URL parser strips ASCII tab/CR/LF, so these collapse to javascript:.
    expect(isAllowedExternalUrl("java\tscript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("java\nscript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("java\rscript:alert(1)")).toBe(false);
  });

  it("rejects mixed-case dangerous schemes", () => {
    expect(isAllowedExternalUrl("JavaScript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("JAVASCRIPT:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("Data:text/html,<x>")).toBe(false);
    expect(isAllowedExternalUrl("VBScript:msgbox(1)")).toBe(false);
    expect(isAllowedExternalUrl("FILE:///etc/passwd")).toBe(false);
  });

  it("rejects data, blob, and view-source URLs", () => {
    expect(
      isAllowedExternalUrl("data:text/html,<script>alert(1)</script>"),
    ).toBe(false);
    expect(isAllowedExternalUrl("data:text/plain;base64,SGk=")).toBe(false);
    expect(isAllowedExternalUrl("blob:http://example.com/uuid")).toBe(false);
    expect(isAllowedExternalUrl("view-source:https://example.com")).toBe(false);
  });

  it("rejects browser-internal and platform handler schemes", () => {
    expect(isAllowedExternalUrl("about:blank")).toBe(false);
    expect(isAllowedExternalUrl("chrome://settings")).toBe(false);
    expect(isAllowedExternalUrl("chrome-extension://abc/page.html")).toBe(
      false,
    );
    expect(
      isAllowedExternalUrl("intent://host/path#Intent;scheme=http;end"),
    ).toBe(false);
    expect(isAllowedExternalUrl("ms-windows-store://pdp/?productid=x")).toBe(
      false,
    );
    expect(isAllowedExternalUrl("vscode://file/etc/passwd")).toBe(false);
  });

  it("rejects vbscript and other legacy script schemes", () => {
    expect(isAllowedExternalUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isAllowedExternalUrl("livescript:alert(1)")).toBe(false);
  });

  it("rejects protocol-relative URLs and UNC-style paths", () => {
    expect(isAllowedExternalUrl("//evil.com")).toBe(false);
    expect(isAllowedExternalUrl("\\\\server\\share")).toBe(false);
  });

  it("rejects URL-encoded scheme prefixes", () => {
    // %6A == 'j'. Confirms the URL parser does not decode the scheme,
    // so '%6Aavascript:' is not a valid scheme and parsing fails.
    expect(isAllowedExternalUrl("%6Aavascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("%2F%2Fevil.com")).toBe(false);
  });

  it("does not get fooled by scheme-looking content in path or query", () => {
    // Legitimate https URLs whose path/query contains 'javascript:' are fine.
    expect(isAllowedExternalUrl("https://example.com/javascript:alert(1)"))
      .toBe(true);
    expect(isAllowedExternalUrl("https://example.com/?u=javascript:alert(1)"))
      .toBe(true);
    expect(isAllowedExternalUrl("https://example.com/#javascript:alert(1)"))
      .toBe(true);
  });

  it("rejects network and p2p protocol schemes", () => {
    expect(isAllowedExternalUrl("gopher://example.com")).toBe(false);
    expect(isAllowedExternalUrl("ws://example.com/socket")).toBe(false);
    expect(isAllowedExternalUrl("wss://example.com/socket")).toBe(false);
    expect(isAllowedExternalUrl("ssh://user@example.com")).toBe(false);
    expect(isAllowedExternalUrl("irc://irc.example.com/channel")).toBe(false);
    expect(isAllowedExternalUrl("magnet:?xt=urn:btih:abc123")).toBe(false);
  });

  it("rejects mobile/desktop app deep-link schemes", () => {
    expect(isAllowedExternalUrl("tg://resolve?domain=x")).toBe(false);
    expect(isAllowedExternalUrl("whatsapp://send?text=hi")).toBe(false);
    expect(isAllowedExternalUrl("zoommtg://zoom.us/join?confno=1")).toBe(false);
    expect(isAllowedExternalUrl("steam://run/123")).toBe(false);
    expect(isAllowedExternalUrl("spotify:track:abc")).toBe(false);
  });

  it("rejects C0 control and non-ASCII prefix bypasses", () => {
    // NUL is stripped by the URL parser; falls through to javascript:.
    expect(isAllowedExternalUrl("\0javascript:alert(1)")).toBe(false);
    // Zero-width space / BOM are NOT stripped by the parser, so the scheme
    // becomes invalid and parsing throws.
    expect(isAllowedExternalUrl("​javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("﻿javascript:alert(1)")).toBe(false);
  });

  it("rejects userinfo phishing (credentials in https URL)", () => {
    expect(isAllowedExternalUrl("https://www.paypal.com@evil.com")).toBe(false);
    expect(isAllowedExternalUrl("https://user@evil.com")).toBe(false);
    expect(isAllowedExternalUrl("https://user:pass@evil.com")).toBe(false);
    expect(isAllowedExternalUrl("http://admin:secret@10.0.0.1/")).toBe(false);
  });

  it("does not confuse '@' inside path/query with userinfo", () => {
    // '@' after the host is part of the path/query, not userinfo.
    expect(isAllowedExternalUrl("https://example.com/foo@bar")).toBe(true);
    expect(isAllowedExternalUrl("https://example.com/?email=a@b.com")).toBe(
      true,
    );
  });
});
