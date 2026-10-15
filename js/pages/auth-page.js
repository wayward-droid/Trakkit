import { configured, getClient } from "../supabaseClient.js";
import {
  session,
  logIn,
  signUp,
  requestPasswordReset,
  resetPassword,
} from "../services/auth.js";
import { bindTheme } from "../ui/theme.js";
import { fillSelect, message, busy } from "../ui/dom.js";
import { CURRENCIES } from "../utils/money.js";
import { requiredText } from "../utils/validate.js";
export async function initAuth(page) {
  bindTheme();
  const form = document.querySelector("#auth-form"),
    submit = form.querySelector("[type=submit]");
  document.querySelector("#setup-note").hidden = configured;
  if (page === "signup") {
    fillSelect(
      document.querySelector("#signup-currency"),
      CURRENCIES.map((c) => ({
        value: c.code,
        label: c.code + " · " + c.name,
      })),
    );
    form.elements.base_currency.value = "NGN";
  }
  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    const input = form.elements.namedItem(
      button.dataset.togglePassword || "password",
    );
    if (!input) return;
    const fieldLabel = input.name.replaceAll("_", " ");
    button.setAttribute("aria-pressed", String(input.type === "text"));
    button.onclick = () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.textContent = show ? "Hide" : "Show";
      button.setAttribute(
        "aria-label",
        `${show ? "Hide" : "Show"} ${fieldLabel}`,
      );
      button.setAttribute("aria-pressed", String(show));
    };
  });
  let recovery = false;
  if (page === "reset") {
    const hash = new URLSearchParams(location.hash.slice(1)),
      query = new URLSearchParams(location.search),
      linkError = hash.get("error") || query.get("error");
    recovery = hash.get("type") === "recovery";
    try {
      if (linkError)
        throw new Error(
          "This password reset link is invalid or expired. Request a new link.",
        );
      if (!configured)
        throw new Error("Connect Supabase to use password recovery.");
      const db = await getClient();
      db.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          recovery = true;
          submit.disabled = false;
        }
      });
      const { data, error } = await db.auth.getUser();
      if (error || !data.user || !recovery)
        throw new Error(
          "Open the latest password reset link from your email. You can request another below.",
        );
    } catch (e) {
      recovery = false;
      submit.disabled = true;
      message(form, e.message);
    }
  } else if (configured && (page === "index" || page === "signup")) {
    try {
      if (await session()) {
        location.replace("dashboard.html");
        return;
      }
    } catch (e) {
      message(form, "Unable to restore your session. Check your connection.");
    }
  }
  if (!configured) submit.disabled = true;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    message(form, "");
    message(form, "", true);
    try {
      if (!configured)
        throw new Error(
          "Account access is not configured yet. Follow the included setup guide.",
        );
      const f = new FormData(form);
      if (
        (page === "signup" || page === "reset") &&
        f.get("password") !== f.get("confirm_password")
      )
        throw new Error("Your passwords do not match.");
      busy(submit, true, "Please wait…");
      if (page === "index") {
        await logIn(f.get("email"), f.get("password"));
        location.href = "dashboard.html";
      }
      if (page === "signup") {
        const data = await signUp(
          f.get("email"),
          f.get("password"),
          requiredText(f.get("display_name"), 80, "Your name"),
          f.get("base_currency"),
        );
        form.elements.password.value = "";
        form.elements.confirm_password.value = "";
        if (data.session) location.href = "dashboard.html";
        else
          message(
            form,
            "Check your email to confirm your account, then return here to sign in.",
            true,
          );
      }
      if (page === "forgot-password") {
        await requestPasswordReset(f.get("email"));
        message(
          form,
          "If an account exists for that email, a reset link will arrive shortly. Check your spam folder too.",
          true,
        );
      }
      if (page === "reset") {
        if (!recovery) throw new Error("Request a new reset link first.");
        await resetPassword(f.get("password"));
        form.reset();
        message(
          form,
          "Password updated. You can open your dashboard now.",
          true,
        );
        setTimeout(() => location.replace("dashboard.html"), 1200);
      }
    } catch (e) {
      message(
        form,
        e.message ||
          "Something went wrong. Check your connection and try again.",
      );
    } finally {
      busy(submit, false);
      if (page === "reset" && !recovery) submit.disabled = true;
    }
  });
}
