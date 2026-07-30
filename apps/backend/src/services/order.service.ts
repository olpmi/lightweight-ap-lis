import { prisma } from '../lib/prisma.js';
import { generateOrderId, nextSpecimenCode } from '../utils/idGenerator.js';
import { AppError } from '../middleware/error.middleware.js';
import { CreateOrderInput } from '@lis/shared';
import { DoctorService } from './doctor.service.js';
import { PatientService } from './patient.service.js';

const doctorService = new DoctorService();
const patientService = new PatientService();

const ORDER_INCLUDE = {
  patient: true,
  doctor: true,
  specimens: {
    include: {
      bodySite: true,
      specimenType: true,
    },
  },
  reports: {
    orderBy: { versionNumber: 'desc' as const },
    include: { pathologist: { include: { employeeRole: true } } },
  },
} as const;

export class OrderService {
  async create(data: CreateOrderInput): Promise<object> {
    // Resolve patient
    let patientId: string;
    if (data.patientId) {
      patientId = data.patientId;
      // Ensure the patient exists, and that it is the patient the caller meant.
      // Any demographics sent alongside the ID must agree with the stored
      // record, so a mistyped or stale identifier fails loudly instead of
      // filing this case against someone else.
      await patientService.assertDemographicsMatch(patientId, {
        lastName: data.patientLastName,
        firstName: data.patientFirstName,
        dateOfBirth: data.patientDateOfBirth,
        sex: data.patientSex,
      });
    } else {
      if (!data.patientLastName || !data.patientFirstName || !data.patientDateOfBirth || !data.patientSex) {
        throw new AppError(400, 'BAD_REQUEST', 'New patient requires lastName, firstName, dateOfBirth, and sex');
      }
      // Identifier comes from the sequence, so it is new by construction — no
      // lookup, and therefore no chance of merging into an existing record.
      const patient = await patientService.createWithGeneratedId({
        lastName: data.patientLastName,
        firstName: data.patientFirstName,
        dateOfBirth: data.patientDateOfBirth,
        sex: data.patientSex,
      });
      patientId = patient.patientId;
    }

    // Resolve doctor
    let doctorId: bigint;
    if (data.doctorId) {
      doctorId = BigInt(data.doctorId);
    } else {
      if (!data.doctorLastName || !data.doctorFirstName) {
        throw new AppError(400, 'BAD_REQUEST', 'New doctor requires lastName and firstName');
      }
      const doctor = await doctorService.findOrCreate({
        lastName: data.doctorLastName,
        firstName: data.doctorFirstName,
      });
      doctorId = doctor.doctorId;
    }

    // Generate order ID (CN prefix for Cytology, SU for Surgical Pathology)
    const orderId = await generateOrderId(data.caseType);

    // Create order + specimens in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.order.create({
        data: {
          orderId,
          patientId,
          doctorId,
          caseType: data.caseType,
          clinicalHistory: data.clinicalHistory,
          registeredDate: data.registeredDate ? new Date(data.registeredDate) : new Date(),
        },
      });

      // Create specimens with sequential codes
      const codes: string[] = [];
      for (const spec of data.specimens) {
        const code = nextSpecimenCode(codes);
        codes.push(code);
        await tx.specimen.create({
          data: {
            specimenId: `${orderId}-${code}`,
            orderId,
            specimenCode: code,
            bodySiteId: spec.bodySiteId,
            specimenTypeId: spec.specimenTypeId,
            coldIschemicTime: spec.coldIschemicTime,
          },
        });
      }
    });

    return prisma.order.findUniqueOrThrow({
      where: { orderId },
      include: ORDER_INCLUDE,
    });
  }

  async findById(orderId: string): Promise<object> {
    const order = await prisma.order.findUnique({
      where: { orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', `Order ${orderId} not found`);
    return order;
  }

  async list(page: number, pageSize: number): Promise<{ data: object[]; total: number; page: number; pageSize: number }> {
    const [data, total] = await Promise.all([
      prisma.order.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { registeredDate: 'desc' },
        include: { patient: true, doctor: true },
      }),
      prisma.order.count(),
    ]);
    return { data, total, page, pageSize };
  }

  async query(params: {
    orderId?: string;
    patientId?: string;
    page: number;
    pageSize: number;
  }): Promise<{ data: object[]; total: number; page: number; pageSize: number }> {
    const where = {
      ...(params.orderId ? { orderId: { contains: params.orderId, mode: 'insensitive' as const } } : {}),
      ...(params.patientId ? { patientId: { contains: params.patientId, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { registeredDate: 'desc' },
        include: {
          patient: true,
          doctor: true,
          reports: {
            where: { isFinal: true, signedOutDatetime: { not: null } },
            select: { reportId: true },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);
    const data = rows.map(({ reports, ...order }) => ({
      ...order,
      isSignedOut: reports.length > 0,
    }));
    return { data, total, page: params.page, pageSize: params.pageSize };
  }
}
