// Stand-in for the OrderStatus enum Prisma generates from the production schema.
export const OrderStatus = {
  DRAFT: "DRAFT",
  UPLOADED: "UPLOADED",
  UNDER_REVIEW: "UNDER_REVIEW",
  CLARIFICATION_REQUESTED: "CLARIFICATION_REQUESTED",
  QUOTED: "QUOTED",
  APPROVED: "APPROVED",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  TOKEN_PAID: "TOKEN_PAID",
  PAID: "PAID",
  PACKING: "PACKING",
  READY_FOR_PICKUP: "READY_FOR_PICKUP",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
