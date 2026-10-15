-- Add useful income categories to existing Trakkit workspaces.
-- Safe to run more than once: duplicate workspace/category pairs are ignored.
begin;
insert into public.categories (workspace_id, name, type, color)
select w.id, c.name, 'income', c.color
from public.workspaces w
cross join (values
  ('Freelance', '#10b981'),
  ('Business income', '#14b8a6'),
  ('Sales', '#06b6d4'),
  ('Commission', '#0d9488'),
  ('Bonus', '#84cc16'),
  ('Investment returns', '#6366f1'),
  ('Interest', '#8b5cf6'),
  ('Rental income', '#a855f7'),
  ('Gifts', '#ec4899'),
  ('Refunds', '#f97316'),
  ('Pension', '#64748b'),
  ('Benefits', '#eab308'),
  ('Royalties', '#d946ef'),
  ('Grants', '#3b82f6'),
  ('Cashback', '#f59e0b')
) as c(name, color)
where not exists (
  select 1 from public.categories existing
  where existing.workspace_id = w.id
    and existing.type = 'income'
    and lower(existing.name) = lower(c.name)
);
commit;
