/** Local PostgreSQL-engine tests. Supabase Auth transport and multi-connection
 * concurrency still require a real development Supabase project. */
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
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = uid(1),
  admin = uid(2),
  accountant = uid(3),
  member = uid(4),
  viewer = uid(5),
  outsider = uid(6);
await test("Trakkit database authorization and money", async (t) => {
  const db = new PGlite();
  async function run(user, sql, params = []) {
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub','',false)");
    }
  }
  const fail = (user, sql, params, pattern) =>
    assert.rejects(run(user, sql, params), pattern);
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
    for (const file of ["001_initial.sql", "002_foundation_guards.sql"])
      await db.exec(
        await readFile(
          new URL("../migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    for (let n = 1; n <= 6; n++)
      await db.query("insert into auth.users values($1,$2,now(),$3)", [
        uid(n),
        `user${n}@test.example`,
        JSON.stringify({
          display_name: `User ${n}`,
          base_currency: "NGN",
          time_zone: "Africa/Lagos",
        }),
      ]);
    const personal = (
      await run(owner, "select id from public.workspaces where type='personal'")
    )[0].id;
    const company = (
      await run(
        owner,
        "select public.create_workspace('Test company','company','NGN','Africa/Lagos') as id",
      )
    )[0].id;
    const family = (
      await run(
        owner,
        "select public.create_workspace('Test family','family','NGN','Africa/Lagos') as id",
      )
    )[0].id;
    const lookup = async (ws) => {
      const a = (
        await run(
          owner,
          "select id from public.accounts where workspace_id=$1",
          [ws],
        )
      )[0].id;
      const cats = await run(
        owner,
        "select id,name from public.categories where workspace_id=$1",
        [ws],
      );
      return {
        a,
        c: cats.find((c) => c.name === "Food").id,
        i: cats.find((c) => c.name === "Salary").id,
      };
    };
    const co = await lookup(company),
      pe = await lookup(personal);
    const date = "2026-01-05";
    const insert = async (
      user,
      ws,
      account,
      cat,
      type,
      amount = "250",
      extra = {},
    ) => {
      const cols = [
        "workspace_id",
        "account_id",
        "category_id",
        "type",
        "amount",
        "transaction_date",
        ...Object.keys(extra),
      ];
      const values = [
        ws,
        account,
        cat,
        type,
        amount,
        date,
        ...Object.values(extra),
      ];
      return (
        await run(
          user,
          `insert into public.transactions(${cols.join(",")}) values(${cols.map((_, i) => "$" + (i + 1)).join(",")}) returning id,status,amount_base::text,exchange_rate::text,revision`,
          values,
        )
      )[0];
    };
    let memberTx;
    await t.test(
      "All eleven application tables have RLS; auth seeds personal accounts and categories",
      async () => {
        const rows = (
          await db.query(
            "select count(*)::int as n from pg_tables where schemaname='public' and rowsecurity",
          )
        ).rows;
        assert.equal(rows[0].n, 11);
        assert.equal(
          (
            await run(
              owner,
              "select * from public.categories where workspace_id=$1",
              [personal],
            )
          ).length,
          10,
        );
        assert.equal(
          (
            await run(
              owner,
              "select * from public.accounts where workspace_id=$1",
              [personal],
            )
          ).length,
          1,
        );
      },
    );
    await t.test(
      "Anonymous clients have no application table access",
      async () => {
        await db.exec("set role anon");
        try {
          await assert.rejects(
            db.query("select * from public.transactions"),
            /permission denied/,
          );
        } finally {
          await db.exec("reset role");
        }
      },
    );
    await t.test(
      "Verified invitations install all shared roles and can be consumed only once",
      async () => {
        for (const [id, role] of [
          [admin, "admin"],
          [accountant, "accountant"],
          [member, "member"],
          [viewer, "viewer"],
        ]) {
          const email = `user${Number(id.slice(-2))}@test.example`;
          const token = (
            await run(
              owner,
              "select public.create_invitation($1,$2,$3) as token",
              [company, email, role],
            )
          )[0].token;
          assert.equal(
            (
              await run(id, "select public.accept_invitation($1) as id", [
                token,
              ])
            )[0].id,
            company,
          );
          await fail(
            id,
            "select public.accept_invitation($1)",
            [token],
            /invalid or expired/,
          );
        }
      },
    );
    await t.test(
      "Outsiders cannot read or write another workspace",
      async () => {
        assert.equal(
          (
            await run(outsider, "select * from public.workspaces where id=$1", [
              company,
            ])
          ).length,
          0,
        );
        assert.equal(
          (
            await run(
              outsider,
              "select * from public.transactions where workspace_id=$1",
              [company],
            )
          ).length,
          0,
        );
        await assert.rejects(
          insert(outsider, company, co.a, co.c, "expense"),
          /cannot change|row-level/,
        );
        await fail(
          outsider,
          "select public.monthly_summary($1,$2)",
          [company, "2026-01-01"],
          /unavailable/,
        );
      },
    );
    await t.test(
      "Approval status is set by the database, and members cannot enter company income",
      async () => {
        memberTx = await insert(member, company, co.a, co.c, "expense", "250");
        assert.equal(memberTx.status, "submitted");
        const own = await insert(owner, company, co.a, co.c, "expense", "100");
        assert.equal(own.status, "approved");
        const act = await insert(
          accountant,
          company,
          co.a,
          co.c,
          "expense",
          "75",
        );
        assert.equal(act.status, "submitted");
        await assert.rejects(
          insert(member, company, co.a, co.i, "income"),
          /expenses only/,
        );
        await assert.rejects(
          insert(viewer, company, co.a, co.c, "expense"),
          /cannot change|row-level/,
        );
      },
    );
    await t.test(
      "Role scopes also apply to views, account balances and aggregates",
      async () => {
        const visible = await run(
          member,
          "select created_by from public.transaction_details where workspace_id=$1",
          [company],
        );
        assert.ok(visible.every((x) => x.created_by === member));
        for (const role of [owner, admin, accountant, viewer])
          assert.equal(
            (
              await run(
                role,
                "select * from public.transaction_details where workspace_id=$1",
                [company],
              )
            ).length,
            3,
          );
        const sum = (
          await run(member, "select public.monthly_summary($1,$2) as r", [
            company,
            "2026-01-01",
          ])
        )[0].r;
        assert.equal(sum.expense, "0");
        assert.equal(sum.own_only, true);
        const b = (
          await run(member, "select public.account_balances($1) as r", [
            company,
          ])
        )[0].r;
        assert.equal(b.accounts[0].balance, null);
        assert.equal(b.accounts[0].opening_balance, null);
      },
    );
    await t.test(
      "Only reviewers can approve; stale revisions cannot review twice",
      async () => {
        for (const role of [accountant, member, viewer, outsider])
          await fail(
            role,
            "select public.review_transaction($1,$2,1,'approved')",
            [company, memberTx.id],
            /Only an owner|unavailable/,
          );
        await fail(
          owner,
          "select public.review_transaction($1,$2,1,'rejected',' ')",
          [company, memberTx.id],
          /rejection needs/,
        );
        await run(
          admin,
          "select public.review_transaction($1,$2,1,'approved')",
          [company, memberTx.id],
        );
        await fail(
          owner,
          "select public.review_transaction($1,$2,1,'approved')",
          [company, memberTx.id],
          /changed/,
        );
        await fail(
          owner,
          "select public.review_transaction($1,$2,2,'approved')",
          [company, memberTx.id],
          /Invalid approval transition/,
        );
        const sum = (
          await run(owner, "select public.monthly_summary($1,$2) as r", [
            company,
            "2026-01-01",
          ])
        )[0].r;
        assert.equal(sum.expense, "350.00");
      },
    );
    await t.test(
      "Approved corrections re-enter review; direct updates cannot skip revision checks",
      async () => {
        await fail(
          member,
          "select public.update_transaction($1,$2,2,$3)",
          [company, memberTx.id, { amount: "300" }],
          /cannot be edited/,
        );
        await run(accountant, "select public.update_transaction($1,$2,2,$3)", [
          company,
          memberTx.id,
          { amount: "300" },
        ]);
        const row = (
          await run(
            owner,
            "select status,revision from public.transactions where id=$1",
            [memberTx.id],
          )
        )[0];
        assert.equal(row.status, "submitted");
        assert.equal(row.revision, 3);
        await fail(
          owner,
          "select public.update_transaction($1,$2,2,$3)",
          [company, memberTx.id, { amount: "350" }],
          /changed/,
        );
        await fail(
          owner,
          "update public.transactions set note='bypass' where id=$1",
          [memberTx.id],
          /permission denied/,
        );
        await fail(
          owner,
          "delete from public.transactions where id=$1",
          [memberTx.id],
          /permission denied/,
        );
      },
    );
    await t.test(
      "Invalid amounts, dates, categories, and cross-workspace accounts fail",
      async () => {
        for (const amount of ["0", "-1", "1000000000000", "1.001"])
          await assert.rejects(
            insert(owner, personal, pe.a, pe.c, "expense", amount),
          );
        await assert.rejects(
          insert(owner, personal, co.a, pe.c, "expense"),
          /unavailable|foreign key/,
        );
        await assert.rejects(
          insert(owner, personal, pe.a, co.c, "expense"),
          /matching category/,
        );
        await assert.rejects(
          insert(owner, personal, pe.a, pe.i, "expense"),
          /matching category/,
        );
        await assert.rejects(
          insert(owner, personal, pe.a, pe.c, "expense", "1", {
            note: "a".repeat(201),
          }),
          /check constraint/,
        );
        await fail(
          owner,
          "select public.quote_transaction($1,$2,1,$3)",
          [personal, pe.a, "2999-01-01"],
          /earlier transaction date/,
        );
      },
    );
    await t.test(
      "Currency locks persist after every transaction has been deleted",
      async () => {
        const tx = await insert(owner, personal, pe.a, pe.c, "expense");
        await run(owner, "select public.delete_transaction($1,$2,1)", [
          personal,
          tx.id,
        ]);
        await fail(
          owner,
          "update public.workspaces set base_currency='USD' where id=$1",
          [personal],
          /permanently locked/,
        );
      },
    );
    await t.test(
      "Synthetic acceptance example produces exactly NGN 750",
      async () => {
        await insert(owner, personal, pe.a, pe.i, "income", "1000");
        await insert(owner, personal, pe.a, pe.c, "expense", "250");
        const r = (
          await run(owner, "select public.monthly_summary($1,$2) as r", [
            personal,
            "2026-01-01",
          ])
        )[0].r;
        assert.equal(r.income, "1000.00");
        assert.equal(r.expense, "250.00");
        assert.equal(r.net_change, "750.00");
      },
    );
    await t.test(
      "Manual conversion is exact and amount-only edits preserve its saved rate",
      async () => {
        const usd = (
          await run(
            owner,
            "insert into public.accounts(workspace_id,name,type,currency_code) values($1,'USD cash','cash','USD') returning id",
            [personal],
          )
        )[0].id;
        const tx = await insert(owner, personal, usd, pe.c, "expense", "10", {
          rate_source: "manual",
          exchange_rate: "1500",
        });
        assert.equal(tx.amount_base, "15000.00");
        await run(owner, "select public.update_transaction($1,$2,1,$3)", [
          personal,
          tx.id,
          { amount: "20" },
        ]);
        const row = (
          await run(
            owner,
            "select amount_base::text,exchange_rate::text from public.transactions where id=$1",
            [tx.id],
          )
        )[0];
        assert.equal(row.amount_base, "30000.00");
        assert.equal(row.exchange_rate, "1500.00000000");
      },
    );
    await t.test(
      "Automatic quotes use a common historical date and keep old snapshots after refresh",
      async () => {
        const usd = (
          await run(
            owner,
            "select id from public.accounts where workspace_id=$1 and currency_code='USD'",
            [personal],
          )
        )[0].id;
        await db.exec(
          "insert into public.exchange_rates(currency_code,rate_date,units_per_usd) values('USD','2026-01-02',1),('NGN','2026-01-02',1500),('USD','2026-01-06',1),('NGN','2026-01-06',1600)",
        );
        const tx = await insert(owner, personal, usd, pe.c, "expense", "10");
        assert.equal(tx.amount_base, "15000.00");
        await db.exec(
          "insert into public.exchange_rates(currency_code,rate_date,units_per_usd) values('USD','2026-01-05',1),('NGN','2026-01-05',1700)",
        );
        await run(owner, "select public.update_transaction($1,$2,1,$3)", [
          personal,
          tx.id,
          { amount: "20", note: "keep saved rate" },
        ]);
        assert.equal(
          (
            await run(
              owner,
              "select amount_base::text from public.transactions where id=$1",
              [tx.id],
            )
          )[0].amount_base,
          "30000.00",
        );
        await fail(
          owner,
          "select public.quote_transaction($1,$2,1,'2025-12-01')",
          [personal, usd],
          /No usable rate/,
        );
      },
    );
    await t.test(
      "JPY precision and rounding follow its zero minor units",
      async () => {
        const j = (
          await run(
            owner,
            "select public.create_workspace('JPY family','family','JPY','Asia/Tokyo') as id",
          )
        )[0].id;
        const ja = await lookup(j);
        await assert.rejects(
          insert(owner, j, ja.a, ja.c, "expense", "10.5"),
          /precision/,
        );
        const usd = (
          await run(
            owner,
            "insert into public.accounts(workspace_id,name,type,currency_code) values($1,'USD','cash','USD') returning id",
            [j],
          )
        )[0].id;
        const tx = await insert(owner, j, usd, ja.c, "expense", "1", {
          rate_source: "manual",
          exchange_rate: "150.4",
        });
        assert.equal(tx.amount_base, "150");
      },
    );
    await t.test(
      "Owner protection, personal invitations and invalid family roles are enforced",
      async () => {
        await fail(
          owner,
          "delete from public.workspace_members where workspace_id=$1 and user_id=$2",
          [company, owner],
          /Keep at least/,
        );
        await fail(
          admin,
          "update public.workspace_members set role='owner' where workspace_id=$1 and user_id=$2",
          [company, admin],
          /row-level/,
        );
        await fail(
          owner,
          "select public.create_invitation($1,'hello@test.example','member')",
          [personal],
          /not allowed/,
        );
        await fail(
          owner,
          "select public.create_invitation($1,'hello@test.example','accountant')",
          [family],
          /Invalid role/,
        );
      },
    );
    await t.test(
      "Wrong email, unverified email, expiration and revoked inviter invalidate links",
      async () => {
        let token = (
          await run(
            owner,
            "select public.create_invitation($1,'user6@test.example','member') as t",
            [family],
          )
        )[0].t;
        await fail(
          viewer,
          "select public.accept_invitation($1)",
          [token],
          /invited email/,
        );
        await db.query(
          "update auth.users set email_confirmed_at=null where id=$1",
          [outsider],
        );
        await fail(
          outsider,
          "select public.accept_invitation($1)",
          [token],
          /Confirm your email/,
        );
        await db.query(
          "update auth.users set email_confirmed_at=now() where id=$1",
          [outsider],
        );
        await db.query(
          "update public.workspace_invitations set expires_at=now()-interval '1 second' where token=$1",
          [token],
        );
        await fail(
          outsider,
          "select public.accept_invitation($1)",
          [token],
          /invalid or expired/,
        );
        token = (
          await run(
            admin,
            "select public.create_invitation($1,'user6@test.example','member') as t",
            [company],
          )
        )[0].t;
        await run(
          owner,
          "update public.workspace_members set role='member' where workspace_id=$1 and user_id=$2",
          [company, admin],
        );
        await fail(
          outsider,
          "select public.accept_invitation($1)",
          [token],
          /withdrawn/,
        );
      },
    );
    await t.test(
      "Audit logs cannot be edited; restricted roles cannot read them",
      async () => {
        assert.ok(
          (
            await run(
              owner,
              "select * from public.audit_log where workspace_id=$1",
              [company],
            )
          ).length > 0,
        );
        assert.equal(
          (
            await run(
              member,
              "select * from public.audit_log where workspace_id=$1",
              [company],
            )
          ).length,
          0,
        );
        await fail(
          owner,
          "delete from public.audit_log where workspace_id=$1",
          [company],
          /permission denied/,
        );
      },
    );
    await t.test(
      "Account balances include opening amounts and do not mix permitted workspaces",
      async () => {
        const fa = await lookup(family);
        await run(
          owner,
          "update public.accounts set opening_balance=100 where id=$1",
          [fa.a],
        );
        await insert(owner, family, fa.a, fa.i, "income", "1000");
        await insert(owner, family, fa.a, fa.c, "expense", "250");
        const r = (
          await run(owner, "select public.account_balances($1) as r", [family])
        )[0].r;
        assert.equal(r.accounts[0].balance, "850");
        await fail(
          owner,
          "update public.accounts set opening_balance=0 where id=$1",
          [fa.a],
          /Opening balance is locked/,
        );
        await fail(
          owner,
          "select public.delete_transaction($1,$2,3)",
          [personal, memberTx.id],
          /changed/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
