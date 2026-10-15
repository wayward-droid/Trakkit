import { getClient } from "../supabaseClient.js";

export async function getProfile(userId) {
  const db = await getClient();
  const { data, error } = await db
    .from("profiles")
    .select("display_name,theme,display_currency")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}
export async function updateProfile(userId, changes) {
  const patch = Object.fromEntries(
    Object.entries(changes).filter(([k]) =>
      ["display_name", "theme", "display_currency"].includes(k),
    ),
  );

  const db = await getClient();
  const { data, error } = await db
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Your profile is unavailable. Sign in again.");
}
