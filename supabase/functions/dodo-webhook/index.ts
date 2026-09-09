// Receives Dodo Payments webhooks (Standard Webhooks signature scheme).
// On payment.succeeded for our product, marks the buyer's profile paid.
// verify_jwt is disabled for this function - Dodo calls it, not a user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBHOOK_KEY = Deno.env.get("DODO_WEBHOOK_KEY")!; // whsec_... (Standard Webhooks)

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const id = req.headers.get("webhook-id");
  const ts = req.headers.get("webhook-timestamp");
  const sigHeader = req.headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;
  // replay window: 5 minutes
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const secretB64 = WEBHOOK_KEY.startsWith("whsec_") ? WEBHOOK_KEY.slice(6) : WEBHOOK_KEY;
  const keyBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${rawBody}`));
  const computed = btoa(String.fromCharCode(...new Uint8Array(signed)));
  // header is space-delimited "v1,<base64>" entries
  return sigHeader.split(" ").some((entry) => {
    const [v, sig] = entry.split(",");
    return v === "v1" && sig === computed;
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const raw = await req.text();
  try {
    if (!(await verifySignature(req, raw))) return new Response("bad signature", { status: 401 });
    const event = JSON.parse(raw);
    if (event.type === "payment.succeeded") {
      const p = event.data ?? {};
      const userId = p.metadata?.supabase_user_id;
      const email = p.customer?.email;
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      let q = admin.from("profiles").update({
        paid: true, paid_at: new Date().toISOString(), dodo_payment_id: p.payment_id ?? null,
      });
      if (userId) q = q.eq("id", userId);
      else if (email) {
        const { data: u } = await admin.auth.admin.listUsers();
        const match = u?.users?.find((x) => x.email?.toLowerCase() === String(email).toLowerCase());
        if (!match) return new Response("no matching user", { status: 202 });
        q = q.eq("id", match.id);
      } else return new Response("no identity in payload", { status: 202 });
      const { error } = await q;
      if (error) return new Response("db error: " + error.message, { status: 500 });
    }
    return new Response("ok");
  } catch (e) {
    return new Response("error: " + String(e), { status: 500 });
  }
});
