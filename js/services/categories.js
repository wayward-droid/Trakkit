import { getClient } from "../supabaseClient.js";

export async function listCategories(workspaceId) {
  if (!workspaceId) throw new Error("Select a workspace.");

  const db = await getClient();
  const { data, error } = await db
    .from("categories")
    .select("id,workspace_id,name,type,color")
    .eq("workspace_id", workspaceId)
    .order("name");
  if (error) throw error;
  return data;
}
export async function saveCategory(workspaceId, input, id) {
  const db = await getClient();
  let q = id
    ? db
        .from("categories")
        .update({ name: input.name, color: input.color })
        .eq("workspace_id", workspaceId)
        .eq("id", id)
    : db.from("categories").insert({ ...input, workspace_id: workspaceId });
  const { data, error } = await q.select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Category unavailable. Reload the page.");
}
