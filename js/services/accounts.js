import { getClient } from "../supabaseClient.js";

export async function listAccounts(workspaceId) {
  if (!workspaceId) throw new Error("Select a workspace.");

  const db = await getClient();
  const { data, error } = await db
    .from("account_details")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at")
    .order("id");
  if (error) throw error;
  return data;
}
export async function balances(workspaceId) {
  const db = await getClient();
  const { data, error } = await db.rpc("account_balances", {
    p_workspace: workspaceId,
  });
  if (error) throw error;
  return data;
}
export async function addAccount(workspaceId, input) {
  const db = await getClient();
  const { data, error } = await db
    .from("accounts")
    .insert({ workspace_id: workspaceId, ...input })
    .select("id,name,type,currency_code")
    .single();
  if (error) throw error;
  return {
    ...data,
    workspace_id: workspaceId,
    opening_balance: input.opening_balance,
  };
}
