-- Add the Administrator role.
--
-- Administrative functions (the /api/config/* surface, report templates and
-- layouts, the ancillary catalog, and CSV roster import) are separated from
-- clinical authority: roster import creates staff accounts, so leaving it with
-- the Pathologist role would let anyone who can sign out a case also provision
-- accounts.
--
-- Data-only migration: no schema change, so it is drift-neutral against
-- schema.prisma. Uses ON CONFLICT DO NOTHING so re-running is safe, matching
-- 20260609000000_seed_reference_data.
--
-- NOTE for existing deployments: production runs `prisma migrate deploy` but
-- never the seed script, so this creates the role with nobody holding it. The
-- /api/config/* surface is Administrator-only from this release, and
-- PATCH /api/employees/:id/role is itself Administrator-only, so promote one
-- existing account by hand before deploying:
--
--   UPDATE employee SET employee_role_id =
--     (SELECT employee_role_id FROM employee_role WHERE role_name = 'Administrator')
--   WHERE user_name = '<your-admin-username>';

INSERT INTO employee_role (role_name) VALUES
  ('Administrator')
ON CONFLICT (role_name) DO NOTHING;
