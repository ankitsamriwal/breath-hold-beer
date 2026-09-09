// Opens a server-attested hold session. The server clock starts here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return json({ error: "sign in first" }, 401);
  const { data: profile } = await supa.from("profiles").select("paid").eq("id", user.id).single();
  if (!profile?.paid) return json({ error: "premium only" }, 403);
  // one open session at a time - close any stale opener
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  await admin.from("hold_sessions").delete().eq("user_id", user.id).is("ended_at", null);
  const { data, error } = await admin.from("hold_sessions").insert({ user_id: user.id }).select("id").single();
  if (error) return json({ error: error.message }, 500);
  return json({ session_id: data.id });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
