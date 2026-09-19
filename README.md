# Army Medicine Supplier

Production e-pharmacy and home-delivery platform for ECHS beneficiaries, ex-servicemen
and army families. A customer photographs a prescription, a registered pharmacist verifies
it and builds a quote, and the medicines are delivered to the door with cash on delivery.

**Live:** <https://armymedicinesupplier.in>

> This repository documents the system: architecture, data model, the order lifecycle and
> the engineering decisions behind them, with the order state machine included as real,
> runnable source. The full application source stays private — it is a live platform
> handling prescriptions, addresses and payments for real customers.

![Home](screenshots/home.png)

---

## What it does

| | |
|---|---|
| **Prescription intake** | Photo upload of prescription + ECHS card, stored on S3 with signed URLs |
| **Pharmacist review** | A registered pharmacist verifies the prescription, requests clarification, or rejects |
| **Quoting** | Line-item quote built against live inventory, priced before the customer commits |
| **Catalog checkout** | OTC / wellness / device carts skip review entirely and go straight to fulfilment |
| **Payments** | Razorpay online, token payment, or cash on delivery with carrier reconciliation |
| **Delivery** | Third-party carrier integration (Delhivery, Shadowfax, Porter) with webhook tracking |
| **Real-time** | Socket.IO chat between customer and pharmacist, plus live order tracking |
| **Notifications** | Transactional email (SES) and WhatsApp on every state change |
| **Storefront** | Bilingual (English / हिंदी), dark mode, and ~40 SEO landing routes |

---

## Architecture

```
                    ┌──────────────────────────────┐
  Browser ─────────▶│  Next.js 14 (App Router)     │
                    │  153 components · SSR + ISR  │
                    └──────────────┬───────────────┘
                                   │ REST (JWT in httpOnly cookie)
                                   ▼
                    ┌──────────────────────────────┐
                    │  NestJS 10 API               │
                    │  26 modules · 24 controllers │
                    │  159 routed endpoints        │
                    │  RolesGuard · JwtAuthGuard   │
                    └───┬─────┬─────┬─────┬────────┘
                        │     │     │     │
         ┌──────────────┘     │     │     └──────────────┐
         ▼                    ▼     ▼                    ▼
  ┌─────────────┐   ┌──────────────────┐   ┌──────────┐   ┌──────────┐
  │ PostgreSQL  │   │ Redis + BullMQ   │   │ AWS S3   │   │ Socket.IO│
  │ Prisma      │   │ background jobs  │   │ files    │   │ gateway  │
  │ 35 models   │   │ notifications    │   │          │   │ chat     │
  └─────────────┘   └──────────────────┘   └──────────┘   └──────────┘
         │
         └── Razorpay · Delhivery / Shadowfax / Porter · SES · WhatsApp · Sentry
```

A single npm workspace monorepo:

```
apps/
  api/          NestJS 10 · Prisma · 164 TypeScript files
    src/
      auth/       JWT auth, sessions, OTP, RolesGuard
      orders/     order service + the state machine below
      pharmacist/ review queue, approvals, quote building
      delivery/   carrier shipments and webhook ingestion
      modules/    catalog, cart, inventory, payments, quotes,
                  chat, reviews, notifications, files, users,
                  addresses, dependents, admin, settings
  web/          Next.js 14 App Router · 153 .tsx files
infra/          AWS CDK stack (IAM roles, HTTP API integrations, CloudWatch alarms)
```

---

## Roles

Five JWT-secured roles, enforced by a `RolesGuard` on top of `JwtAuthGuard`:

`CUSTOMER` · `PHARMACIST` · `ADMIN` · `SUPER_ADMIN` · `DELIVERY`

Each gets its own shell in the web app. The pharmacist and admin share a layout;
the delivery role sees only its assigned shipments.

---

## The order lifecycle

Fifteen states, and the only legal moves are the ones in the table. Anything else throws
`InvalidStateTransitionException`. The machine is pure and I/O-free, so it is fully unit
testable — see [`src/order-state-machine.ts`](src/order-state-machine.ts) and its
[spec](src/order-state-machine.spec.ts), both lifted unmodified from the production API.

```
DRAFT ──▶ UPLOADED ──▶ UNDER_REVIEW ──▶ QUOTED ──▶ APPROVED ──▶ PAYMENT_PENDING
  │                         │  ▲                       │              │
  │                         ▼  │                       │              ├─▶ TOKEN_PAID ─┐
  │            CLARIFICATION_REQUESTED                 │              └─▶ PAID ────────┤
  │                                                    │                               │
  └──────────────── (all-OTC cart) ────────────────────┘          (COD)                ▼
                                                                   └──────────────▶ PACKING
                                                                                       │
                                            DELIVERED ◀── OUT_FOR_DELIVERY ◀── READY_FOR_PICKUP

  Terminal: DELIVERED · CANCELLED · REJECTED     (REJECTED → UNDER_REVIEW is admin-only)
```

Three shortcuts in that graph are the interesting part:

- **`DRAFT → APPROVED`** — a catalog checkout whose cart is entirely OTC, wellness or device
  items has no prescription to verify, so it skips upload and review altogether.
- **`UNDER_REVIEW → APPROVED`** — a catalog order that *does* contain a prescription item is
  already priced by the catalog, so the pharmacist verifies and approves without building a quote.
- **`APPROVED → PACKING`** — cash on delivery skips the payment gate. The service layer
  enforces that this one is COD-only; the state machine alone would allow it for any order.

---

## Engineering notes

**Idempotency.** Payment and order-mutation endpoints take an idempotency key, persisted in
its own table, so a retried request from a flaky mobile connection cannot double-charge or
double-create.

**Audit trail.** Every status change writes an `OrderStatusHistory` row, and privileged
actions write to `AuditLog` with actor attribution. Money and prescription decisions are
answerable after the fact.

**COD reconciliation.** `PaymentMode` records what the customer chose; a separate channel
field records how the money actually arrived. A carrier collecting cash on our behalf is a
different fact from a customer paying cash at the door, and reconciliation turns on it.

**Background work.** Notifications, webhook processing and delivery polling run on BullMQ
queues rather than in the request path, so a slow carrier API never holds a customer's
request open.

**Error surface.** Sentry on both apps, plus an `ErrorLog` table for failures the platform
must be able to explain to a customer.

**SEO.** Around 40 static landing routes (`/echs-medicine-delivery`, `/military-hospitals`,
`/same-salt-medicines`, coverage areas, conditions, guides) with generated sitemaps,
OpenGraph images and structured data. The customers here search in plain language and in
Hindi; the routes are built for how they actually search.

---

## Stack

| Layer | Choice |
|---|---|
| Web | Next.js 14 (App Router), React, TypeScript, Tailwind |
| API | NestJS 10, TypeScript, Swagger |
| Data | PostgreSQL, Prisma 5 (35 models) |
| Cache / queues | Redis, BullMQ |
| Realtime | Socket.IO |
| Payments | Razorpay |
| Delivery | Delhivery · Shadowfax · Porter |
| Storage | AWS S3 (signed URLs) |
| Messaging | AWS SES, WhatsApp |
| Monitoring | Sentry |
| Infra | Docker Compose, AWS CDK, GitHub Actions CI |

CI typechecks both apps, runs the API unit tests, and builds both — on every push and PR.

---

## Screenshots

| How it works | Shop |
|---|---|
| ![How it works](screenshots/how-it-works.png) | ![Shop](screenshots/shop.png) |

---

## Status

Live and serving orders. Built and operated solo: product, architecture, both apps,
infrastructure, pharmacist licensing and compliance pages.

Independent pharmacy. Not affiliated with ECHS or the Ministry of Defence.

---

Built by [Shaurya Shakya](https://github.com/shaurya-8055) · [armymedicinesupplier.in](https://armymedicinesupplier.in)
