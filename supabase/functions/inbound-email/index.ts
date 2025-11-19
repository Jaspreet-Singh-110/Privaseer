import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InboundEmailPayload {
  recipient: string;
  sender: string;
  from: string;
  subject: string;
  bodyPlain?: string;
  bodyHtml?: string;
  strippedText?: string;
  strippedSignature?: string;
  messageHeaders?: string;
  contentIdMap?: string;
  timestamp?: number;
}

interface BurnerEmailRecord {
  id: string;
  email_address: string;
  real_email: string;
  is_active: boolean;
  expires_at: string | null;
}

async function parseEmailPayload(req: Request): Promise<InboundEmailPayload> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return await req.json();
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const payload: InboundEmailPayload = {
      recipient: formData.get("recipient") as string || "",
      sender: formData.get("sender") as string || "",
      from: formData.get("from") as string || "",
      subject: formData.get("subject") as string || "",
      bodyPlain: formData.get("body-plain") as string || formData.get("text") as string,
      bodyHtml: formData.get("body-html") as string || formData.get("html") as string,
      strippedText: formData.get("stripped-text") as string,
      strippedSignature: formData.get("stripped-signature") as string,
      messageHeaders: formData.get("message-headers") as string,
      timestamp: Date.now(),
    };
    return payload;
  }

  throw new Error("Unsupported content type");
}

async function lookupBurnerEmail(supabase: any, emailAddress: string): Promise<BurnerEmailRecord | null> {
  const cleanEmail = emailAddress.toLowerCase().trim();

  const { data, error } = await supabase
    .from("burner_emails")
    .select("id, email_address, real_email, is_active, expires_at")
    .eq("email_address", cleanEmail)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Database lookup error:", error);
    return null;
  }

  if (!data) {
    return null;
  }

  if (data.expires_at) {
    const expiresAt = new Date(data.expires_at);
    if (expiresAt < new Date()) {
      console.log("Burner email expired:", emailAddress);
      return null;
    }
  }

  return data;
}

async function forwardEmail(
  emailProvider: string,
  apiKey: string,
  payload: InboundEmailPayload,
  targetEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (emailProvider === "resend") {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Privaseer Burner <noreply@burner.privaseer.io>`,
          to: targetEmail,
          subject: `[Forwarded] ${payload.subject}`,
          text: payload.bodyPlain || payload.strippedText,
          html: payload.bodyHtml || `<p>${payload.bodyPlain || payload.strippedText}</p>`,
          reply_to: payload.sender,
          headers: {
            "X-Original-From": payload.from,
            "X-Original-To": payload.recipient,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Resend API error:", errorText);
        return { success: false, error: `Resend error: ${response.status}` };
      }

      return { success: true };
    } else if (emailProvider === "mailgun") {
      const domain = Deno.env.get("MAILGUN_DOMAIN") || "burner.privaseer.io";
      const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`api:${apiKey}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          from: `Privaseer Burner <noreply@burner.privaseer.io>`,
          to: targetEmail,
          subject: `[Forwarded] ${payload.subject}`,
          text: payload.bodyPlain || payload.strippedText || "",
          html: payload.bodyHtml || `<p>${payload.bodyPlain || payload.strippedText}</p>`,
          "h:Reply-To": payload.sender,
          "h:X-Original-From": payload.from,
          "h:X-Original-To": payload.recipient,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Mailgun API error:", errorText);
        return { success: false, error: `Mailgun error: ${response.status}` };
      }

      return { success: true };
    }

    return { success: false, error: "Unknown email provider" };
  } catch (error) {
    console.error("Email forwarding error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function logEmail(
  supabase: any,
  burnerEmailId: string,
  payload: InboundEmailPayload,
  forwarded: boolean,
  errorMessage?: string
): Promise<void> {
  const { error } = await supabase
    .from("email_logs")
    .insert({
      burner_email_id: burnerEmailId,
      from_address: payload.sender || payload.from,
      subject: payload.subject || "",
      received_at: payload.timestamp ? new Date(payload.timestamp).toISOString() : new Date().toISOString(),
      forwarded,
      forwarded_at: forwarded ? new Date().toISOString() : null,
      error_message: errorMessage || null,
    });

  if (error) {
    console.error("Failed to log email:", error);
  }
}

async function incrementCounters(supabase: any, emailAddress: string, forwarded: boolean): Promise<void> {
  const { error: incrementError } = await supabase.rpc(
    "increment_email_received",
    { p_email_address: emailAddress }
  );

  if (incrementError) {
    console.error("Failed to increment received counter:", incrementError);
  }

  if (forwarded) {
    const { data: burnerEmail } = await supabase
      .from("burner_emails")
      .select("id")
      .eq("email_address", emailAddress)
      .maybeSingle();

    if (burnerEmail) {
      const { error: forwardError } = await supabase.rpc(
        "increment_email_forwarded",
        { p_burner_email_id: burnerEmail.id }
      );

      if (forwardError) {
        console.error("Failed to increment forwarded counter:", forwardError);
      }
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const emailProvider = Deno.env.get("EMAIL_PROVIDER") || "resend";
    const emailApiKey = Deno.env.get("EMAIL_API_KEY");

    if (!emailApiKey) {
      console.error("EMAIL_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email forwarding not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const payload = await parseEmailPayload(req);

    console.log("Inbound email received:", {
      recipient: payload.recipient,
      from: payload.sender || payload.from,
      subject: payload.subject,
    });

    if (!payload.recipient) {
      return new Response(
        JSON.stringify({ error: "Missing recipient" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const burnerEmail = await lookupBurnerEmail(supabase, payload.recipient);

    if (!burnerEmail) {
      console.log("Burner email not found or inactive:", payload.recipient);
      return new Response(
        JSON.stringify({
          error: "Burner email not found or inactive",
          message: "Email rejected",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Forwarding email to:", burnerEmail.real_email);

    const forwardResult = await forwardEmail(
      emailProvider,
      emailApiKey,
      payload,
      burnerEmail.real_email
    );

    await logEmail(
      supabase,
      burnerEmail.id,
      payload,
      forwardResult.success,
      forwardResult.error
    );

    await incrementCounters(
      supabase,
      burnerEmail.email_address,
      forwardResult.success
    );

    if (forwardResult.success) {
      console.log("Email forwarded successfully");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Email forwarded successfully",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      console.error("Email forwarding failed:", forwardResult.error);
      return new Response(
        JSON.stringify({
          error: "Failed to forward email",
          details: forwardResult.error,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
