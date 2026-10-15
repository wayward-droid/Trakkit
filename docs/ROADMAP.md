# Remaining project work

This package starts the project according to the PRD's architecture. It implements the authentication/workspace and core transaction screens, with useful dashboard/export and company-review flows brought forward so the first version can be tried end to end.

| Next milestone                | Work and completion evidence                                                                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect and validate Supabase | Apply all three migrations, fill public config, test two real users, email confirmation and recovery, run the live acceptance checks                                                                                               |
| Complete accounts/categories  | Add account maintenance and atomic category reassignment, including explicit budget-collision choices                                                                                                                         |
| Automatic currencies          | Implement `supabase/functions/refresh-rates/index.ts`, its custom job authentication, atomic full daily snapshots, freshness handling, `config.toml` and one named cron job; verify failure behaviour and real provider dates |
| Company reporting             | Add `audit.html`, queue refinements and date-scoped category/member reports; test every role through the browser and direct API                                                                                               |
| Budgets and reports           | Add `budgets.html` and `reports.html`; server aggregates, monthly thresholds at 80%/100% and scoped totals beyond 1,000 rows                                                                                                  |
| Production checks             | Test live concurrent reviewers/owner exits/member capacity, real devices, keyboard-only use, contrast in both themes, measured Lighthouse/performance and backup restoration                                                  |

The planned page/module names follow section 12 of the PRD. Unimplemented pages are not exposed as nonworking navigation links.

Shared workspace screens, report currency and PDF/Word/PowerPoint downloads are now implemented. Self-service account deletion remains a Could feature. Bank integration, receipts, recurring transactions, automatic invitation emails, PWA/offline entry and account transfers remain later work.
