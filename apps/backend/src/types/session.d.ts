// Extend express-session to include employee identity
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    employeeId: number;
    employeeUserName: string;
    employeeRole: string;
    employeeDefaultLanguage: string;
    /** Minted at login; state-changing requests must echo it (csrf.middleware.ts). */
    csrfToken?: string;
  }
}
