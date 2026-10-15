# Connect your Trakkit

Follow these steps to enable accounts and cloud data using your Supabase project.

## 1 Open the frontend

Extract the ZIP and open the `trakkit` folder in VS Code. Right-click `index.html` and select **Open with Live Server**.

For example, your address might be:

```text
http://127.0.0.1:5500/index.html
```

Use the address you actually see. `localhost` and `127.0.0.1` are different hosts for redirect configuration, and the port matters.

If you prefer the Apache setup you already use, place the extracted folder under `C:\xampp\htdocs\` and open the correct HTTP address, such as `http://localhost:8080/trakkit/index.html`. You do not need to start MySQL for this project.

## 2 Create a fresh Supabase development project

Use a new development project for these migrations. They create new tables and functions and are not intended to run over an existing application's schema.

In its SQL Editor, run each whole file in this order:

1. `supabase/migrations/001_initial.sql`
2. `supabase/migrations/002_foundation_guards.sql`
3. `supabase/migrations/003_dates_reports_and_sharing.sql`
4. `supabase/migrations/004_account_overdraft_guard.sql`

Wait for success before running the next file. Do not execute only a selected fragment. All files wrap their changes in a transaction.

The first migration creates the eleven application tables and the sign-up trigger. The second adds revision-checked transaction RPCs and exact account balances. The third enforces today-only entry dates and adds yearly reporting, report conversion and member-management functions. **All three are required by the current frontend.** If you already ran 001 and 002, follow `UPGRADE.md` and run only 003.

Sign up through the app after these migrations have run. Users created before the migration will not automatically get the profile/workspace records from the new-user trigger. Use a fresh test user for the first check.

## 3 Add your public connection settings

Open `js/config.js` and fill these two values:

```js
export const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR-PUBLIC-PUBLISHABLE-OR-ANON-KEY";
```

In the hosted source checkout this file is `dist/js/config.js`; in the downloaded ZIP it is `js/config.js`.

Use the project URL and **publishable key** or legacy public **anon** key. Never paste an `sb_secret_` key, a `service_role` key, your database password or any server secret into browser code. Public client settings are visible to every visitor; the migrations enforce access in the database.

The Supabase client and Chart.js are already included. There is nothing to install for the frontend.

## 4 Configure authentication redirects

In Supabase Auth, enable email/password sign-in and email confirmation, and set a password minimum of at least eight characters. Add the exact frontend addresses under URL configuration.

For the example Live Server address above, the allowlisted redirect URLs are:

```text
http://127.0.0.1:5500/index.html
http://127.0.0.1:5500/reset.html
```

If the app is inside a subfolder, include it in both paths. Set the Site URL to the development frontend origin/path you are using. When deploying, add the exact production `index.html` and `reset.html` URLs as well and update the Site URL appropriately.

Do not paste the example addresses unchanged if your browser is using another port, host or subfolder. The app generates redirect URLs from its own location, so subfolder hosting works when the same addresses are allowlisted.

## 5 Create your first real account

1. Open `index.html` through your local server.
2. Choose **Create an account**.
3. Enter your name, email, password and personal base currency. NGN is selected initially.
4. Open the confirmation email and follow its link.
5. Sign in. Your personal workspace, ten default categories and first Cash account should already exist.
6. Add income of NGN 1,000 and an expense of NGN 250 dated today. The dashboard should show net change of NGN 750.
7. Reload the page and check that both entries remain.

If you see “Database error saving new user,” inspect the migration result and the Auth/Postgres logs. Do not disable RLS to get past the error.

## 6 Check recovery and isolation

Use **Forgot password** and follow the latest email link. Expired links should ask for a new one; the recovery page should not accept an unrelated stale session.

Use a second test account in a separate browser profile. It should receive its own workspace and see none of the first user's records. Run the live acceptance checks in `docs/LIVE-ACCEPTANCE.md` before entering real financial information.

## 7 Understand currency behaviour

- An account's currency is fixed at creation.
- The workspace base currency locks permanently once a transaction, budget or nonzero opening balance is saved.
- For a foreign-currency account, Trakkit fetches a dated online quote automatically. A rate means base-currency units per one account-currency unit.
- Foreign-currency rates are fetched automatically from the online provider; do not type a rate manually.
- Today’s edits preserve the saved rate by default. Past entries allow notes and reviews only; financial details stay locked.
- Choose **Currency** when adding an entry. If there is no account in that currency, managers can create one from the form.
- For reports, select **Report currency** and apply it. Trakkit fetches the latest available online rate automatically. This rate means report-currency units per one base-currency unit. The rate is shown on the page and in downloads. Choose a preferred report currency in Settings.

## 8 Company expenses

Create a company workspace in Settings. Owner/admin expenses start approved. A financial edit to an approved expense returns it to submitted. Open **Approvals** in the sidebar or **More → Approvals** on mobile to approve or reject it using its current revision. Rejection requires a reason; rejected expenses can be resubmitted from Transactions. Financial corrections are allowed only on the entry date.

## 9 Shared profiles and invitations

In Settings, select your Family or Company workspace. Under **Shared workspace profile**, owners can rename it and choose member visibility. Use **Invite someone** to create a code for a specific email and role. Copy and share that code yourself; no email is sent automatically. The recipient signs in with that confirmed email and uses **Join a shared workspace** in Settings. Codes expire after seven days. Managers can revoke pending invitations and manage roles; owners can transfer ownership to an existing member. An owner must transfer ownership before leaving.

## 10 Download reports

Use **Download yearly report** on Overview for January–December of the selected year. On Transactions, select filters first, then choose PDF, Word or PowerPoint and **Download report**. Exports include all matching rows across all pages. Totals include approved records only. CSV is still available. Files are generated in your browser; no report is uploaded to a conversion service.

## Common checks

| What you see                                        | Check                                                           |
| --------------------------------------------------- | --------------------------------------------------------------- |
| Sign-in button disabled                             | Fill both settings in `js/config.js`, then reload               |
| Blank page on double-clicking HTML                  | Serve through Live Server or Apache using HTTP                  |
| `account_details` or `update_transaction` not found | Apply the second migration                                      |
| Reset/confirmation link goes to the wrong place     | Check the exact redirect host, port, path and Site URL          |
| “No usable rate for this date”                      | Confirm the online-rate Edge Function is deployed and the `007_online_exchange_rates.sql` migration has been applied; the provider may not publish rates for every date. |
| Company totals exclude an expense                   | Check its status and review submitted expenses in Approvals     |
| “This transaction changed”                          | Reload it before editing or reviewing again                     |

## Online exchange-rate setup

Trakkit now fetches daily reference rates from [Frankfurter](https://frankfurter.dev/) automatically. Users do not enter rates when creating foreign-currency transactions or converting report views. These are reference rates that update on business days, not live trading or guaranteed bank/card settlement rates.

For an existing Supabase project:

1. Run `supabase/migrations/007_online_exchange_rates.sql` in the Supabase SQL Editor.
2. From the project root, make sure the Supabase CLI is linked to your project, then deploy the function: `supabase functions deploy refresh-exchange-rates`.
3. Confirm the Edge Function has the standard `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` secrets configured. Supabase normally supplies these automatically; never put the service-role key in frontend files.
4. Test by opening Add Transaction, choosing a different account currency, and checking that the preview shows an online rate and date. Then apply a different Report currency.

The rate provider may return the most recent available business-day rate for weekends, holidays, or dates with no publication. If the provider is unreachable or does not offer a requested quote, Trakkit displays an error instead of asking the user to guess an exchange rate.
