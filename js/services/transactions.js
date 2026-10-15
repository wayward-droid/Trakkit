import { scaled, precision } from "../utils/money.js";
import { getClient } from "../supabaseClient.js";

export async function listTransactions(workspaceId, f = {}) {
  if (!workspaceId) throw new Error("Select a workspace.");

  const db = await getClient();
  const page = f.page || 0,
    size = f.pageSize || 20;
  let q = db
    .from("transaction_details")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page * size, (page + 1) * size - 1);
  for (const [column, value] of Object.entries({
    account_id: f.accountId,
    category_id: f.categoryId,
    type: f.type,
    status: f.status,
  }))
    if (value) q = q.eq(column, value);
  if (f.from) q = q.gte("transaction_date", f.from);
  if (f.to) q = q.lte("transaction_date", f.to);
  if (f.search)
    q = q.ilike("note", "%" + f.search.replace(/[\\%_]/g, "\\$&") + "%");
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data, total: count };
}
async function getTransaction(db, workspaceId, id) {
  const { data, error } = await db
    .from("transaction_details")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export async function saveTransaction(workspaceId, input, existing) {
  if (!workspaceId) throw new Error("Select a workspace.");

  const db = await getClient();
  let error;
  if (existing) {
    const changes = Object.fromEntries(
      Object.entries(input).filter(([k]) =>
        [
          "account_id",
          "category_id",
          "amount",
          "transaction_date",
          "note",
          "payment_method",
          "rate_source",
          "exchange_rate",
        ].includes(k),
      ),
    );
    ({ error } = await db.rpc("update_transaction", {
      p_workspace: workspaceId,
      p_id: existing.id,
      p_revision: existing.revision,
      p_changes: changes,
    }));
  } else {
    ({ error } = await db
      .from("transactions")
      .insert({ ...input, workspace_id: workspaceId }));
  }
  if (error && !existing) {
    // A network timeout can hide a successful save; the same UUID makes retry safe.
    let saved;
    try {
      saved = await getTransaction(db, workspaceId, input.id);
    } catch {}
    if (saved) {
      const fields = [
        "account_id",
        "category_id",
        "type",
        "transaction_date",
        "note",
        "payment_method",
      ];
      const same =
        fields.every((k) => (saved[k] ?? "") === (input[k] ?? "")) &&
        scaled(saved.amount, precision(saved.currency_code)) ===
          scaled(input.amount, precision(saved.currency_code)) &&
        saved.rate_source === (input.rate_source || "auto") &&
        ((input.rate_source || "auto") !== "manual" ||
          scaled(saved.exchange_rate, 8) === scaled(input.exchange_rate, 8));
      if (same) return saved;
      throw new Error(
        "This attempt was already saved with different values. Reload before adding another record.",
      );
    }
  }
  if (error) throw error;
  const row = await getTransaction(db, workspaceId, existing?.id || input.id);
  if (!row)
    throw new Error(
      "Saved record could not be retrieved. Reload before retrying.",
    );
  return row;
}
export async function deleteTransaction(workspaceId, id, revision) {
  const db = await getClient();
  const { error } = await db.rpc("delete_transaction", {
    p_workspace: workspaceId,
    p_id: id,
    p_revision: revision,
  });
  if (error) throw error;
}
export async function exportTransactions(workspaceId, filters) {
  let rows = [],
    page = 0;
  while (true) {
    const batch = await listTransactions(workspaceId, {
      ...filters,
      page,
      pageSize: 200,
    });
    rows.push(...batch.rows);
    if (batch.rows.length < 200) break;
    page++;
  }
  return rows;
}
