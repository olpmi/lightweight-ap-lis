import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';

// Lease length and heartbeat cadence. The client heartbeats more frequently
// than the lease so a brief network blip doesn't drop the lock.
export const LOCK_LEASE_MS = 5 * 60 * 1000; // 5 minutes
export const LOCK_HEARTBEAT_MS = 60 * 1000; // 60 seconds

export interface OrderLockState {
  orderId: string;
  editingEmployeeId: number | null;
  editingEmployeeName: string | null;
  editingExpiresAt: string | null;
  // True when the requester owns the lock after this call.
  ownedByRequester: boolean;
}

function toState(
  orderId: string,
  row: { editingEmployeeId: bigint | null; editingEmployeeName: string | null; editingExpiresAt: Date | null },
  requesterId: number,
): OrderLockState {
  const holderId = row.editingEmployeeId != null ? Number(row.editingEmployeeId) : null;
  return {
    orderId,
    editingEmployeeId: holderId,
    editingEmployeeName: row.editingEmployeeName,
    editingExpiresAt: row.editingExpiresAt ? row.editingExpiresAt.toISOString() : null,
    ownedByRequester: holderId === requesterId,
  };
}

export class OrderLockService {
  /**
   * Acquire or refresh the edit lock for the given order. The lock can be
   * claimed when (a) it is unheld, (b) it is held by the same user (refresh),
   * or (c) the previous holder's lease has expired. Otherwise this throws
   * 409 LOCKED with the current holder's identity.
   *
   * Implemented as an atomic conditional UPDATE: a single SQL statement
   * filters on the same conditions and returns 0 rows when the lock is held
   * by another live user, which the caller turns into 409.
   */
  async acquire(orderId: string, employeeId: number, employeeName: string): Promise<OrderLockState> {
    const order = await prisma.order.findUnique({
      where: { orderId },
      select: {
        orderId: true,
        editingEmployeeId: true,
        editingEmployeeName: true,
        editingExpiresAt: true,
      },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', `Order ${orderId} not found`);

    const now = new Date();
    const newExpiry = new Date(now.getTime() + LOCK_LEASE_MS);
    const requesterIdBig = BigInt(employeeId);

    // updateMany returns { count }, lets us use compound WHERE conditions
    // and avoid the "record not found" trap of update().
    const updated = await prisma.order.updateMany({
      where: {
        orderId,
        OR: [
          { editingEmployeeId: null },
          { editingEmployeeId: requesterIdBig },
          { editingExpiresAt: null },
          { editingExpiresAt: { lt: now } },
        ],
      },
      data: {
        editingEmployeeId: requesterIdBig,
        editingEmployeeName: employeeName,
        editingExpiresAt: newExpiry,
      },
    });

    if (updated.count === 0) {
      // Lock is held by someone else and not yet expired. Re-read so we can
      // tell the caller who is holding it.
      const current = await prisma.order.findUnique({
        where: { orderId },
        select: {
          editingEmployeeId: true,
          editingEmployeeName: true,
          editingExpiresAt: true,
        },
      });
      throw new AppError(409, 'LOCKED', 'This case is being edited by another user', {
        editingEmployeeId: current?.editingEmployeeId != null ? Number(current.editingEmployeeId) : null,
        editingEmployeeName: current?.editingEmployeeName ?? null,
        editingExpiresAt: current?.editingExpiresAt ? current.editingExpiresAt.toISOString() : null,
      });
    }

    return toState(orderId, {
      editingEmployeeId: requesterIdBig,
      editingEmployeeName: employeeName,
      editingExpiresAt: newExpiry,
    }, employeeId);
  }

  /**
   * Release the lock if the requester is the current holder. If the lock has
   * already expired or been taken over, this is a no-op so client unmounts
   * never raise spurious errors.
   */
  async release(orderId: string, employeeId: number): Promise<void> {
    await prisma.order.updateMany({
      where: { orderId, editingEmployeeId: BigInt(employeeId) },
      data: {
        editingEmployeeId: null,
        editingEmployeeName: null,
        editingExpiresAt: null,
      },
    });
  }

  /**
   * Read-only snapshot of the lock state, including whether the lease has
   * expired. Used so other clients can decide whether to render a banner.
   */
  async getState(orderId: string, employeeId: number): Promise<OrderLockState> {
    const order = await prisma.order.findUnique({
      where: { orderId },
      select: {
        orderId: true,
        editingEmployeeId: true,
        editingEmployeeName: true,
        editingExpiresAt: true,
      },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', `Order ${orderId} not found`);

    // Treat an expired lease as released — caller will see no holder and the
    // form will be editable.
    const now = new Date();
    if (order.editingExpiresAt && order.editingExpiresAt < now) {
      return toState(orderId, {
        editingEmployeeId: null,
        editingEmployeeName: null,
        editingExpiresAt: null,
      }, employeeId);
    }

    return toState(orderId, order, employeeId);
  }

  /**
   * Verify that the given employee currently holds the lock. Used by mutating
   * endpoints (signOut/signPrelim/createDraft) as a defense-in-depth check on
   * top of the existing optimistic-locking guards. Throws 409 LOCKED otherwise.
   *
   * Returns silently when no lock is held at all (legacy clients without the
   * lock hook still work; they only have the optimistic-locking protection).
   */
  async assertHolder(
    tx: Prisma.TransactionClient | typeof prisma,
    orderId: string,
    employeeId: number,
  ): Promise<void> {
    const order = await tx.order.findUnique({
      where: { orderId },
      select: {
        editingEmployeeId: true,
        editingEmployeeName: true,
        editingExpiresAt: true,
      },
    });
    if (!order) return; // surfaces as 404 elsewhere

    const now = new Date();
    const expired = order.editingExpiresAt != null && order.editingExpiresAt < now;
    if (order.editingEmployeeId == null || expired) return;

    if (Number(order.editingEmployeeId) !== employeeId) {
      throw new AppError(409, 'LOCKED', 'This case is being edited by another user', {
        editingEmployeeId: Number(order.editingEmployeeId),
        editingEmployeeName: order.editingEmployeeName,
        editingExpiresAt: order.editingExpiresAt ? order.editingExpiresAt.toISOString() : null,
      });
    }
  }
}
