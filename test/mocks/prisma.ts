import { vi } from "vitest";

export const mockPrisma = {
  extraction: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn((promises) => Promise.all(promises)),
};

vi.mock("@prisma/client", () => {
  return {
    PrismaClient: vi.fn(function () {
      return mockPrisma;
    }),

    ExtractionStatus: {
      PENDING: "PENDING",
      PROCESSING: "PROCESSING",
      COMPLETED: "COMPLETED",
      FAILED: "FAILED",
    },

    FileType: {
      PDF: "PDF",
      IMAGE: "IMAGE",
    },
  };
});

vi.mock("@prisma/adapter-pg", () => {
  class MockPrismaPg {
    constructor(_: unknown) {}
  }

  return {
    PrismaPg: MockPrismaPg,
  };
});
