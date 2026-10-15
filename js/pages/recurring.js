import { launchPlanningPage } from "./planning-feature.js";
launchPlanningPage({
  table: "recurring_bills", columns: "id,name,amount,frequency,next_due,status,created_at", titleField: "name", totalField: "amount", singular: "bill", plural: "bills", orderBy: "next_due", ascending: true,
  fields: [
    { name: "name", label: "Bill or subscription", type: "text", placeholder: "e.g. Internet subscription", required: true },
    { name: "amount", label: "Amount", type: "number", min: "0.01", step: "0.01", required: true, numeric: true },
    { name: "frequency", label: "Frequency", type: "select", defaultValue: "monthly", options: [{ value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }] },
    { name: "next_due", label: "Next due date", type: "date", required: true, defaultValue: new Date().toISOString().slice(0,10) },
    { name: "status", label: "Status", type: "select", defaultValue: "active", options: [{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "paid", label: "Paid" }] },
  ],
  describe: (row) => `${row.frequency[0].toUpperCase()}${row.frequency.slice(1)} · Due ${row.next_due} · ${row.status}`, savedMessage: "Recurring bill added.",
});
