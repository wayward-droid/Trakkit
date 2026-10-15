import { scaled, precision } from "../utils/money.js";
import { getClient } from "../supabaseClient.js";

/** Refreshes the dated FX cache from the online provider before requesting a quote. */
export async function refreshExchangeRates(date) {
  const db = await getClient();
  const { data, error } = await db.functions.invoke("refresh-exchange-rates", {
    body: date ? { date } : {},
  });
  if (error) throw new Error("Could not fetch online exchange rates. Check your connection and try again.");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function quoteTransaction(input) {
  const db = await getClient();
  if (input.currencyCode && input.baseCurrency && input.currencyCode !== input.baseCurrency) {
    await refreshExchangeRates(input.date);
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
