import { OrderStatus } from "@prisma/client";
import {
  ORDER_TRANSITIONS,
  assertTransition,
  canTransition,
  isTerminal,
} from "./order-state-machine";
import { InvalidStateTransitionException } from "../common/errors/app-exception";

describe("order state machine", () => {
  it("allows the documented happy-path transitions", () => {
    expect(canTransition(OrderStatus.DRAFT, OrderStatus.UPLOADED)).toBe(true);
    expect(canTransition(OrderStatus.UPLOADED, OrderStatus.UNDER_REVIEW)).toBe(true);
    expect(canTransition(OrderStatus.UNDER_REVIEW, OrderStatus.QUOTED)).toBe(true);
    expect(canTransition(OrderStatus.QUOTED, OrderStatus.APPROVED)).toBe(true);
    expect(canTransition(OrderStatus.APPROVED, OrderStatus.PAYMENT_PENDING)).toBe(true);
    expect(canTransition(OrderStatus.PAYMENT_PENDING, OrderStatus.PAID)).toBe(true);
    expect(canTransition(OrderStatus.PAID, OrderStatus.PACKING)).toBe(true);
    expect(canTransition(OrderStatus.PACKING, OrderStatus.READY_FOR_PICKUP)).toBe(true);
    expect(canTransition(OrderStatus.READY_FOR_PICKUP, OrderStatus.OUT_FOR_DELIVERY)).toBe(true);
    expect(canTransition(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED)).toBe(true);
  });

  it("allows COD to skip the payment gate (APPROVED -> PACKING)", () => {
    expect(canTransition(OrderStatus.APPROVED, OrderStatus.PACKING)).toBe(true);
  });

  it("allows a failed delivery attempt to re-queue", () => {
    expect(canTransition(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.READY_FOR_PICKUP)).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition(OrderStatus.UPLOADED, OrderStatus.DELIVERED)).toBe(false);
    expect(canTransition(OrderStatus.DRAFT, OrderStatus.PAID)).toBe(false);
    expect(canTransition(OrderStatus.QUOTED, OrderStatus.OUT_FOR_DELIVERY)).toBe(false);
  });

  it("treats DELIVERED / REJECTED / CANCELLED as terminal", () => {
    for (const s of [OrderStatus.DELIVERED, OrderStatus.REJECTED, OrderStatus.CANCELLED]) {
      expect(isTerminal(s)).toBe(true);
    }
    expect(ORDER_TRANSITIONS[OrderStatus.DELIVERED]).toHaveLength(0);
    expect(ORDER_TRANSITIONS[OrderStatus.CANCELLED]).toHaveLength(0);
  });

  it("allows an admin to revoke a rejection (REJECTED -> UNDER_REVIEW only)", () => {
    expect(canTransition(OrderStatus.REJECTED, OrderStatus.UNDER_REVIEW)).toBe(true);
    expect(ORDER_TRANSITIONS[OrderStatus.REJECTED]).toEqual([OrderStatus.UNDER_REVIEW]);
  });

  it("never allows leaving a terminal state", () => {
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.PACKING)).toBe(false);
    expect(canTransition(OrderStatus.CANCELLED, OrderStatus.UPLOADED)).toBe(false);
    expect(canTransition(OrderStatus.REJECTED, OrderStatus.QUOTED)).toBe(false);
  });

  it("assertTransition throws on an illegal move", () => {
    expect(() =>
      assertTransition(OrderStatus.DELIVERED, OrderStatus.PACKING),
    ).toThrow(InvalidStateTransitionException);
  });

  it("assertTransition is a no-op on a legal move", () => {
    expect(() =>
      assertTransition(OrderStatus.QUOTED, OrderStatus.APPROVED),
    ).not.toThrow();
  });

  it("every OrderStatus has a transition entry", () => {
    for (const status of Object.values(OrderStatus)) {
      expect(ORDER_TRANSITIONS[status as OrderStatus]).toBeDefined();
    }
  });
});
