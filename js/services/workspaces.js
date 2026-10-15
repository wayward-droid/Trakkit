import { getClient } from "../supabaseClient.js";

export async function listMyWorkspaces(userId) {
  const db = await getClient();
  const { data, error } = await db
    .from("workspace_members")
    .select(
      "role,workspaces(id,name,type,base_currency,members_see_all,time_zone,currency_locked)",
    )
    .eq("user_id", userId);
  if (error) throw error;
  return data.map(({ role, workspaces }) => ({ ...workspaces, role }));
}
export async function createWorkspace({ name, type, baseCurrency, timeZone }) {
  const db = await getClient();
  const { data, error } = await db.rpc("create_workspace", {
    p_name: name,
    p_type: type,
    p_base_currency: baseCurrency,
    p_time_zone: timeZone,
  });
  if (error) throw error;
  return data;
}
