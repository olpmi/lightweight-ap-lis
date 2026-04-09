import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { EmployeeService } from './employee.service.js';
import { CreateEmployeeInput } from '@lis/shared';

const employeeService = new EmployeeService();

export interface LoginPayload {
  employeeId?: number;
  newEmployee?: CreateEmployeeInput;
}

export interface SessionEmployee {
  employeeId: number;
  userName: string;
  firstName: string;
  lastName: string;
  roleName: string;
  roleId: number;
  defaultLanguage: string;
}

export class AuthService {
  async login(payload: LoginPayload): Promise<SessionEmployee> {
    let employee: Awaited<ReturnType<typeof prisma.employee.findUnique>>;

    if (payload.newEmployee) {
      employee = (await employeeService.create(payload.newEmployee)) as typeof employee;
    } else if (payload.employeeId != null) {
      employee = await prisma.employee.findUnique({
        where: { employeeId: BigInt(payload.employeeId) },
        include: { employeeRole: true },
      });
      if (!employee) {
        throw new AppError(404, 'NOT_FOUND', `Employee ${payload.employeeId} not found`);
      }
    } else {
      throw new AppError(400, 'BAD_REQUEST', 'Must provide employeeId or newEmployee');
    }

    if (!employee) throw new AppError(500, 'INTERNAL_ERROR', 'Failed to resolve employee');

    const role = (employee as { employeeRole?: { roleName: string; employeeRoleId: number } }).employeeRole;
    if (!role) throw new AppError(500, 'INTERNAL_ERROR', 'Employee has no role');

    return {
      employeeId: Number(employee.employeeId),
      userName: employee.userName,
      firstName: employee.firstName,
      lastName: employee.lastName,
      roleName: role.roleName,
      roleId: role.employeeRoleId,
      defaultLanguage: employee.defaultLanguage ?? 'en',
    };
  }
}
