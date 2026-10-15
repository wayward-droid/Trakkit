import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const modulePath = process.env.EXPENSE_QA_MODULES
  ? pathToFileURL(
      process.env.EXPENSE_QA_MODULES + "/@electric-sql/pglite/dist/index.js",
    ).href
  : "@electric-sql/pglite";
const { PGlite } = await import(modulePath);
const owner = "10000000-0000-4000-8000-000000000001",
  member = "10000000-0000-4000-8000-000000000002",
  outsider = "10000000-0000-4000-8000-000000000003";
test("Dates, calendar-year reports and shared workspace operations", async (t) => {
  const db = new PGlite();
  const run = async (user, sql, params = []) => {
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const migrate = async (file) =>
    db.exec(
      await readFile(new URL("../migrations/" + file, import.meta.url), "utf8"),
    );
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated,anon,service_role;`);
    await migrate("001_initial.sql");
    await migrate("002_foundation_guards.sql");
    for (const [id, email] of [
      [owner, "owner@example.test"],
      [member, "member@example.test"],
      [outsider, "outside@example.test"],
    ])
      await db.query("insert into auth.users values($1,$2,now(),$3)", [
        id,
        email,
        JSON.stringify({ display_name: email.split("@")[0] }),
      ]);
    const ws = (
      await run(
        owner,
        "select public.create_workspace('Shared test','company','NGN','Africa/Lagos') as id",
      )
    )[0].id;
    const account = (
      await run(owner, "select id from public.accounts where workspace_id=$1", [
        ws,
      ])
    )[0].id;
    const cats = await run(
      owner,
      "select id,type from public.categories where workspace_id=$1",
      [ws],
    );
    const insert = async (user, type, amount, date) =>
      (
        await run(
          user,
          "insert into public.transactions(workspace_id,account_id,category_id,type,amount,transaction_date) values($1,$2,$3,$4,$5,$6) returning id,revision,status",
          [
            ws,
            account,
            cats.find((c) => c.type === type).id,
            type,
            amount,
            date,
          ],
        )
      )[0];
    const dateInfo = (
      await db.query(
        "select (statement_timestamp() at time zone 'Africa/Lagos')::date::text as today, ((statement_timestamp() at time zone 'Africa/Lagos')::date-1)::text as yesterday, ((statement_timestamp() at time zone 'Africa/Lagos')::date+1)::text as tomorrow",
      )
    ).rows[0];
    const year = Number(dateInfo.today.slice(0, 4)) - 1;
    const old = await insert(owner, "income", "1000", `${year}-01-01`);
    await insert(owner, "income", "300", `${year}-09-01`);
    await insert(owner, "income", "100", `${year}-12-31`);
    await insert(owner, "expense", "50", `${year}-01-01`);
    await insert(owner, "income", "777", `${year - 1}-12-31`);
    const token = (
      await run(
        owner,
        "select public.create_invitation($1,'member@example.test','member') as token",
        [ws],
      )
    )[0].token;
    await run(member, "select public.accept_invitation($1)", [token]);
    const pending = await insert(member, "expense", "99", dateInfo.yesterday);
    await migrate("003_dates_reports_and_sharing.sql");
    await migrate("004_account_overdraft_guard.sql");

    await t.test(
      "Both income and expenses reject yesterday and tomorrow at the database boundary",
      async () => {
        for (const type of ["income", "expense"])
          for (const date of [dateInfo.yesterday, dateInfo.tomorrow])
            await assert.rejects(
              insert(owner, type, "10", date),
              /must be dated today/,
            );
        await insert(owner, "income", "60.25", dateInfo.today);
        await insert(owner, "expense", "20", dateInfo.today);
        await assert.rejects(
          run(owner, "select public.update_transaction($1,$2,1,$3)", [
            ws,
            old.id,
            JSON.stringify({ amount: "2000" }),
          ]),
          /Past financial entries are locked/,
        );
        await run(owner, "select public.update_transaction($1,$2,1,$3)", [
          ws,
          old.id,
          JSON.stringify({ note: "Reviewed historical note" }),
        ]);
        await run(
          owner,
          "select public.review_transaction($1,$2,1,'approved')",
          [ws, pending.id],
        );
        await assert.rejects(
          insert(owner, "expense", "999999", dateInfo.today),
          /Insufficient funds/,
        );
      },
    );
    await t.test(
      "Yearly income includes January through December, excluding other years and preserving member visibility",
      async () => {
        const annual = (
          await run(owner, "select public.yearly_summary($1,$2) as r", [
            ws,
            year,
          ])
        )[0].r;
        assert.equal(annual.income, "1400.00");
        const month = (
          await run(owner, "select public.monthly_summary($1,$2) as r", [
            ws,
            `${year}-09-01`,
          ])
        )[0].r;
        assert.equal(month.income, "300.00");
        const own = (
          await run(member, "select public.yearly_summary($1,$2) as r", [
            ws,
            year,
          ])
        )[0].r;
        assert.equal(own.income, "0");
        assert.equal(own.own_only, true);
        await assert.rejects(
          run(outsider, "select public.yearly_summary($1,$2)", [ws, year]),
          /Workspace unavailable/,
        );
        const current = (
          await run(owner, "select public.yearly_summary($1,$2) as r", [
            ws,
            year + 1,
          ])
        )[0].r;
        assert.equal(current.income, "60.25");
      },
    );
    await t.test(
      "Report conversion requires a real same-date rate and cannot expose another workspace",
      async () => {
        await assert.rejects(
          run(owner, "select public.report_exchange_rate($1,'USD')", [ws]),
          /No cached rate/,
        );
        await db.query(
          "insert into public.exchange_rates(currency_code,rate_date,units_per_usd) values('NGN',$1,1500),('USD',$1,1)",
          [dateInfo.today],
        );
        const q = (
          await run(
            owner,
            "select public.report_exchange_rate($1,'USD') as q",
            [ws],
          )
        )[0].q;
        assert.equal(q.rate, "0.00066667");
        assert.equal(q.stale, false);
        await assert.rejects(
          run(outsider, "select public.report_exchange_rate($1,'USD')", [ws]),
          /Workspace unavailable/,
        );
      },
    );
    await t.test(
      "Invitation revocation and role management enforce permissions and owner protection",
      async () => {
        await assert.rejects(
          run(member, "select public.manage_workspace_member($1,$2,'admin')", [
            ws,
            member,
          ]),
          /Only an owner or admin/,
        );
        await run(
          owner,
          "select public.manage_workspace_member($1,$2,'viewer')",
          [ws, member],
        );
        await assert.rejects(
          insert(member, "expense", "1", dateInfo.today),
          /role cannot change|row-level security/,
        );
        await assert.rejects(
          run(owner, "select public.manage_workspace_member($1,$2,null)", [
            ws,
            owner,
          ]),
          /Transfer ownership/,
        );
        const invitation = (
          await run(
            owner,
            "select public.create_invitation($1,'outside@example.test','viewer') as token",
            [ws],
          )
        )[0].token;
        const id = (
          await run(
            owner,
            "select id from public.workspace_invitations where token=$1",
            [invitation],
          )
        )[0].id;
        await assert.rejects(
          run(member, "select public.revoke_invitation($1,$2)", [ws, id]),
          /Invitation unavailable/,
        );
        await run(owner, "select public.revoke_invitation($1,$2)", [ws, id]);
        await assert.rejects(
          run(outsider, "select public.accept_invitation($1)", [invitation]),
          /invalid or expired/,
        );
        await run(member, "select public.manage_workspace_member($1,$2,null)", [
          ws,
          member,
        ]);
        await assert.rejects(
          run(member, "select public.yearly_summary($1,$2)", [ws, year]),
          /Workspace unavailable/,
        );
      },
    );
    await t.test(
      "The workspace time zone determines today's date",
      async () => {
        for (const zone of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
          const w = (
            await run(
              owner,
              "select public.create_workspace('Timezone','family','NGN',$1) as id",
              [zone],
            )
          )[0].id;
          const d = (
            await db.query(
              "select (statement_timestamp() at time zone $1)::date::text as d",
              [zone],
            )
          ).rows[0].d;
          await run(
            owner,
            "insert into public.transactions(workspace_id,account_id,category_id,type,amount,transaction_date) select $1,a.id,c.id,'income',1,$2 from public.accounts a cross join public.categories c where a.workspace_id=$1 and c.workspace_id=$1 and c.type='income' limit 1",
            [w, d],
          );
        }
      },
    );
  } finally {
    await db.close();
  }
});
