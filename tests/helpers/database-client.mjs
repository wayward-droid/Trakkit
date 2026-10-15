// Test-only Supabase transport. Queries run against the actual migrations and RLS
// in PostgreSQL; Auth responses are controlled here, not a live email service.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.env.EXPENSE_QA_MODULES
  ? pathToFileURL(
      process.env.EXPENSE_QA_MODULES + "/@electric-sql/pglite/dist/index.js",
    ).href
  : "@electric-sql/pglite";
const { PGlite } = await import(modulePath);
const identifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value))
    throw new Error("Invalid test SQL identifier");
  return `"${value}"`;
};
const columns = (value) =>
  value === "*" ? "*" : value.split(",").map(identifier).join(",");

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = identifier(table);
    this.operation = "select";
    this.fields = "*";
    this.filters = [];
    this.sort = [];
  }
  select(fields = "*", options = {}) {
    this.fields = fields;
    this.returning = true;
    this.count = options.count === "exact";
    return this;
  }
  insert(value) {
    this.operation = "insert";
    this.value = value;
    return this;
  }
  update(value) {
    this.operation = "update";
    this.value = value;
    return this;
  }
  eq(k, v) {
    this.filters.push([k, "=", v]);
    return this;
  }
  gte(k, v) {
    this.filters.push([k, ">=", v]);
    return this;
  }
  lte(k, v) {
    this.filters.push([k, "<=", v]);
    return this;
  }
  ilike(k, v) {
    this.filters.push([k, "ilike", v]);
    return this;
  }
  is(k, v) {
    if (v !== null) throw new Error("Test transport only supports IS NULL");
    this.filters.push([k, "is null"]);
    return this;
  }
  in(k, v) {
    this.filters.push([k, "in", v]);
    return this;
  }
  order(k, { ascending = true } = {}) {
    this.sort.push([k, ascending]);
    return this;
  }
  range(from, to) {
    this.offset = from;
    this.limit = to - from + 1;
    return this;
  }
  single() {
    this.shape = "single";
    return this;
  }
  maybeSingle() {
    this.shape = "maybe";
    return this;
  }
  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
  async execute() {
    try {
      const values = [],
        bind = (v) => {
          values.push(v);
          return "$" + values.length;
        };
      const joined = this.fields.startsWith("role,workspaces(");
      const column = (k) => (joined ? "m." : "") + identifier(k);
      const where = () =>
        this.filters.length
          ? " where " +
            this.filters
              .map(([k, op, v]) => {
                if (op === "is null") return column(k) + " is null";
                if (op === "in")
                  return v.length
                    ? `${column(k)} in (${v.map(bind).join(",")})`
                    : "false";
                return `${column(k)} ${op} ${bind(v)}`;
              })
              .join(" and ")
          : "";
      let sql,
        count = null;
      if (this.operation === "select") {
        const from = joined
          ? "public.workspace_members m join public.workspaces w on w.id=m.workspace_id"
          : "public." + this.table;
        const condition = where();
        if (this.count)
          count = Number(
            (
              await this.db.query(
                "select count(*) as n from " + from + condition,
                values,
              )
            ).rows[0].n,
          );
        const fields = joined
          ? "m.role, to_jsonb(w) as workspaces"
          : columns(this.fields);
        sql = `select ${fields} from ${from}${condition}`;
        if (this.sort.length)
          sql +=
            " order by " +
            this.sort
              .map(([k, asc]) => column(k) + (asc ? " asc" : " desc"))
              .join(",");
        if (this.limit !== undefined)
          sql += " limit " + bind(this.limit) + " offset " + bind(this.offset);
        sql =
          "select coalesce(json_agg(result),'[]'::json) as data from (" +
          sql +
          ") result";
      } else {
        const entries = Object.entries(this.value);
        if (this.operation === "insert") {
          sql = `insert into public.${this.table} (${entries.map(([k]) => identifier(k)).join(",")}) values (${entries.map(([, v]) => bind(v)).join(",")})`;
        } else {
          sql =
            `update public.${this.table} set ` +
            entries.map(([k, v]) => identifier(k) + "=" + bind(v)).join(",") +
            where();
        }
        if (this.returning)
          sql =
            "with result as (" +
            sql +
            " returning " +
            columns(this.fields) +
            ") select coalesce(json_agg(result),'[]'::json) as data from result";
      }
      let data = (await this.db.query(sql, values)).rows[0]?.data ?? null;
      if (this.shape) {
        if (data.length > 1 || (this.shape === "single" && data.length !== 1))
          throw new Error("Unexpected row count");
        data = data[0] ?? null;
      }
      return { data, error: null, count };
    } catch (error) {
      return { data: null, error, count: null };
    }
  }
}

export async function databaseClient() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated,anon,service_role;`);
  for (const file of [
    "001_initial.sql",
    "002_foundation_guards.sql",
    "003_dates_reports_and_sharing.sql",
    "004_account_overdraft_guard.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  const user = {
    id: "20000000-0000-4000-8000-000000000001",
    email: "owner@example.test",
  };
  await db.query("insert into auth.users values($1,$2,now(),$3)", [
    user.id,
    user.email,
    JSON.stringify({
      display_name: "Test Owner",
      base_currency: "NGN",
      time_zone: "Africa/Lagos",
    }),
  ]);
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user.id,
  ]);
  const personalId = (
    await db.query("select id from public.workspaces where type='personal'")
  ).rows[0].id;
  const state = {
    session: { user },
    calls: [],
    listeners: new Set(),
    loginError: null,
  };
  const respond = (name, value, data = {}) => {
    state.calls.push({ name, value });
    return { data, error: null };
  };
  const client = {
    from: (table) => new Query(db, table),
    async rpc(name, args) {
      try {
        const entries = Object.entries(args),
          params = entries.map(([, v]) => v);
        const sql = `select public.${identifier(name)}(${entries.map(([k], i) => identifier(k) + " => $" + (i + 1)).join(",")}) as value`;
        return {
          data: (await db.query(sql, params)).rows[0].value,
          error: null,
        };
      } catch (error) {
        return { data: null, error };
      }
    },
    auth: {
      async getSession() {
        return { data: { session: state.session }, error: null };
      },
      async getUser() {
        return { data: { user: state.session?.user ?? null }, error: null };
      },
      onAuthStateChange(callback) {
        state.listeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => state.listeners.delete(callback),
            },
          },
        };
      },
      async signInWithPassword(input) {
        if (state.loginError) return { data: null, error: state.loginError };
        state.session = { user };
        return respond("signInWithPassword", input, { session: state.session });
      },
      async signUp(input) {
        return respond("signUp", input, { user, session: null });
      },
      async signOut() {
        state.session = null;
        for (const callback of state.listeners) callback("SIGNED_OUT", null);
        return respond("signOut");
      },
      async resetPasswordForEmail(email, options) {
        return respond("resetPasswordForEmail", { email, options });
      },
      async updateUser(input) {
        return respond("updateUser", input, { user });
      },
    },
  };
  return { db, client, user, personalId, state };
}
