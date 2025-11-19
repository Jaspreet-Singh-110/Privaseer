import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GenerateEmailRequest {
  installationId: string;
  realEmail: string;
  description?: string;
  expiresInDays?: number;
}

interface BurnerEmail {
  id: string;
  email_address: string;
  real_email: string;
  description: string;
  is_active: boolean;
  expires_at: string | null;
  emails_received: number;
  emails_forwarded: number;
  created_at: string;
}

function generateRandomEmail(): string {
  const adjectives = ['swift', 'quiet', 'brave', 'calm', 'wise', 'cool', 'quick', 'safe', 'smart', 'sharp'];
  const nouns = ['panda', 'tiger', 'eagle', 'wolf', 'fox', 'hawk', 'bear', 'lion', 'owl', 'deer'];
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomNum = Math.floor(Math.random() * 9999);
  return `${randomAdjective}${randomNoun}${randomNum}@burner.privaseer.io`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method === "POST") {
      const body: GenerateEmailRequest = await req.json();

      if (!body.installationId || !body.realEmail) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: installationId, realEmail" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      let emailAddress = generateRandomEmail();
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        const { data: existing } = await supabase
          .from("burner_emails")
          .select("email_address")
          .eq("email_address", emailAddress)
          .maybeSingle();

        if (!existing) {
          break;
        }

        emailAddress = generateRandomEmail();
        attempts++;
      }

      if (attempts === maxAttempts) {
        return new Response(
          JSON.stringify({ error: "Failed to generate unique email" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      let expiresAt = null;
      if (body.expiresInDays && body.expiresInDays > 0) {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + body.expiresInDays);
        expiresAt = expirationDate.toISOString();
      }

      const { data, error } = await supabase
        .from("burner_emails")
        .insert({
          installation_id: body.installationId,
          email_address: emailAddress,
          real_email: body.realEmail,
          description: body.description || '',
          is_active: true,
          expires_at: expiresAt,
          emails_received: 0,
          emails_forwarded: 0,
        })
        .select()
        .single();

      if (error) {
        console.error("Database error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to create burner email", details: error.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({ success: true, email: data }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (req.method === "GET") {
      const url = new URL(req.url);
      const installationId = url.searchParams.get("installationId");

      if (!installationId) {
        return new Response(
          JSON.stringify({ error: "Missing installationId" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data, error } = await supabase
        .from("burner_emails")
        .select("*")
        .eq("installation_id", installationId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Database error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to fetch burner emails" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({ success: true, emails: data }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const emailId = url.searchParams.get("emailId");
      const installationId = url.searchParams.get("installationId");

      if (!emailId || !installationId) {
        return new Response(
          JSON.stringify({ error: "Missing emailId or installationId" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { error } = await supabase
        .from("burner_emails")
        .update({ is_active: false })
        .eq("id", emailId)
        .eq("installation_id", installationId);

      if (error) {
        console.error("Database error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to delete burner email" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
