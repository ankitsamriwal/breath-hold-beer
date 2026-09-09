// A signed-in paid user vouches: "I watched this hold happen." Social proof layer.
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
  const body = await req.json().catch(() => ({}));
  const scoreId = String(body.score_id ?? "");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: score } = await admin.from("scores").select("user_id").eq("id", scoreId).single();
  if (!score) return json({ error: "score not found" }, 404);
  if (score.user_id === user.id) return json({ error: "you can't witness your own hold" }, 400);
  const { error } = await admin.from("witnesses").insert({ score_id: scoreId, witness_user_id: user.id });
  if (error && error.code !== "23505") return json({ error: error.message }, 500);
  return json({ ok: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
