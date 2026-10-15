import { getClient } from "../supabaseClient.js";

export async function quoteTransaction(input) {
  const db = await getClient();
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
