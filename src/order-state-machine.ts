import { OrderStatus } from "@prisma/client";
import { InvalidStateTransitionException } from "../common/errors/app-exception";

/**
 * Canonical order lifecycle. The only legal moves are listed here; anything else
 * throws. Pure and I/O-free so it is 100% unit-testable. See BACKEND_ARCHITECTURE
 * §3 for the rationale behind each transition.
 *
 * Note: APPROVED -> PACKING is only valid for COD orders (the payment gate is
 * skipped). The service layer enforces that extra guard.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  // DRAFT -> APPROVED is engine-driven only: a CATALOG checkout whose cart is
  // 100% OTC/WELLNESS/DEVICE (no prescription item) skips prescription upload
  // and pharmacist review entirely — see CartService.checkout.
  DRAFT: ["UPLOADED", "APPROVED", "CANCELLED"],
  UPLOADED: ["UNDER_REVIEW", "CANCELLED", "REJECTED"],
  // UNDER_REVIEW -> APPROVED (no QUOTED step) is for CATALOG orders that
  // contain a prescription item: the price is already fixed by the product
  // catalog, so the pharmacist verifies the prescription and approves
  // directly instead of building a Quote. See PharmacistService.approveCatalogOrder.
  UNDER_REVIEW: ["CLARIFICATION_REQUESTED", "QUOTED", "APPROVED", "REJECTED", "CANCELLED"],
  CLARIFICATION_REQUESTED: ["UNDER_REVIEW", "CANCELLED", "REJECTED"],
  QUOTED: ["APPROVED", "CLARIFICATION_REQUESTED", "CANCELLED", "REJECTED"],
  APPROVED: ["PAYMENT_PENDING", "PACKING", "CANCELLED"],
  PAYMENT_PENDING: ["TOKEN_PAID", "PAID", "APPROVED", "CANCELLED"],
  TOKEN_PAID: ["PACKING", "CANCELLED"],
  PAID: ["PACKING", "CANCELLED"],
  PACKING: ["READY_FOR_PICKUP", "CANCELLED"],
  READY_FOR_PICKUP: ["OUT_FOR_DELIVERY", "CANCELLED"],
  // CANCELLED here = the courier brought the parcel back (RTO).
  OUT_FOR_DELIVERY: ["DELIVERED", "READY_FOR_PICKUP", "CANCELLED"],
  DELIVERED: [],
  // An accidental pharmacist rejection can be revoked by an admin, putting the
  // order back into the review queue. This is the only way out of REJECTED.
  REJECTED: ["UNDER_REVIEW"],
  CANCELLED: [],
};

const TERMINAL: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.DELIVERED,
  OrderStatus.REJECTED,
  OrderStatus.CANCELLED,
]);

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionException(from, to);
  }
}

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL.has(status);
}
