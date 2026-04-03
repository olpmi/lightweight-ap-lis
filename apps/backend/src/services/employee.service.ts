import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import { CreateEmployeeInput } from '@lis/shared';

export class EmployeeService {
  async search(query: string): Promise<object[]> {
    return prisma.employee.findMany({
      where: {
        OR: [
          { userName: { contains: query, mode: 'insensitive' } },
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { employeeRole: true },
      take: 20,
    });
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
    const existing = await prisma.employee.findUnique({ where: { userName: data.userName } });
    if (existing) {
      throw new AppError(409, 'CONFLICT', `Username '${data.userName}' is already taken`);
    }

    const role = await prisma.employeeRole.findUnique({ where: { employeeRoleId: data.employeeRoleId } });
    if (!role) throw new AppError(400, 'BAD_REQUEST', `Employee role ${data.employeeRoleId} not found`);

    return prisma.employee.create({
      data: {
        lastName: data.lastName,
        firstName: data.firstName,
        userName: data.userName,
        employeeRoleId: data.employeeRoleId,
      },
      include: { employeeRole: true },
    });
  }
}
