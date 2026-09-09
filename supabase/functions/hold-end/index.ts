// Closes a hold session: the server computes the duration from its own clock
// and writes the leaderboard score. The client can never invent time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_MS = 60_000;      // game hard cap
const CEILING_MS = 300_000; // display/safety ceiling - anything above is flagged for review
const GLASSES = ["mug", "pint", "stein", "tulip"];
const BEERS = ["lager", "ipa", "stout", "wheat"];
const BANNED = /(fuck|shit|cunt|nigger|faggot|whore|slut|bitch|bastard|dick|pussy)/i;

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

  const body = await req.json().catch(() => ({}));
  const sessionId = String(body.session_id ?? "");
  const displayName = String(body.display_name ?? "").trim().slice(0, 24);
  const glass = GLASSES.includes(body.glass) ? body.glass : "mug";
  const beer = BEERS.includes(body.beer) ? body.beer : "lager";
  if (!displayName || BANNED.test(displayName)) return json({ error: "pick a cleaner name" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: session } = await admin.from("hold_sessions")
    .select("id, started_at").eq("id", sessionId).eq("user_id", user.id).is("ended_at", null).single();
  if (!session) return json({ error: "no open session" }, 400);

  const durationMs = Math.max(0, Date.now() - new Date(session.started_at).getTime());
  const clamped = Math.min(durationMs, MAX_MS);
  const flagged = durationMs > CEILING_MS;
  await admin.from("hold_sessions").update({ ended_at: new Date().toISOString(), duration_ms: clamped }).eq("id", sessionId);
  await admin.from("profiles").update({ display_name: displayName }).eq("id", user.id);
  const { data: score, error } = await admin.from("scores")
    .insert({ user_id: user.id, display_name: displayName, duration_ms: Math.round(clamped), glass, beer, flagged })
    .select("id, duration_ms").single();
  if (error) return json({ error: error.message }, 500);
  return json({ score_id: score.id, duration_ms: score.duration_ms, flagged });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
