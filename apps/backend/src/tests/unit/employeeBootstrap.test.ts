/**
 * First-run account bootstrap.
 *
 * The refusal path — self-registration once an account exists — is covered end to
 * end in tests/integration/authorization.test.ts. What cannot be covered there is
 * the *successful* first-run case, because asserting it requires an employee
 * table that is genuinely empty, and emptying the shared integration database
 * would destroy the other suites' actors (and a developer's seeded demo staff).
 *
 * So the Prisma client is mocked here and the assertion is the security-relevant
 * one: the first account is forced to Administrator whatever role the anonymous
 * caller submitted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EMPLOYEE_ROLES } from '@lis/shared';

const employee = { count: vi.fn(), findUnique: vi.fn(), create: vi.fn() };
const employeeRole = { findUnique: vi.fn() };

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    employee,
    employeeRole,
    // The service runs the count and the insert in one transaction; the mock
    // hands the same client back so both see these stubs.
    $transaction: (fn: (tx: unknown) => unknown) => fn({ employee, employeeRole }),
  },
}));

vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }));

const { EmployeeService } = await import('../../services/employee.service.js');
const { AppError } = await import('../../middleware/error.middleware.js');

const ADMIN_ROLE_ID = 3;
const PATHOLOGIST_ROLE_ID = 1;

const submitted = {
  firstName: 'First',
  lastName: 'Admin',
  userName: 'firstadmin',
  // An anonymous caller asking to be a pathologist — the escalation attempt.
  employeeRoleId: PATHOLOGIST_ROLE_ID,
  password: 'BootstrapPass1!',
};

beforeEach(() => {
  for (const fn of [employee.count, employee.findUnique, employee.create, employeeRole.findUnique]) {
    fn.mockReset();
  }
  employee.findUnique.mockResolvedValue(null);
  employee.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ ...data }));
  employeeRole.findUnique.mockResolvedValue({ employeeRoleId: ADMIN_ROLE_ID, roleName: EMPLOYEE_ROLES.ADMINISTRATOR });
});

describe('isBootstrapAvailable', () => {
  it('is true only while the employee table is empty', async () => {
    const service = new EmployeeService();

    employee.count.mockResolvedValue(0);
    expect(await service.isBootstrapAvailable()).toBe(true);

    employee.count.mockResolvedValue(1);
    expect(await service.isBootstrapAvailable()).toBe(false);
  });
});

describe('createFirstAdministrator', () => {
  it('forces the Administrator role, ignoring the role the caller asked for', async () => {
    employee.count.mockResolvedValue(0);

    await new EmployeeService().createFirstAdministrator(submitted);

    expect(employeeRole.findUnique).toHaveBeenCalledWith({
      where: { roleName: EMPLOYEE_ROLES.ADMINISTRATOR },
    });
    const created = employee.create.mock.calls[0][0].data;
    expect(created.employeeRoleId).toBe(ADMIN_ROLE_ID);
    expect(created.employeeRoleId).not.toBe(PATHOLOGIST_ROLE_ID);
  });

  it('hashes the supplied password rather than storing it', async () => {
    employee.count.mockResolvedValue(0);

    await new EmployeeService().createFirstAdministrator(submitted);

    const created = employee.create.mock.calls[0][0].data;
    expect(created.passwordHash).toBe('hashed');
    expect(JSON.stringify(created)).not.toContain('BootstrapPass1!');
  });

  it('refuses inside the transaction if an account appeared first', async () => {
    // The count is re-checked inside the transaction, so a caller that passed the
    // outer isBootstrapAvailable check still cannot create a second "first" account.
    employee.count.mockResolvedValue(1);

    await expect(new EmployeeService().createFirstAdministrator(submitted)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(employee.create).not.toHaveBeenCalled();
  });

  it('fails loudly when the Administrator role row is missing', async () => {
    // Reachable only if the reference-data migrations have not been applied.
    // Silently falling back to another role would hand out the wrong authority.
    employee.count.mockResolvedValue(0);
    employeeRole.findUnique.mockResolvedValue(null);

    await expect(new EmployeeService().createFirstAdministrator(submitted)).rejects.toBeInstanceOf(AppError);
    expect(employee.create).not.toHaveBeenCalled();
  });
});
