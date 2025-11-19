import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { sanitizeEmail, sanitizeSubject, generateSanitizationReport } from "./email-sanitizer.ts";

Deno.test("sanitizeEmail - removes 1x1 tracking pixels", () => {
  const html = `
    <html>
      <body>
        <p>Hello World</p>
        <img src="https://tracker.com/pixel.gif" width="1" height="1">
      </body>
    </html>
  `;

  const result = sanitizeEmail(html, "");

  assertEquals(result.trackersRemoved.trackingPixels, 1);
  assertEquals(result.html.includes("tracking pixel removed"), true);
  assertEquals(result.html.includes('width="1"'), false);
});

Deno.test("sanitizeEmail - blocks remote images", () => {
  const html = `
    <html>
      <body>
        <img src="https://example.com/image.jpg" alt="Test">
        <img src="https://track.customer.io/pixel.gif">
      </body>
    </html>
  `;

  const result = sanitizeEmail(html, "");

  assertEquals(result.trackersRemoved.remoteImages, 2);
  assertEquals(result.html.includes("data-original-src"), true);
});

Deno.test("sanitizeEmail - removes UTM parameters", () => {
  const html = `
    <a href="https://example.com/page?utm_source=email&utm_campaign=test&foo=bar">Link</a>
  `;

  const result = sanitizeEmail(html, "");

  assertEquals(result.html.includes("utm_source"), false);
  assertEquals(result.html.includes("utm_campaign"), false);
  assertEquals(result.html.includes("foo=bar"), true);
  assertEquals(result.trackersRemoved.trackingLinks, 1);
});

Deno.test("sanitizeEmail - removes fbclid and gclid", () => {
  const html = `
    <a href="https://example.com?fbclid=abc123">Facebook</a>
    <a href="https://example.com?gclid=xyz789">Google</a>
  `;

  const result = sanitizeEmail(html, "");

  assertEquals(result.html.includes("fbclid"), false);
  assertEquals(result.html.includes("gclid"), false);
  assertEquals(result.trackersRemoved.trackingLinks, 2);
});

Deno.test("sanitizeEmail - removes email beacons", () => {
  const html = `
    <img src="https://mail.example.com/open/abc123">
    <img src="https://track.mailchimp.com/track/xyz">
    <img src="https://example.com/pixel.gif">
  `;

  const result = sanitizeEmail(html, "");

  assertEquals(result.trackersRemoved.trackingPixels >= 2, true);
  assertEquals(result.html.includes("email beacon removed"), true);
});

Deno.test("sanitizeEmail - handles hidden images", () => {
  const html = `
    <img src="https://tracker.com/img.gif" style="display:none">
    <img src="https://tracker.com/img2.gif" style="visibility:hidden">
  `;

  const result = sanitizeEmail(html, "");

  assertEquals(result.trackersRemoved.trackingPixels, 2);
});

Deno.test("sanitizeEmail - sanitizes text links", () => {
  const text = "Check out https://example.com/page?utm_source=email&utm_campaign=test";

  const result = sanitizeEmail("", text);

  assertEquals(result.text.includes("utm_source"), false);
  assertEquals(result.text.includes("utm_campaign"), false);
  assertEquals(result.text.includes("https://example.com/page"), true);
  assertEquals(result.trackersRemoved.trackingLinks, 1);
});

Deno.test("sanitizeEmail - blocks tracking domain images", () => {
  const html = `
    <img src="https://track.customer.io/open.gif">
    <img src="https://click.mailchimp.com/track.png">
  `;

  const result = sanitizeEmail(html, "");

  assertEquals(result.trackersRemoved.remoteImages, 2);
  assertEquals(result.html.includes("remote tracking image blocked"), true);
});

Deno.test("sanitizeEmail - removes suspicious images", () => {
  const html = `
    <img src="https://example.com/tracking-pixel.gif">
    <img src="https://example.com/beacon-image.png">
  `;

  const result = sanitizeEmail(html, "");

  assertEquals(result.trackersRemoved.remoteImages, 2);
  assertEquals(result.html.includes("suspicious image blocked"), true);
});

Deno.test("sanitizeEmail - handles complex URLs", () => {
  const html = `
    <a href="https://example.com/page?foo=bar&utm_source=email&baz=qux&utm_medium=newsletter">Link</a>
  `;

  const result = sanitizeEmail(html, "");

  assertEquals(result.html.includes("utm_source"), false);
  assertEquals(result.html.includes("utm_medium"), false);
  assertEquals(result.html.includes("foo=bar"), true);
  assertEquals(result.html.includes("baz=qux"), true);
  assertEquals(result.trackersRemoved.trackingLinks, 1);
});

Deno.test("sanitizeEmail - preserves clean content", () => {
  const html = "<p>Hello World</p><img src='data:image/png;base64,abc'>";
  const text = "Hello World";

  const result = sanitizeEmail(html, text);

  assertEquals(result.html, html);
  assertEquals(result.text, text);
  assertEquals(result.trackersRemoved.trackingPixels, 0);
  assertEquals(result.trackersRemoved.remoteImages, 0);
  assertEquals(result.trackersRemoved.trackingLinks, 0);
});

Deno.test("generateSanitizationReport - generates correct report", () => {
  const result = {
    html: "",
    text: "",
    trackersRemoved: {
      trackingPixels: 2,
      remoteImages: 3,
      trackingLinks: 1,
    },
  };

  const report = generateSanitizationReport(result);

  assertEquals(report.includes("2 tracking pixel(s)"), true);
  assertEquals(report.includes("3 remote image(s)"), true);
  assertEquals(report.includes("1 tracking parameter(s)"), true);
  assertEquals(report.includes("Privaseer Privacy Protection"), true);
});

Deno.test("generateSanitizationReport - returns empty for clean emails", () => {
  const result = {
    html: "",
    text: "",
    trackersRemoved: {
      trackingPixels: 0,
      remoteImages: 0,
      trackingLinks: 0,
    },
  };

  const report = generateSanitizationReport(result);

  assertEquals(report, "");
});

Deno.test("sanitizeSubject - removes tracking patterns", () => {
  const subject1 = "[TRACK-12345] Important Message";
  const subject2 = "{tracking_abc} Newsletter";

  assertEquals(sanitizeSubject(subject1), "Important Message");
  assertEquals(sanitizeSubject(subject2), "Newsletter");
});

Deno.test("sanitizeSubject - preserves clean subjects", () => {
  const subject = "Your Monthly Newsletter";

  assertEquals(sanitizeSubject(subject), subject);
});

Deno.test("sanitizeEmail - comprehensive test", () => {
  const html = `
    <html>
      <body>
        <h1>Newsletter</h1>
        <p>Check out our latest offer!</p>
        <a href="https://example.com/offer?utm_source=email&utm_campaign=spring">Click here</a>
        <img src="https://example.com/banner.jpg" alt="Banner">
        <img src="https://track.customer.io/pixel.gif" width="1" height="1">
        <img src="https://example.com/tracking-beacon.gif">
      </body>
    </html>
  `;

  const text = "Visit https://example.com/page?utm_source=email for more info";

  const result = sanitizeEmail(html, text);

  assertEquals(result.trackersRemoved.trackingPixels >= 1, true);
  assertEquals(result.trackersRemoved.remoteImages >= 2, true);
  assertEquals(result.trackersRemoved.trackingLinks >= 2, true);

  assertEquals(result.html.includes("utm_source"), false);
  assertEquals(result.html.includes("utm_campaign"), false);
  assertEquals(result.html.includes("Newsletter"), true);

  assertEquals(result.text.includes("utm_source"), false);
  assertEquals(result.text.includes("https://example.com/page"), true);
});
