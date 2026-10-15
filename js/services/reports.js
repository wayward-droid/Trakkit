import { getClient } from "../supabaseClient.js";

export async function monthlySummary(workspaceId, month) {
  if (!workspaceId) throw new Error("Select a workspace.");

  const db = await getClient();
  const { data, error } = await db.rpc("monthly_summary", {
    p_workspace: workspaceId,
    p_month: month,
  });
  if (error) throw error;
  return data;
}

export async function yearlySummary(workspaceId, year) {
  if (!workspaceId) throw new Error("Select a workspace.");

  const db = await getClient();
  const { data, error } = await db.rpc("yearly_summary", {
    p_workspace: workspaceId,
    p_year: year,
  });
  if (error) throw error;
  return data;
}
export async function reportExchangeRate(workspaceId, currency) {
  const db = await getClient();
  const { data, error } = await db.rpc("report_exchange_rate", {
    p_workspace: workspaceId,
    p_currency: currency,
  });
  if (error) throw error;
  return data;
}
