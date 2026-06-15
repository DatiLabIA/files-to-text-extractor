import "../mocks/prisma";
import "../mocks/aiService";
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/index";
import { mockPrisma } from "../mocks/prisma";
import { extractTextFromFile } from "../../src/services/aiService";
import path from "path";

// Mock del rate limiter para evitar bloqueos durante los tests
vi.mock("../../src/middleware/rateLimiter", () => {
  return {
    extractRateLimiter: (req: any, res: any, next: any) => next(),
  };
});

// Mock fs para simular lectura y existencia de archivos en endpoint retry y multer
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    unlinkSync: vi.fn(),
  };
});

describe("Integration Tests - Extract Endpoints", () => {
  const authToken = process.env.AUTH_TOKEN || "test-auth-token";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /health", () => {
    it("should return 200 OK without authorization header", async () => {
      const response = await request(app).get("/health");
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
    });
  });

  describe("POST /api/extract", () => {
    it("should extract successfully with a PDF file", async () => {
      const mockDbExtraction = {
        id: "extraction-id-123",
        fileName: "test.pdf",
        originalName: "test.pdf",
        fileType: "PDF",
        mimeType: "application/pdf",
        fileSizeBytes: 100,
        status: "COMPLETED",
        rawContent: "Texto extraído de prueba (mock)",
        aiProvider: "anthropic",
        aiModel: "claude-haiku-4-5",
        processedAt: new Date().toISOString(),
      };

      mockPrisma.extraction.create.mockResolvedValue(mockDbExtraction);
      mockPrisma.extraction.update.mockResolvedValue(mockDbExtraction);

      const response = await request(app)
        .post("/api/extract")
        .set("Authorization", `Bearer ${authToken}`)
        .attach("file", Buffer.from("dummy pdf content"), "test.pdf");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.rawContent).toBe(
        "Texto extraído de prueba (mock)",
      );
      expect(mockPrisma.extraction.create).toHaveBeenCalled();
    });

    it("should extract successfully with an image file", async () => {
      const mockDbExtraction = {
        id: "extraction-id-456",
        fileName: "test.png",
        originalName: "test.png",
        fileType: "IMAGE",
        mimeType: "image/png",
        fileSizeBytes: 200,
        status: "COMPLETED",
        rawContent: "Texto extraído de prueba (mock)",
        aiProvider: "anthropic",
        aiModel: "claude-haiku-4-5",
        processedAt: new Date().toISOString(),
      };

      mockPrisma.extraction.create.mockResolvedValue(mockDbExtraction);
      mockPrisma.extraction.update.mockResolvedValue(mockDbExtraction);

      const response = await request(app)
        .post("/api/extract")
        .set("Authorization", `Bearer ${authToken}`)
        .attach("file", Buffer.from("dummy image content"), "test.png");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.fileType).toBe("IMAGE");
    });

    it("should return 400 when no file is uploaded", async () => {
      const response = await request(app)
        .post("/api/extract")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("No file uploaded");
    });

    it("should return 415 when file type is not allowed", async () => {
      const response = await request(app)
        .post("/api/extract")
        .set("Authorization", `Bearer ${authToken}`)
        .attach("file", Buffer.from("dummy txt content"), "test.txt");

      expect(response.status).toBe(415);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Unsupported file type");
    });
  });

  describe("GET /api/extract/:id", () => {
    it("should return extraction if found", async () => {
      const mockDbExtraction = {
        id: "extraction-id-123",
        originalName: "test.pdf",
        status: "COMPLETED",
        rawContent: "Texto extraído",
      };

      mockPrisma.extraction.findUnique.mockResolvedValue(mockDbExtraction);

      const response = await request(app)
        .get("/api/extract/extraction-id-123")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe("extraction-id-123");
    });

    it("should return 404 if extraction is not found", async () => {
      mockPrisma.extraction.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .get("/api/extract/non-existent-id")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe("GET /api/extract (list pagination)", () => {
    it("should return list of extractions with metadata", async () => {
      const mockItems = [
        { id: "1", originalName: "doc1.pdf", status: "COMPLETED" },
        { id: "2", originalName: "doc2.jpg", status: "FAILED" },
      ];

      mockPrisma.extraction.findMany.mockResolvedValue(mockItems);
      mockPrisma.extraction.count.mockResolvedValue(10);

      const response = await request(app)
        .get("/api/extract?page=2&limit=2")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toEqual({
        total: 10,
        page: 2,
        limit: 2,
        totalPages: 5,
      });
    });
  });
});
