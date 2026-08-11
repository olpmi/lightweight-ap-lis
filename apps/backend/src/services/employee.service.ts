import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { CreateEmployeeInput, AppLanguageCode, EMPLOYEE_ROLES, type EmployeeRoleName } from '@lis/shared';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

/** The subset of the Prisma client this service uses, so it works on `prisma` or a transaction. */
type PrismaLike = Pick<typeof prisma, 'employee' | 'employeeRole'>;

export class EmployeeService {
  /**
   * Account lookup for the login page, which runs before a session exists.
   *
   * Selected rather than `include`d: this is the one unauthenticated read of the
   * staff table, so it returns only what login needs to identify an account. The
   * role is deliberately withheld — knowing who the pathologists are is a head
   * start on choosing whom to attack.
   */
  async search(query: string): Promise<object[]> {
    return prisma.employee.findMany({
      where: {
        OR: [
          { userName: { contains: query, mode: 'insensitive' } },
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { employeeId: true, userName: true, firstName: true, lastName: true },
      take: 20,
    });
  }

  /**
   * The role held right now, per the database rather than any session copy.
   *
   * Accepts `undefined` so callers can pass `req.session.employeeId` directly:
   * no session means no role, which every caller already treats as a denial.
   */
  async findRoleName(employeeId: number | undefined): Promise<string | undefined> {
    if (employeeId == null) return undefined;
    const emp = await prisma.employee.findUnique({
      where: { employeeId: BigInt(employeeId) },
      select: { employeeRole: { select: { roleName: true } } },
    });
    return emp?.employeeRole?.roleName;
  }

  async findById(employeeId: number): Promise<object> {
    const emp = await prisma.employee.findUnique({
      where: { employeeId: BigInt(employeeId) },
      include: { employeeRole: true },
    });
    if (!emp) throw new AppError(404, 'NOT_FOUND', `Employee ${employeeId} not found`);
    return emp;
  }

  async create(data: CreateEmployeeInput): Promise<object> {
    return this.createWithin(prisma, data);
  }

  /** Shared by `create` and the bootstrap path, which needs it inside a transaction. */
  private async createWithin(client: PrismaLike, data: CreateEmployeeInput): Promise<object> {
    const existing = await client.employee.findUnique({ where: { userName: data.userName } });
    if (existing) {
      throw new AppError(409, 'CONFLICT', `Username '${data.userName}' is already taken`);
    }

    if (data.employeeRoleId == null) {
      throw new AppError(400, 'BAD_REQUEST', 'Employee role is required');
    }

    const role = await client.employeeRole.findUnique({ where: { employeeRoleId: data.employeeRoleId } });
    if (!role) throw new AppError(400, 'BAD_REQUEST', `Employee role ${data.employeeRoleId} not found`);

    // Hash the password when provided; omit in dev/demo where password auth is skipped.
    const passwordHash = data.password ? await bcrypt.hash(data.password, BCRYPT_ROUNDS) : undefined;

    return client.employee.create({
      data: {
        lastName: data.lastName,
        firstName: data.firstName,
        userName: data.userName,
        employeeRoleId: data.employeeRoleId,
        defaultLanguage: data.defaultLanguage ?? 'en',
        ...(passwordHash ? { passwordHash } : {}),
      },
      include: { employeeRole: true },
    });
  }

  async updateLanguage(employeeId: number, language: AppLanguageCode): Promise<object> {
    const emp = await prisma.employee.findUnique({ where: { employeeId: BigInt(employeeId) } });
    if (!emp) throw new AppError(404, 'NOT_FOUND', `Employee ${employeeId} not found`);

    return prisma.employee.update({
      where: { employeeId: BigInt(employeeId) },
      data: { defaultLanguage: language },
      include: { employeeRole: true },
    });
  }

  /**
   * True while no account exists — the only state in which an unauthenticated
   * caller may create one.
   *
   * A fresh production database holds reference lookup data and no staff, so
   * there has to be some way in. Restricting that to an empty table means the
   * opening closes permanently the moment the first account is made.
   */
  async isBootstrapAvailable(): Promise<boolean> {
    return (await prisma.employee.count()) === 0;
  }

  /**
   * Creates the first account and forces it to Administrator, whatever role the
   * caller asked for.
   *
   * The role is forced rather than validated because the caller is anonymous:
   * honouring a submitted `employeeRoleId` here would let the bootstrap request
   * mint a Pathologist, which is the escalation this guard exists to prevent.
   *
   * The count and the insert run in one transaction. Under Postgres's default
   * read-committed isolation two simultaneous first requests could still both
   * observe an empty table; the window is the few milliseconds of initial setup
   * on a fresh deployment, and the outcome is a second administrator rather than
   * a privilege escalation.
   */
  async createFirstAdministrator(data: CreateEmployeeInput): Promise<object> {
    return prisma.$transaction(async (tx) => {
      if ((await tx.employee.count()) > 0) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'An account already exists. Ask an administrator to create your account.'
        );
      }

      const role = await tx.employeeRole.findUnique({
        where: { roleName: EMPLOYEE_ROLES.ADMINISTRATOR },
      });
      if (!role) {
        throw new AppError(
          500,
          'INTERNAL_ERROR',
          'The Administrator role is missing. Run database migrations before creating the first account.'
        );
      }

      return this.createWithin(tx, { ...data, employeeRoleId: role.employeeRoleId });
    });
  }

  async updateRole(employeeId: number, roleName: EmployeeRoleName): Promise<object> {
    const emp = await prisma.employee.findUnique({ where: { employeeId: BigInt(employeeId) } });
    if (!emp) throw new AppError(404, 'NOT_FOUND', `Employee ${employeeId} not found`);

    const role = await prisma.employeeRole.findUnique({ where: { roleName } });
    if (!role) throw new AppError(400, 'BAD_REQUEST', `Employee role '${roleName}' not found`);

    return prisma.employee.update({
      where: { employeeId: BigInt(employeeId) },
      data: { employeeRoleId: role.employeeRoleId },
      include: { employeeRole: true },
    });
  }
}
