import { getClient, configured } from "../supabaseClient.js";

const page = (name) => new URL(`../../${name}`, import.meta.url).href;
export async function session() {
  if (!configured) return null;
  const db = await getClient();
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  return data.session;
}
export async function logIn(email, password) {
  const db = await getClient();
  const { data, error } = await db.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error)
    throw new Error(
      "Unable to sign in. Check your email, password and connection.",
    );
  return data;
}
export async function signUp(email, password, displayName, baseCurrency) {
  const db = await getClient();
  const { data, error } = await db.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: page("index.html"),
      data: {
        display_name: displayName.trim(),
        base_currency: baseCurrency,
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    },
  });
  if (error) throw error;
  return data;
}
export async function logOut() {
  if (!configured) return;
  const db = await getClient();
  const { error } = await db.auth.signOut();
  if (error)
    throw new Error("Sign out failed. Check your connection and try again.");
}
export async function requestPasswordReset(email) {
  const db = await getClient();
  const { error } = await db.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: page("reset.html"),
  });
  if (error) throw error;
}
export async function resetPassword(password) {
  const db = await getClient();
  const { error } = await db.auth.updateUser({ password });
  if (error) throw error;
}
export async function observeAuth(callback) {
  if (!configured) return () => {};
  const db = await getClient();
  const { data } = db.auth.onAuthStateChange((event, s) => callback(event, s));
  return () => data.subscription.unsubscribe();
}
