import { launchPlanningPage } from "./planning-feature.js";
launchPlanningPage({
  table: "savings_goals", columns: "id,name,target_amount,saved_amount,target_date,created_at", titleField: "name", totalField: "target_amount", singular: "goal", plural: "goals", orderBy: "created_at", progress: true,
  fields: [
    { name: "name", label: "Goal name", type: "text", placeholder: "e.g. New laptop", required: true },
    { name: "target_amount", label: "Target amount", type: "number", min: "0.01", step: "0.01", required: true, numeric: true },
    { name: "saved_amount", label: "Already saved", type: "number", min: "0", step: "0.01", defaultValue: "0", numeric: true },
    { name: "target_date", label: "Target date (optional)", type: "date", emptyAsNull: true },
  ],
  describe: (row) => `Target ${row.target_date ? `by ${row.target_date}` : 'date not set'}`, savedMessage: "Savings goal created.",
});
