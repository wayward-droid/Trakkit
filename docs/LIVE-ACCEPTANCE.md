# Live acceptance checks

Use a fresh development Supabase project and synthetic records. Record the actual date, browser, URL, role and result for each check. Local test success is not a claim that this checklist has already passed in hosted Supabase.

## Authentication and configuration

- Apply both migrations; verify eleven public application tables have RLS enabled and `private` is not exposed in the Data API.
- Confirm no secret/service-role key appears in browser assets.
- Sign up two new users and confirm their emails; each gets only their own personal workspace, ten categories and Cash account.
- Check sign-in failure, session reload, sign-out success/failure and sign-out in a second tab.
- Open each protected page with no session and confirm the redirect to sign-in.
- Test confirmation and recovery using the exact production/development URL, including subfolder and port.
- Test expired recovery, invalid recovery and opening reset.html with an ordinary session. Passwords must remain unchanged on those failures.

## Core data flow

- Enter income of 1,000 and an approved expense of 250 dated today; net change must be 750. Verify account opening balances affect account balances but not monthly net change.
- Add/edit/delete; cancel a deletion and confirm it retains the entry. Enter zero, negative, excessive precision, oversized amounts, past and future dates, blank categories and 201-character notes.
- Put script-like text in a note/category; it must display as text.
- Filter all combinations; export more than 200 matching rows and verify all matches appear. The header documents original currency, saved rate, base currency, actor and status.
- Repeat a timed-out create with the same UUID; it must not make a second record. If the server saved different values, the interface must ask for a reload.
- Edit one transaction from two sessions. The second stale revision must fail.
- Switch workspace while a list, quote or save is pending; no response may replace the new workspace's data or change its form target.
- Revoke membership in another session; returning to the tab must revalidate access.

## Currency and approvals

- Test NGN, USD and JPY precision. USD 10 at a manual 1,500 NGN/USD gives 15,000 NGN. USD 1 at 150.4 JPY/USD gives 150 JPY. These are synthetic values.
- Confirm same-currency rates are one. Amount-only/note-only edits preserve saved rates, while an explicit rate/date/account change requests a new quote.
- After introducing the rate job, verify common provider dates, historical gaps, weekend fallback, stale warnings, job authentication and atomic failure handling.
- Use owner, admin, accountant, member, viewer and outsider accounts. Check allowed and denied operations directly through the API as well as through the interface.
- Test company member income denial; accountant/member expenses submitted; owner/admin new expenses approved; one reviewer succeeds and a stale reviewer fails.
- Approved financial corrections re-enter review. Rejection needs a reason. Editing and resubmitting are separate actions.
- All dashboards, exports and reports follow the same row visibility. Restricted members receive null full-account balances.

## Shared membership and concurrency

Use the Settings shared profile, invitation, join and member-management controls. Test each role both through the interface and by direct API.

- Wrong or unverified email, expired/revoked/reused invitation, departed inviter and invalid family-accountant role all fail.
- Two simultaneous invitation accepts consume one token once.
- Two simultaneous accepts at nineteen members add at most one twentieth member.
- Simultaneous owner demotion/removal/exit always leaves an owner; ownership transfer succeeds atomically.
- Workspace deletion cascades correctly to its records and audit history. No application user can edit audit rows directly.

## Launch review

- Visually inspect every page at 360 px, tablet and desktop widths in both themes. Check tables, dialogs, bottom navigation and long names/amounts.
- Keyboard-test form controls, dialogs, focus return, themes and mobile More navigation.
- Check Chart.js rendering against the exact figures available below the chart.
- Measure accessibility and performance; do not assume the PRD's 90+ Lighthouse target or two-second load target is met.
- Run the money totals against a dataset above 1,000 rows, then the PRD's large-workspace target dataset.
- Complete backup and restoration checks before real use.

## Latest date/report checks

- Keep the entry form open across midnight in the workspace time zone; saving yesterday’s date must fail. New entries cannot use past or future dates, including through direct inserts/RPC calls. Old financial fields stay locked; note changes and later approvals remain possible.
- Compare the income card with all approved income from 1 January through 31 December, including a year with entries in several months. Month navigation within a year must not reset annual income.
- Change report currency with manual and cached rates, then switch workspaces while a quote is pending. Missing rates must produce a clear prompt and retain the last applied view.
- Download PDF, Word and PowerPoint with more than one page of data, empty results, long notes and non-ASCII text. Check all rows, statuses, original currencies, approved-only totals and conversion labels.
- Test currency account creation from the entry form. Apply the preferred report currency from Settings.
