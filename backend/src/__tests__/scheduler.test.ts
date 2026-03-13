import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scheduleMock = vi.fn();
const mockPrisma = {
  $transaction: vi.fn(),
};

vi.mock("../db", () => ({
  prisma: mockPrisma,
}));

vi.mock("node-cron", () => ({
  default: {
    schedule: scheduleMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  vi.resetModules();
});

describe("scheduler", () => {
  it("closes expired auctions, creates invoice data, and logs processed count", async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const txMock = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "auction-1",
          version: 4,
          state: "LIVE",
          seller_company_id: "seller-1",
          current_price: "100.00",
        },
      ]),
      bid: {
        findFirst: vi.fn().mockResolvedValue({
          id: "bid-1",
          companyId: "buyer-1",
          amount: "120.00",
        }),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      auctionStateTransition: {
        create: vi.fn().mockResolvedValue({
          id: "transition-1",
        }),
      },
      invoice: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "invoice-1",
        }),
      },
      paymentDeadline: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "deadline-1",
        }),
      },
    };

    mockPrisma.$transaction.mockImplementation(async (callback, options) => {
      expect(options).toEqual({
        isolationLevel: "Serializable",
      });

      return callback(txMock);
    });

    const { closeExpiredAuctions, setSchedulerLogger } = await import("../scheduler");

    await setSchedulerLogger(logger);
    await closeExpiredAuctions();

    expect(txMock.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        auctionId: "auction-1",
        buyerCompanyId: "buyer-1",
        sellerCompanyId: "seller-1",
        total: 120,
        currency: "AED",
      }),
    });
    expect(txMock.paymentDeadline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        auctionId: "auction-1",
        buyerCompanyId: "buyer-1",
      }),
    });
    expect(logger.info).toHaveBeenCalledWith(
      {
        job: "closeExpiredAuctions",
        processed: 1,
      },
      "Scheduler job completed",
    );
  });

  it("defaults overdue payment deadlines and writes an audit log", async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const txMock = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "deadline-1",
          auction_id: "auction-1",
          buyer_company_id: "buyer-1",
        },
      ]),
      auction: {
        findUnique: vi.fn().mockResolvedValue({
          id: "auction-1",
          state: "PAYMENT_PENDING",
          version: 7,
          winnerCompanyId: "buyer-1",
        }),
      },
      invoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: "invoice-1",
          status: "ISSUED",
        }),
        update: vi.fn().mockResolvedValue({
          id: "invoice-1",
        }),
      },
      paymentDeadline: {
        update: vi.fn().mockResolvedValue({
          id: "deadline-1",
        }),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      auctionStateTransition: {
        create: vi.fn().mockResolvedValue({
          id: "transition-1",
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({
          id: "audit-1",
        }),
      },
    };

    mockPrisma.$transaction.mockImplementation(async (callback, options) => {
      expect(options).toEqual({
        isolationLevel: "Serializable",
      });

      return callback(txMock);
    });

    const { enforcePaymentDeadlines, setSchedulerLogger } = await import("../scheduler");

    await setSchedulerLogger(logger);
    await enforcePaymentDeadlines();

    expect(txMock.paymentDeadline.update).toHaveBeenCalledWith({
      where: {
        id: "deadline-1",
      },
      data: {
        status: "DEFAULTED",
        escalatedFlag: true,
        resolvedAt: expect.any(Date),
      },
    });
    expect(txMock.invoice.update).toHaveBeenCalledWith({
      where: {
        id: "invoice-1",
      },
      data: {
        status: "DEFAULTED",
      },
    });
    expect(txMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "system:scheduler",
        action: "PAYMENT_DEADLINE_DEFAULTED",
        entityType: "PaymentDeadline",
        entityId: "deadline-1",
        payloadHash: expect.any(String),
      }),
    });
    expect(logger.info).toHaveBeenCalledWith(
      {
        job: "enforcePaymentDeadlines",
        processed: 1,
      },
      "Scheduler job completed",
    );
  });

  it("schedules both cron jobs only once and stops them cleanly", async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const taskA = {
      stop: vi.fn(),
      destroy: vi.fn(),
    };
    const taskB = {
      stop: vi.fn(),
      destroy: vi.fn(),
    };

    scheduleMock.mockReturnValueOnce(taskA).mockReturnValueOnce(taskB);

    const { setSchedulerLogger, startScheduler, stopScheduler } = await import("../scheduler");

    await setSchedulerLogger(logger);
    await startScheduler();
    await startScheduler();

    expect(scheduleMock).toHaveBeenCalledTimes(2);
    expect(scheduleMock).toHaveBeenNthCalledWith(1, "* * * * *", expect.any(Function));
    expect(scheduleMock).toHaveBeenNthCalledWith(2, "*/5 * * * *", expect.any(Function));

    await stopScheduler();

    expect(taskA.stop).toHaveBeenCalledOnce();
    expect(taskA.destroy).toHaveBeenCalledOnce();
    expect(taskB.stop).toHaveBeenCalledOnce();
    expect(taskB.destroy).toHaveBeenCalledOnce();
  });
});
