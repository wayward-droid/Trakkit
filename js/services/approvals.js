import { getClient } from "../supabaseClient.js";

import { listTransactions } from "./transactions.js";
export const pendingApprovals = (workspaceId, page = 0) =>
  listTransactions(workspaceId, { type: "expense", status: "submitted", page });
/** Review exactly the revision displayed to the reviewer. */
export async function reviewTransaction(
  workspaceId,
  id,
  revision,
  status,
  reason = "",
) {
  if (!["approved", "rejected", "submitted"].includes(status))
    throw new Error("Invalid review.");
  if (status === "rejected" && !reason.trim())
    throw new Error("Give a reason for rejecting this expense.");

  const db = await getClient();
  const { error } = await db.rpc("review_transaction", {
    p_workspace: workspaceId,
    p_id: id,
    p_revision: revision,
    p_status: status,
    p_reason: status === "rejected" ? reason.trim() : null,
  });
  if (error) throw error;
}
