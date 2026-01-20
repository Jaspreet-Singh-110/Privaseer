// @ts-nocheck - Deno Edge Function with npm: specifiers resolved at runtime
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type DenoRuntime = {
  env: { get(key: string): string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const denoRuntime = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
if (!denoRuntime) throw new Error("Deno runtime is required");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FalsePositiveRequest {
  installationId: string;
  domain: string;
  url?: string;
  detectedPatterns?: string[];
  userReason?: string;
  scanConfidence?: number;
  timestamp?: number;
}

interface ValidationResult<T = unknown> {
  valid: boolean;
  error?: string;
  sanitized?: T;
}

function validateString(value: unknown, fieldName: string, maxLength = 512): ValidationResult<string> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { valid: false, error: `${fieldName} is required and must be a string` };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { valid: false, error: `${fieldName} must be at most ${maxLength} characters` };
  }
  return { valid: true, sanitized: trimmed };
}

function validateOptionalString(value: unknown, fieldName: string, maxLength = 1000): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return { valid: true, sanitized: null };
  }
  if (typeof value !== "string") {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { valid: false, error: `${fieldName} must be at most ${maxLength} characters` };
  }
  return { valid: true, sanitized: trimmed };
}

function validatePatterns(value: unknown): ValidationResult<string[]> {
  if (!Array.isArray(value)) {
    return { valid: true, sanitized: [] };
  }
  const sanitized = value.filter((item) => typeof item === "string").slice(0, 20);
  return { valid: true, sanitized };
}

function validateConfidence(value: unknown): ValidationResult<number | null> {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return { valid: true, sanitized: null };
  }
  const sanitized = Math.max(0, Math.min(100, value));
  return { valid: true, sanitized };
}

denoRuntime.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = denoRuntime.env.get("SUPABASE_URL");
    const supabaseServiceKey = denoRuntime.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const body = (await req.json()) as FalsePositiveRequest;

    const installationId = validateString(body.installationId, "installationId", 128);
    if (!installationId.valid) {
      return new Response(
        JSON.stringify({ error: installationId.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const domain = validateString(body.domain, "domain", 255);
    if (!domain.valid) {
      return new Response(
        JSON.stringify({ error: domain.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = validateOptionalString(body.url, "url", 1024);
    if (!url.valid) {
      return new Response(
        JSON.stringify({ error: url.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const detectedPatterns = validatePatterns(body.detectedPatterns);

    const userReason = validateOptionalString(body.userReason, "userReason", 1000);
    if (!userReason.valid) {
      return new Response(
        JSON.stringify({ error: userReason.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const scanConfidence = validateConfidence(body.scanConfidence);

    const { error } = await supabase
      .from("false_positives")
      .insert({
        installation_id: installationId.sanitized,
        domain: domain.sanitized,
        url: url.sanitized,
        detected_patterns: detectedPatterns.sanitized,
        user_reason: userReason.sanitized,
        scan_confidence: scanConfidence.sanitized,
      });

    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("report-false-positive error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
