import { getClient } from "../supabaseClient.js";

async function rpc(name, args) {
  const db = await getClient();
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}
export async function listMembers(id) {
  const db = await getClient();
  const { data, error } = await db
    .from("workspace_members")
    .select("id,user_id,role,joined_at")
    .eq("workspace_id", id)
    .order("joined_at");
  if (error) throw error;
  if (!data.length) return [];
  const names = await db
    .from("profiles")
    .select("id,display_name")
    .in(
      "id",
      data.map((m) => m.user_id),
    );
  if (names.error) throw names.error;
  return data.map((m) => ({
    ...m,
    display_name:
      names.data.find((p) => p.id === m.user_id)?.display_name || "Member",
  }));
}
export async function listInvitations(id) {
  const db = await getClient();
  const { data, error } = await db
    .from("workspace_invitations")
    .select("id,email,role,token,expires_at")
    .eq("workspace_id", id)
    .is("accepted_at", null)
    .order("expires_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function createInvitation(id, email, role) {
  return rpc("create_invitation", {
    p_workspace: id,
    p_email: email,
    p_role: role,
  });
}
export async function acceptInvitation(token) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      token,
    )
  )
    throw new Error("Paste a valid invitation code.");

  return rpc("accept_invitation", { p_token: token });
}
export async function revokeInvitation(id, invitationId) {
  return rpc("revoke_invitation", { p_workspace: id, p_id: invitationId });
}
export async function manageMember(id, userId, role = null) {
  return rpc("manage_workspace_member", {
    p_workspace: id,
    p_user: userId,
    p_role: role,
  });
}
export async function transferOwnership(id, userId) {
  return rpc("transfer_ownership", { p_workspace: id, p_new_owner: userId });
}
export async function updateWorkspace(id, changes) {
  const patch = Object.fromEntries(
    Object.entries(changes).filter(([k]) =>
      ["name", "base_currency", "members_see_all"].includes(k),
    ),
  );

  const db = await getClient();
  const { data, error } = await db
    .from("workspaces")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Only the owner can edit this workspace.");
}
