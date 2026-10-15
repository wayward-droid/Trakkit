# Trakkit — refinement prompt

Improve the existing Trakkit in place using the supplied Flowstate reference as visual inspiration. Work in the current project, keep its identity and routes, and publish to its existing Site. This is a design and interaction refinement of a functioning financial application.

## Preserve the application

Keep the nine separate HTML pages, their individual CSS and JavaScript entry points, vanilla JavaScript, and Supabase services. Preserve sign-in, registration, email recovery, all five password visibility controls, session guards, workspaces, role permissions, approvals, accounts, categories, transactions, search, pagination, themes and exports. Keep new entries restricted to today in the workspace time zone, historical financial fields locked, and total income calculated for the full selected calendar year. Preserve currency conversion and PDF, Word, PowerPoint and CSV downloads. Keep the removed demonstration mode absent.

Do not replace the application with a single HTML landing page, a waitlist, a new brand, fake user counts or financial figures. Keep public connection settings and all database migrations unchanged.

## Adapt the visual direction

- Keep the Trakkit name and its three-bar mark. Introduce a restrained midnight, cyan and blue palette, with violet used only as a decorative accent. Keep income, expense, warning and error meanings clear.
- Use Onest with a reliable system-font fallback, clear heading hierarchy, readable form text and tabular financial figures. Use bounded responsive sizes rather than shrinking the entire interface with viewport-based root font sizes.
- Give the existing authentication pages an atmospheric flowing-color background, a dark legibility layer, a glass feature panel, and a short word-by-word heading reveal. Keep the actual authentication form prominent and immediately usable.
- Carry the same design language into the dashboard, transactions, accounts, approvals and settings: calm surfaces, fine borders, useful spacing, rounded controls, clear active navigation, and subtle transitions. Keep financial tables and charts visually quiet.
- Retain light, dark and system themes. Preserve the mobile navigation and ensure forms, reports, long amounts and shared workspace controls fit narrow screens.

## Motion and resilience

Use a small, self-contained decorative WebGL color field on authentication pages. It may evoke flowing ink without importing the reference's full fluid solver. Add a visible pause/play control, remember the user's choice, respect reduced-motion and data-saving preferences, cap resolution and frame rate, and pause while hidden or offscreen. Release GPU resources on teardown. Render a polished static gradient if graphics support is unavailable. Keep graphics independent of authentication so a visual failure cannot interrupt signing in.

Use brief entrances and hover/focus transitions elsewhere. Preserve native scrolling, keyboard navigation, visible focus states and labelled controls. Do not add smooth-scroll libraries or motion to transaction data values.

## Completion

Verify normal authenticated workflows, password visibility, date rules, yearly totals, currencies, sharing and document exports. Check links and syntax, and review theme contrast and responsive constraints. Record any unavailable browser or live Supabase checks honestly. Update the existing project download with this brief and the refined source.
