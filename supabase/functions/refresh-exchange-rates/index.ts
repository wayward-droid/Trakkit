import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPPORTED = ["USD", "NGN", "EUR", "GBP", "GHS", "KES", "ZAR", "CAD", "AED", "INR", "CNY", "JPY"];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Exchange-rate service is not configured.");
    const auth = req.headers.get("Authorization");
    if (!auth) return Response.json({ error: "Sign in required." }, { status: 401, headers: cors });
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!anonKey) throw new Error("Exchange-rate service is not configured.");
    const verifier = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userError } = await verifier.auth.getUser();
    if (userError || !userData.user) return Response.json({ error: "Sign in required." }, { status: 401, headers: cors });
    const supabase = createClient(url, key);

    const body = await req.json().catch(() => ({}));
    const requested = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date : new Date().toISOString().slice(0, 10);
    const quotes = SUPPORTED.filter((code) => code !== "USD").join(",");
    const response = await fetch(`https://api.frankfurter.dev/v2/rates?base=USD&quotes=${quotes}&date=${requested}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("The online exchange-rate provider is temporarily unavailable.");
    const data = await response.json();
    if (!Array.isArray(data) || !data.length) throw new Error("No exchange rates are available for this date.");
    const rateDate = data[0].date;
    const rates = [{ currency_code: "USD", rate_date: rateDate, units_per_usd: 1, provider: "frankfurter" },
      ...data.filter((r: any) => SUPPORTED.includes(r.quote) && Number.isFinite(Number(r.rate)) && Number(r.rate) > 0)
        .map((r: any) => ({ currency_code: r.quote, rate_date: rateDate, units_per_usd: Number(r.rate), provider: "frankfurter" }))];
    const { error } = await supabase.from("exchange_rates").upsert(rates, { onConflict: "currency_code,rate_date" });
    if (error) throw new Error("Rates were retrieved but could not be saved. Check the exchange_rates permissions.");
    return Response.json({ date: rateDate, count: rates.length, provider: "Frankfurter" }, { headers: { ...cors, "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to refresh exchange rates." }, { status: 502, headers: cors });
  }
});
