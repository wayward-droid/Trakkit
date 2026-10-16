import { getClient } from "../supabaseClient.js";

/**
 * Online FX rates.
 *
 * Rates are read from the `exchange_rates` cache by the quote_review and
 * report RPCs, so this module only has to populate that cache. It prefers the
 * deployed `refresh-exchange-rates` Edge Function and, when that is not
 * available, falls back to fetching the provider directly in the browser and
 * storing the result through the validated `cache_exchange_rates` RPC.
 */
const PROVIDER = "frankfurter";
const BASE = "USD";
const SUPPORTED = ["USD", "NGN", "EUR", "GBP", "GHS", "KES", "ZAR", "CAD", "AED", "INR", "CNY", "JPY"];
const QUOTES = SUPPORTED.filter((code) => code !== BASE);

const isoDate = (date) => date.toISOString().slice(0, 10);
const shiftDays = (iso, days) => {
  const date = new Date(iso + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
};

/**
 * Return a complete snapshot whose rows all share one rate date. The provider
 * publishes currencies at different times, so stepping back a few days finds
 * the latest date on which every supported currency has a quote. Caching a
 * single shared date is what lets the SQL functions cross the rates safely.
 */
async function fetchSnapshot(targetDate) {
  let lastError;
  for (let step = 0; step < 8; step++) {
    const day = shiftDays(targetDate, -step);
    let response;
    try {
      response = await fetch(
        `https://api.frankfurter.dev/v2/rates?base=${BASE}&quotes=${QUOTES.join(",")}&date=${day}`,
        { headers: { Accept: "application/json" } },
      );
    } catch (error) {
      lastError = error;
      continue;
    }
    if (!response.ok) {
      lastError = new Error(`The rate provider responded with ${response.status}`);
      continue;
    }
    const data = await response.json().catch(() => null);
    if (!Array.isArray(data) || !data.length) continue;
    const rows = data.filter(
      (row) => QUOTES.includes(row.quote) && Number.isFinite(Number(row.rate)) && Number(row.rate) > 0,
    );
    if (rows.length < QUOTES.length) continue;
    const rateDate = rows[0].date;
    if (!rows.every((row) => row.date === rateDate)) continue;
    return {
      date: rateDate,
      rows: [
        { currency_code: BASE, rate_date: rateDate, units_per_usd: 1 },
        ...rows.map((row) => ({ currency_code: row.quote, rate_date: rateDate, units_per_usd: Number(row.rate) })),
      ],
    };
  }
  throw lastError || new Error("The online exchange-rate provider is unavailable.");
}

async function refreshViaFunction(db, date) {
  const { data, error } = await db.functions.invoke("refresh-exchange-rates", {
    body: date ? { date } : {},
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function refreshViaClient(db, date) {
  const snapshot = await fetchSnapshot(date || isoDate(new Date()));
  const { error } = await db.rpc("cache_exchange_rates", {
    p_provider: PROVIDER,
    p_rates: snapshot.rows,
  });
  if (error) throw error;
  return { date: snapshot.date, count: snapshot.rows.length, provider: "Frankfurter" };
}

/** Refreshes the dated FX cache from the online provider before requesting a quote. */
export async function refreshExchangeRates(date) {
  const db = await getClient();
  try {
    const fresh = await refreshViaFunction(db, date);
    if (fresh?.count || fresh?.date) return fresh;
  } catch {
    // The Edge Function may not be deployed on a static host; fall through.
  }
  return refreshViaClient(db, date);
}

export async function quoteTransaction(input) {
  const db = await getClient();
  if (input.currencyCode && input.baseCurrency && input.currencyCode !== input.baseCurrency) {
    // Best effort: cached rates can still answer the quote when the network fails.
    try {
      await refreshExchangeRates(input.date);
    } catch {
      /* fall through to the cached rate lookup */
    }
  }
  const { data, error } = await db.rpc("quote_transaction", {
    p_workspace: input.workspaceId,
    p_account: input.accountId,
    p_amount: input.amount,
    p_date: input.date,
    p_manual_rate: input.manualRate || null,
  });
  if (error) throw error;
  return data;
}
