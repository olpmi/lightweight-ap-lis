import express from 'express';
import cors from 'cors';
import compression from 'compression';
import session from 'express-session';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger.js';
import { isDemoMode } from './lib/demoMode.js';
import { notFound, errorHandler } from './middleware/error.middleware.js';

// Route imports
import authRoutes from './routes/auth.routes.js';
import employeeRoutes from './routes/employee.routes.js';
import doctorRoutes from './routes/doctor.routes.js';
import patientRoutes from './routes/patient.routes.js';
import orderRoutes from './routes/order.routes.js';
import specimenRoutes from './routes/specimen.routes.js';
import blockRoutes from './routes/block.routes.js';
import reportRoutes from './routes/report.routes.js';
import fileRoutes from './routes/file.routes.js';
import lookupRoutes from './routes/lookup.routes.js';
import configRoutes from './routes/config.routes.js';
import configReportTemplateRoutes from './routes/config.reportTemplate.routes.js';
import { configReportLayoutRoutes } from './routes/config.reportLayout.routes.js';
import ancillaryRoutes from './routes/ancillary.routes.js';
import configAncillaryRoutes from './routes/config.ancillary.routes.js';
import configDataImportRoutes from './routes/config.dataImport.routes.js';
import { ReportService } from './services/report.service.js';
import { EmployeeService } from './services/employee.service.js';
import { validateBody } from './middleware/validate.middleware.js';
import { EMPLOYEE_ROLES, createDraftReportSchema, reactivateOrderSchema } from '@lis/shared';
import { requireAuth, requireCurrentRole } from './middleware/auth.middleware.js';

export function createApp(): express.Application {
  const app = express();

  // Serialize BigInt values as strings in all JSON responses
  app.set('json replacer', (_key: string, value: unknown) => {
    if (typeof value === 'bigint') return value.toString();
    return value;
  });

  // Trust the first reverse proxy (nginx in prod, the docker network in dev)
  // so that req.ip / X-Forwarded-For resolve to the real client. express-rate-limit
  // requires this to bucket attempts per-client instead of per-proxy.
  app.set('trust proxy', 1);

  // Security headers
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS - allow frontend dev origin
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
      credentials: true,
    })
  );

  // Compression
  app.use(compression());

  // Body parsing. Cap payload sizes so a single malicious request can't pin
  // memory; templates + report HTML can be a few hundred KB, so 2 MB is a
  // generous ceiling.
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // HTTP request logging
  app.use(
    pinoHttp({
      logger,
      customLogLevel: (_req, res) => (res.statusCode >= 500 ? 'error' : 'debug'),
    })
  );

  // Session
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET environment variable is required');
  }

  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        // Set COOKIE_SECURE=true only when the app is accessed over HTTPS.
        // When running behind an nginx reverse-proxy without TLS termination,
        // leave this false — browsers silently discard Secure cookies on HTTP.
        secure: process.env.COOKIE_SECURE === 'true',
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      },
    })
  );

  // Health check
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Deployment facts the client needs before anyone has logged in. Deliberately
  // unauthenticated: the login page is where a demo audience looks first, so the
  // demo-data notice has to render there too.
  //
  // `bootstrapAvailable` reports whether the employee table is still empty, which
  // is the only state in which self-registration is permitted. The login page uses
  // it to show the New employee flow on a fresh deployment and hide it afterwards,
  // rather than offering a form that would be rejected. It leaks only whether any
  // account exists, which an attempt to register would reveal anyway.
  const metaEmployeeService = new EmployeeService();
  app.get('/api/meta', async (_req, res, next) => {
    try {
      res.json({
        data: {
          demoMode: isDemoMode(),
          bootstrapAvailable: await metaEmployeeService.isBootstrapAvailable(),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/doctors', doctorRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/specimens', specimenRoutes);
  app.use('/api/blocks', blockRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/report-files', fileRoutes);
  app.use('/api/lookups', lookupRoutes);
  app.use('/api/config', configRoutes);
  app.use('/api/config/report-templates', configReportTemplateRoutes);
  app.use('/api/config/report-layouts', configReportLayoutRoutes);
  app.use('/api/config/ancillary', configAncillaryRoutes);
  app.use('/api/config/data-import', configDataImportRoutes);
  app.use('/api/ancillary', ancillaryRoutes);

  // Order-scoped report routes
  const reportService = new ReportService();

  app.get('/api/orders/:orderId/reports', requireAuth, async (req, res, next) => {
    try {
      const data = await reportService.getOrderReports(req.params.orderId);
      res.json({ data });
    } catch (err) { next(err); }
  });

  // Diagnostic authorship and amendment are pathologist acts: the draft carries the
  // diagnosis, and reactivation supersedes an already-signed-out final report.
  app.post('/api/orders/:orderId/reports/draft', requireAuth, requireCurrentRole(EMPLOYEE_ROLES.PATHOLOGIST), validateBody(createDraftReportSchema), async (req, res, next) => {
    try {
      const data = await reportService.createDraft(req.params.orderId, req.body, req.session.employeeId);
      res.status(201).json({ data });
    } catch (err) { next(err); }
  });

  app.post('/api/orders/:orderId/reactivate', requireAuth, requireCurrentRole(EMPLOYEE_ROLES.PATHOLOGIST), validateBody(reactivateOrderSchema), async (req, res, next) => {
    try {
      const data = await reportService.reactivate(req.params.orderId, req.body, req.session.employeeId);
      res.json({ data });
    } catch (err) { next(err); }
  });

  // 404 handler
  app.use(notFound);

  // Global error handler
  app.use(errorHandler);

  return app;
}
