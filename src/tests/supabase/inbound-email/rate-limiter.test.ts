import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { generateRateLimitResponse, shouldAutoNotify } from "../../../../supabase/functions/inbound-email/rate-limiter.ts";

Deno.test("generateRateLimitResponse - paused", () => {
  const result = {
    allowed: false,
    reason: "paused" as const,
  };

  const response = generateRateLimitResponse(result);

  assertEquals(response.includes("paused"), true);
  assertEquals(response.includes("suspicious activity"), true);
});

Deno.test("generateRateLimitResponse - rate limit", () => {
  const result = {
    allowed: false,
    reason: "rate_limit" as const,
    hourlyLimit: 50,
    emailsInLastHour: 52,
  };

  const response = generateRateLimitResponse(result);

  assertEquals(response.includes("50"), true);
  assertEquals(response.includes("52"), true);
  assertEquals(response.includes("per hour"), true);
});

Deno.test("generateRateLimitResponse - generic", () => {
  const result = {
    allowed: false,
  };

  const response = generateRateLimitResponse(result);

  assertEquals(response.includes("rate limiting"), true);
});

Deno.test("shouldAutoNotify - high 5min rate", () => {
  const spike = {
    isSpike: true,
    emailsLast5Min: 15,
    emailsLast15Min: 20,
    emailsLastHour: 30,
  };

  const shouldNotify = shouldAutoNotify(spike);

  assertEquals(shouldNotify, true);
});

Deno.test("shouldAutoNotify - high 15min rate", () => {
  const spike = {
    isSpike: true,
    emailsLast5Min: 5,
    emailsLast15Min: 30,
    emailsLastHour: 40,
  };

  const shouldNotify = shouldAutoNotify(spike);

  assertEquals(shouldNotify, true);
});

Deno.test("shouldAutoNotify - no spike", () => {
  const spike = {
    isSpike: false,
    emailsLast5Min: 2,
    emailsLast15Min: 8,
    emailsLastHour: 20,
  };

  const shouldNotify = shouldAutoNotify(spike);

  assertEquals(shouldNotify, false);
});

Deno.test("shouldAutoNotify - spike but low rates", () => {
  const spike = {
    isSpike: true,
    emailsLast5Min: 5,
    emailsLast15Min: 12,
    emailsLastHour: 100,
  };

  const shouldNotify = shouldAutoNotify(spike);

  assertEquals(shouldNotify, false);
});
