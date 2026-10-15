# Trakkit

A first working milestone built from **Trakkit Product Requirements and Architecture, version 3, 8 October 2026**. The app uses semantic HTML, separate CSS files, vanilla JavaScript modules and Supabase. There is no frontend build step and no package installation needed to use it.

## Start here

1. Extract the ZIP into a folder called `trakkit`.
2. Open that folder in VS Code.
3. Open `index.html` with **Live Server**. Keep the actual address it opens, including its port and any subfolder.
4. Follow [SETUP.md](SETUP.md) to connect your Supabase project.
5. Create your account, confirm your email and sign in.

Do not double-click the HTML files to open a `file://` address. ES modules need an HTTP server. If you use XAMPP instead, Apache can serve these static files; MySQL and PHP are not used by this project.

## What works in this milestone

| Area                    | Included                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication          | Separate sign-in, sign-up, forgot-password and reset pages; route guard and logout; ready to connect to Supabase                                             |
| Workspaces              | Personal workspace on sign-up, family/company workspace creation, validated switcher and per-user remembered selection                                       |
| Transactions            | Today-only income/expenses, locked past financial fields, revision-checked delete, 20-row pagination, note search, account/category/type/status/date filters |
| Money                   | Currency precision validation, exact decimal-string totals, stored conversion rates and manual cross-currency rates                                          |
| Dashboard               | Full-calendar-year approved income, monthly expenses/net change, month navigation, category doughnut, six-month bars and exact accessible figures            |
| Accounts and categories | Create accounts with fixed currencies, original-currency balances; create, rename and recolour categories                                                    |
| Company review          | Owner/admin approval queue, rejection reasons and separate resubmission; financial edits return approved expenses to review                                  |
| Export                  | Every matching transaction under the same workspace scope, PDF, Word (.docx), PowerPoint (.pptx), quoted CSV and formula protection                          |
| Appearance              | Responsive layouts, keyboard controls, light/dark/system themes and profile preferences                                                                      |
| Database                | All eleven tables, RLS, reference data, triggers, invitation and ownership RPCs, audit triggers and tested revision checks                                   |

Account access requires your Supabase project URL and public key in `js/config.js`. Until those settings are supplied, authentication controls show a setup message. Protected pages require a signed-in Supabase session and all financial data is stored in your database.

## What is deliberately next

This is the starting implementation, not the entire eleven-week v1 release described in the PRD. The next work is listed in [docs/ROADMAP.md](docs/ROADMAP.md): the scheduled automatic rate-refresh function, budgets, richer reports, the audit-log screen and category reassignment. Receipt uploads, bank syncing and recurring transactions remain outside v1 as specified in your document.

Settings now includes shared workspace profiles, member visibility, invitation codes, joining with a verified email, role changes, removal/leave, and ownership transfer. Invitations are copied manually; the app does not send email.

Automatic foreign-currency quotes work only when the date has a complete matching pair in `exchange_rates`. This milestone does not schedule or fetch provider rates. If no quote exists, the form requests a manual rate. No conversion rewrites older transaction values.

## Project layout

Each implemented page has a matching `css/pages/<page>.css` and `js/pages/<page>.js`.

| Location                                                          | Purpose                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `index.html`, `signup.html`, `forgot-password.html`, `reset.html` | Authentication                                                                         |
| `dashboard.html`, `transactions.html`, `accounts.html`            | Everyday money tracking                                                                |
| `approvals.html`, `settings.html`                                 | Company reviews and personal/workspace preferences                                     |
| `css/variables.css`, `base.css`, `components.css`                 | Theme tokens, global layout and shared controls                                        |
| `js/config.js`, `supabaseClient.js`                               | Public configuration and one Supabase client per page                                  |
| `js/services/`                                                    | Supabase database and authentication operations                                        |
| `js/pages/`                                                       | Page orchestration and event handlers                                                  |
| `js/ui/`                                                          | DOM rendering, forms, dialogs and charts                                               |
| `js/state/`                                                       | Validated workspace selection                                                          |
| `js/utils/`                                                       | Money, dates, permissions, CSV and validation                                          |
| `assets/vendor/`                                                  | Bundled Supabase, Chart.js and lazy-loaded PDF/Word/PowerPoint libraries with licenses |
| `supabase/migrations/`                                            | Ordered migrations for a fresh Supabase project                                        |
| `supabase/tests/`                                                 | Database authorization and integrity checks                                            |
| `tests/`                                                          | Money, authenticated DOM-flow and source checks                                        |
| `docs/`                                                           | PRD inspection, remaining work and live acceptance checks                              |

The downloadable ZIP places the HTML, CSS, JS and assets at the project root, matching the PRD. In the hosted source checkout only, the same frontend lives in `dist/`; tests detect both layouts.

## Updated behaviour

- New income and expenses must use **today in the workspace time zone**. The form and database enforce the rule. Old entries remain visible; notes and approvals still work, but past financial details cannot be rewritten.
- **Yearly total income** covers 1 January–31 December of the selected dashboard year. Expenses and net change are explicitly monthly. Opening balances are not income.
- Choose a currency directly in the entry form; managers can create an account in that currency without leaving it. Choose a report currency on Overview or Transactions and apply a cached or manual rate. Stored amounts and rates remain unchanged. Set a preferred report currency in Settings.
- Download the complete selected year from Overview, or all matching rows from Transactions, as PDF, Word or PowerPoint. Original amounts and report amounts are included; totals count approved records only. Conversion rounds each exported row before summing, so the converted report total can differ by a few minor units from the dashboard's converted aggregate.
- Apply migration **003** to enable these changes in an existing Supabase installation. See [UPGRADE.md](UPGRADE.md).

## Verification

Local checks cover the migration, all eleven RLS tables, five roles plus an outsider, anonymous denial, approval transitions, stale revisions, frozen currency/rate rules, scoped balances, invitation failures, audit protections, twenty hand-calculated conversions, CSV safety and the main DOM interactions.

These checks ran in a local PostgreSQL engine and a DOM test environment. The DOM checks use the normal app services with database row-level security and controlled Auth responses. **They do not replace live Supabase Auth/email tests, real multi-connection concurrency tests, visual browser/device review or Lighthouse measurements.** No performance or accessibility score is claimed. Those checks are documented in [docs/LIVE-ACCEPTANCE.md](docs/LIVE-ACCEPTANCE.md).

If you want to run developer checks, install Node.js 22 or newer. The optional test dependencies are unrelated to using the static frontend.

```bash
npm install
npm test
npm run test:db
npm run check
```

## References used

The supplied PRD is the source of product decisions. Integration details were checked against the primary documentation:

- [Supabase password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [Supabase Row Level Security and security-invoker views](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Chart.js 4.5.1](https://github.com/chartjs/Chart.js/releases/tag/v4.5.1)

To change report templates, edit `export-src/` and run `npm run build:exports`. The ZIP already includes the built browser files and fonts.

## Interface refinement

The current nine-page application uses a midnight/cyan visual theme, clearer cards and controls, and a decorative flowing-color background on the four authentication pages. Light, dark and system themes remain available. Onest is loaded from Google Fonts with a system-font fallback.

The background has a pause/play button, respects reduced-motion and data-saving preferences, and pauses while hidden or offscreen. Unsupported graphics use a static gradient. The visual modules are independent of authentication and never read financial data. The adapted reference prompt is in [docs/INTERFACE-DESIGN-BRIEF.md](docs/INTERFACE-DESIGN-BRIEF.md).

The Trakkit refinement adds an expandable icon-first sidebar, shortcut links to reports/categories/company access, account-balance feedback in the transaction form, and migration `004_account_overdraft_guard.sql` for database-enforced overspending prevention. Run the migration after 001–003. Static project checks pass; full browser rendering and live Supabase Auth still need verification with your configured project.
