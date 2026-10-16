import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPPORTED = ["USD", "NGN", "EUR", "GBP", "GHS", "KES", "ZAR", "CAD", "AED", "INR", "CNY", "JPY"];
const PROVIDER = "frankfurter";
const BASE = "USD";
const QUOTES = SUPPORTED.filter((code) => code !== BASE);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const shiftDays = (iso: string, days: number) => {
  const date = new Date(iso + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
};

/** Latest date on which every supported currency has a quote (single snapshot). */
async function fetchSnapshot(targetDate: string) {
  let lastError: unknown;
  for (let step = 0; step < 8; step++) {
    const day = shiftDays(targetDate, -step);
    const response = await fetch(
      `https://api.frankfurter.dev/v2/rates?base=${BASE}&quotes=${QUOTES.join(",")}&date=${day}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) {
      lastError = new Error("The online exchange-rate provider is temporarily unavailable.");
      continue;
    }
    const data = await response.json().catch(() => null);
    if (!Array.isArray(data) || !data.length) continue;
    const rows = data.filter(
      (row: any) => QUOTES.includes(row.quote) && Number.isFinite(Number(row.rate)) && Number(row.rate) > 0,
    );
    if (rows.length < QUOTES.length) continue;
    const rateDate = rows[0].date;
    if (!rows.every((row: any) => row.date === rateDate)) continue;
    return {
      date: rateDate,
      rows: [
        { currency_code: BASE, rate_date: rateDate, units_per_usd: 1, provider: PROVIDER },
        ...rows.map((row: any) => ({
          currency_code: row.quote,
          rate_date: rateDate,
          units_per_usd: Number(row.rate),
          provider: PROVIDER,
        })),
      ],
    };
  }
  throw lastError instanceof Error ? lastError : new Error("No exchange rates are available for this date.");
}

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
      ? body.date : isoDate(new Date());
    const snapshot = await fetchSnapshot(requested);
    const { error } = await supabase.from("exchange_rates").upsert(snapshot.rows, { onConflict: "currency_code,rate_date" });
    if (error) throw new Error("Rates were retrieved but could not be saved. Check the exchange_rates permissions.");
    return Response.json({ date: snapshot.date, count: snapshot.rows.length, provider: "Frankfurter" }, { headers: { ...cors, "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to refresh exchange rates." }, { status: 502, headers: cors });
  }
});
