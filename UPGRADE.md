# Update an existing Trakkit

1. Back up your current project folder. Keep your own `js/config.js` connection settings.
2. Replace the frontend HTML, `css`, `js` and `assets` folders with this version. Restore your own `js/config.js` afterward; the supplied copy has blank public connection settings. Include all assets, because report libraries and fonts are new.
3. If migrations 001 and 002 already succeeded but 003 has not been applied, run **only** the entire `supabase/migrations/003_dates_reports_and_sharing.sql` file in your Supabase SQL Editor. If migrations 001–003 already succeeded, run **only** `supabase/migrations/004_account_overdraft_guard.sql` to add database-level overdraft protection. For a new project, run 001–004 in order.
4. Refresh the app. You should see **Yearly total income**, report currency controls, PDF/Word/PowerPoint downloads, and shared profile/member controls in Settings.

The migration keeps existing transactions. New income and expenses must be dated today in the workspace time zone. Past financial entries are locked; notes, approvals and permitted deletion remain available. It adds database functions required by the new reporting and sharing controls.

Sign-in, invitations and shared data require your configured Supabase project. Automatic exchange-rate fetching is not enabled; use an available cached rate or enter your own.

Remove the obsolete `js/services/demo.js` file from older local copies. Replace the whole `tests` folder if you keep developer checks. The demo-code cleanup itself needs no migration; migration 004 is required for database-level overdraft protection. Migrations 001–004 are required for the complete current version.

The latest visual refinement updates the existing pages and adds `js/ui/auth-ambient.js` and `js/ui/ambient-renderer.js`. Include both files when replacing the frontend. All business rules and public connection settings are unchanged. The background animation is optional and includes its own static fallback and pause control.

## Planning pages (migration 005)

The Budgets, Savings goals, and Recurring bills pages use three workspace-scoped Supabase tables. For an existing Supabase project, run `supabase/migrations/005_planning_features.sql` after migrations 001–004 in the Supabase SQL Editor. The migration creates row-level security policies for workspace members. Then refresh the site and use the new pages from the sidebar.


### More income categories (v7)

Run `supabase/migrations/006_more_income_categories.sql` in the Supabase SQL Editor to add the new income categories to existing workspaces. Fresh installs also receive them from the updated `001_initial.sql` seed list. The migration is safe to rerun.
