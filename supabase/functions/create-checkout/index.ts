// Creates a Dodo Payments checkout session for the $5 one-time premium unlock.
// Requires a signed-in user (JWT verified by the gateway).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DODO_API = Deno.env.get("DODO_BASE_URL") ?? "https://test.dodopayments.com";
const DODO_KEY = Deno.env.get("DODO_API_KEY")!;
const PRODUCT_ID = Deno.env.get("DODO_PRODUCT_ID")!;
const RETURN_URL = Deno.env.get("CHECKOUT_RETURN_URL") ?? "https://breathtakingbeer.vercel.app/?checkout=return";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } });
    const { data: { user }, error } = await supa.auth.getUser();
    if (error || !user) return json({ error: "sign in first" }, 401);

    const res = await fetch(`${DODO_API}/checkouts`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${DODO_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        product_cart: [{ product_id: PRODUCT_ID, quantity: 1 }],
        customer: { email: user.email, name: user.user_metadata?.display_name ?? undefined },
        return_url: RETURN_URL,
        metadata: { supabase_user_id: user.id },
      }),
    });
    if (!res.ok) return json({ error: "checkout failed", detail: await res.text() }, 502);
    const session = await res.json();
    return json({ checkout_url: session.checkout_url });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
