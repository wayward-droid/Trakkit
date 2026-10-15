# PRD inspection and implementation decisions

The supplied version 3 document is suitable as the project baseline. Its strongest decisions are the explicit workspace boundary, exact stored monetary values, server-side approval rules, scoped reporting and the staged roadmap. This milestone keeps those decisions and the plain HTML/CSS/ES-module stack.

## Findings addressed while implementing

1. **The document contains reference blocks, not a runnable application.** The schema and policy blocks were assembled into one ordered migration. Browser services and page entry points now implement the initial flows.
2. **Client revision filters alone can be omitted by a direct API caller.** Migration 002 removes direct transaction update/delete privileges and routes those operations through functions that lock the workspace and row, check the current role and expected revision, and reject stale actions. Review and resubmission are separate from financial edits.
3. **Account totals need a defined read interface.** The added account-balance function computes exact original-currency totals over all approved records and hides full balances from members restricted to their own rows.
4. **Money values must survive JSON and formatting.** Database views and aggregate functions return decimal strings. Browser financial conversion uses integer arithmetic; JavaScript Number is reserved for chart plotting and nonfinancial controls.
5. **Historical rates cannot be inferred from a current quote.** The form offers manual rates when no dated pair exists. No sample rates are inserted into the real database and no provider job is claimed as active.
6. **Real backend credentials were not supplied.** Real authentication is implemented but disabled until configured. Every protected page requires a Supabase session.
7. **Published phase completion needs evidence beyond source code.** Local engine and DOM tests are included, while live Auth/email, multi-connection locking, real browsers, backups, performance and accessibility remain named acceptance gates.

## Preserved architectural boundaries

Every request includes an explicit workspace ID. RLS and SQL functions independently enforce membership. The app rechecks memberships when loading a page and on return to the tab, captures the active workspace when opening a form and ignores results from obsolete page loads. There are separate HTML and CSS files for each implemented page; page modules orchestrate services and UI modules.

All eleven tables exist from the first migration. Invitation consumption, shared owner retention, immutable identity/currency rules and company audit records are installed before later interfaces are exposed. No deletion-of-account control is shown because the trusted account-deletion workflow is still outside this milestone.

The attached Word document was not changed. This file records the practical decisions made while starting its implementation.
