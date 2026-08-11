/**
 * Authenticated-session helper for integration tests.
 *
 * Every integration suite used to authenticate by posting `{ newEmployee }` to
 * /api/auth/login, which created an account and logged in atomically. That path
 * is now the first-run bootstrap only — it is refused once any account exists —
 * so suites create their employee directly and log in by id instead. Password
 * verification is skipped outside production, so no password is needed.
 *
 * Roles are looked up by canonical name from `EMPLOYEE_ROLES` rather than
 * upserted ad hoc. Suites previously created a lowercase `'pathologist'` row
 * distinct from the seeded `'Pathologist'`, which the authorization guards would
 * reject. The reference-data migrations already insert every canonical role, so
 * the lookup finds one; the upsert here only covers a database migrated but not
 * yet carrying the row.
 *
 * Roles are deliberately never deleted on teardown — they are shared, idempotent
 * fixtures, and `fileParallelism: false` means suites run one at a time.
 */
import type request from 'supertest';
import type { EmployeeRoleName } from '@lis/shared';
import { prisma } from '../../lib/prisma.js';

export interface TestEmployee {
  employeeId: number;
  employeeRoleId: number;
  userName: string;
}

/** Resolves a canonical role to its id, inserting it if the migration has not. */
export async function ensureRole(roleName: EmployeeRoleName): Promise<number> {
  const role = await prisma.employeeRole.upsert({
    where: { roleName },
    update: {},
    create: { roleName },
  });
  return role.employeeRoleId;
}

/**
 * Creates an employee with `roleName` and logs `agent` in as them.
 *
 * `userName` must be unique per run; suites derive it from their nonce.
 */
export async function createEmployeeAndLogin(
  agent: ReturnType<typeof request.agent>,
  roleName: EmployeeRoleName,
  userName: string,
  names: { firstName?: string; lastName?: string } = {}
): Promise<TestEmployee> {
  const employeeRoleId = await ensureRole(roleName);

  const employee = await prisma.employee.create({
    data: {
      firstName: names.firstName ?? 'Test',
      lastName: names.lastName ?? 'User',
      userName,
      employeeRoleId,
    },
  });

  const employeeId = Number(employee.employeeId);
  const res = await agent.post('/api/auth/login').send({ employeeId });
  if (res.status !== 200) {
    throw new Error(`Test login failed for ${userName} (${roleName}): ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { employeeId, employeeRoleId, userName };
}
