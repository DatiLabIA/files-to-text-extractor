import "../mocks/prisma";
import "../mocks/aiService";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../../src/index";
import { mockPrisma } from "../mocks/prisma";
import { logger } from "../../src/shared/logger";

vi.mock("../../src/middleware/rateLimiter", () => {
  return {
    extractRateLimiter: (req: any, res: any, next: any) => next(),
  };
});

describe("Integration Tests - Structured Logging", () => {
  const authToken = process.env.AUTH_TOKEN || "test-auth-token";
  let loggerInfoSpy: any;
  let loggerErrorSpy: any;
  let loggerWarnSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerInfoSpy = vi.spyOn(logger, "info");
    loggerErrorSpy = vi.spyOn(logger, "error");
    loggerWarnSpy = vi.spyOn(logger, "warn");
  });

  afterEach(() => {
    loggerInfoSpy.mockRestore();
    loggerErrorSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  it("should log structured data on successful extraction request", async () => {
    const mockDbExtraction = {
      id: "extraction-id-123",
      fileName: "test.pdf",
      originalName: "formula_paciente.pdf",
      fileType: "PDF",
      mimeType: "application/pdf",
      fileSizeBytes: 245000,
      status: "COMPLETED",
      rawContent: "Texto extraído",
      aiProvider: "anthropic",
      aiModel: "claude-haiku-4-5",
      processedAt: new Date().toISOString(),
    };

    mockPrisma.extraction.create.mockResolvedValue(mockDbExtraction);
    mockPrisma.extraction.update.mockResolvedValue(mockDbExtraction);

    const response = await request(app)
      .post("/api/extract")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", Buffer.from("dummy pdf content"), "formula_paciente.pdf");

    expect(response.status).toBe(200);

    // Verify logger.info was called with the structured format
    const logCall = loggerInfoSpy.mock.calls.find(
      (call: any) => call[0] && call[0].extractionId === "extraction-id-123",
    );
    expect(logCall).toBeDefined();
    expect(logCall[0]).toMatchObject({
      extractionId: "extraction-id-123",
      originalName: "formula_paciente.pdf",
      fileType: "PDF",
      fileSizeBytes: 245000,
      aiProvider: "anthropic",
      aiModel: "claude-haiku-4-5",
      status: "COMPLETED",
    });
    expect(logCall[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(logCall[0].clientIp).toBeDefined();

    // Ensure rawContent is NOT present in any logged object for privacy
    expect(logCall[0].rawContent).toBeUndefined();
  });

  it("should log structured error data on failed extraction request", async () => {
    const mockDbExtraction = {
      id: "extraction-id-error",
      fileName: "test.pdf",
      originalName: "failed_paciente.pdf",
      fileType: "PDF",
      mimeType: "application/pdf",
      fileSizeBytes: 12345,
      status: "PENDING",
    };

    mockPrisma.extraction.create.mockResolvedValue(mockDbExtraction);
    mockPrisma.extraction.update.mockImplementation(
      async ({ where, data }: any) => {
        if (data.status === "FAILED") {
          return {
            ...mockDbExtraction,
            status: "FAILED",
            errorMessage: "AI Provider Error",
          };
        }
        return mockDbExtraction;
      },
    );

    // Mock extractTextFromFile to throw error
    const { extractTextFromFile } =
      await import("../../src/services/aiService");
    vi.mocked(extractTextFromFile).mockRejectedValueOnce(
      new Error("AI Provider Error"),
    );

    const response = await request(app)
      .post("/api/extract")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", Buffer.from("dummy pdf content"), "failed_paciente.pdf");

    expect(response.status).toBe(500);

    // Verify logger.error was called with the structured format
    const logCall = loggerErrorSpy.mock.calls.find(
      (call: any) => call[0] && call[0].extractionId === "extraction-id-error",
    );
    expect(logCall).toBeDefined();
    expect(logCall[0]).toMatchObject({
      extractionId: "extraction-id-error",
      originalName: "failed_paciente.pdf",
      fileType: "PDF",
      fileSizeBytes: 12345,
      status: "FAILED",
      errorMessage: "AI Provider Error",
    });
  });
});
