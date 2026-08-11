import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { EmployeeService } from './employee.service.js';
import { CreateEmployeeInput } from '@lis/shared';
import bcrypt from 'bcryptjs';

const employeeService = new EmployeeService();

export interface LoginPayload {
  employeeId?: number;
  password?: string;
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
      // Self-registration is the bootstrap path only. Once any account exists
      // this closes, otherwise the login endpoint would remain an anonymous way
      // to mint an account of any role and every role guard would be moot.
      if (!(await employeeService.isBootstrapAvailable())) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'An account already exists. Ask an administrator to create your account.'
        );
      }
      employee = (await employeeService.createFirstAdministrator(payload.newEmployee)) as typeof employee;
    } else if (payload.employeeId != null) {
      if (process.env.NODE_ENV === 'production') {
        if (!payload.password) {
          throw new AppError(400, 'BAD_REQUEST', 'Password is required');
        }
      }
      employee = await prisma.employee.findUnique({
        where: { employeeId: BigInt(payload.employeeId) },
        include: { employeeRole: true },
      });
      if (!employee) {
        throw new AppError(401, 'UNAUTHORIZED', 'Invalid credentials');
      }
      if (process.env.NODE_ENV === 'production') {
        if (!employee.passwordHash) {
          throw new AppError(401, 'UNAUTHORIZED', 'Account has no password set — contact an administrator');
        }
        const valid = await bcrypt.compare(payload.password!, employee.passwordHash);
        if (!valid) {
          throw new AppError(401, 'UNAUTHORIZED', 'Invalid credentials');
        }
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
