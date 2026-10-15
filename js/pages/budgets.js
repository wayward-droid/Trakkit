import { launchPlanningPage } from "./planning-feature.js";
launchPlanningPage({
  table: "budgets", columns: "id,name,amount,period,created_at", titleField: "name", totalField: "amount", singular: "budget", plural: "budgets", orderBy: "created_at",
  fields: [
    { name: "name", label: "Budget name", type: "text", placeholder: "e.g. Monthly groceries", required: true },
    { name: "amount", label: "Spending limit", type: "number", min: "0.01", step: "0.01", required: true, numeric: true },
    { name: "period", label: "Budget period", type: "select", defaultValue: "monthly", options: [{ value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }] },
  ],
  describe: (row) => `${row.period[0].toUpperCase()}${row.period.slice(1)} spending limit`, savedMessage: "Budget created.",
});
