// Extend express-session to include employee identity
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    employeeId: number;
    employeeUserName: string;
    employeeRole: string;
  }
}
