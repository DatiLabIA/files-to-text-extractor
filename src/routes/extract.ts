import { Router, IRouter, Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { upload } from "../middleware/upload";
import { AppError } from "../middleware/errorHandler";
import { extractTextFromFile } from "../services/aiService";
import { getFileType, deleteFile } from "../services/fileService";
import { ApiResponse, ExtractionResult } from "../types";
import { config } from "../config";
import path from "path";
import fs from "fs";

const adapter = new PrismaPg({ connectionString: config.database.url });
const router: IRouter = Router();
const prisma = new PrismaClient({ adapter });

/**
 * POST /api/extract
 * Upload a PDF or image file and extract its text content via AI.
 * Multipart form-data field name: "file"
 */
router.post(
  "/",
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const file = req.file;
    const provider = req.body.provider as string | undefined;
    if (!file) {
      return next(
        new AppError(
          'No file uploaded. Send a file in the "file" form field.',
          400,
        ),
      );
    }

    if (
      provider !== undefined &&
      provider !== "anthropic" &&
      provider !== "gemini"
    ) {
      // Clean up uploaded file if provider check fails
      deleteFile(file.path);
      return next(
        new AppError(
          'Invalid provider. Allowed values: "anthropic" or "gemini".',
          400,
        ),
      );
    }

    const fileType = getFileType(file.mimetype);

    // Create DB record in PENDING state
    const extraction = await prisma.extraction.create({
      data: {
        fileName: file.filename,
        originalName: file.originalname,
        fileType,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        status: "PENDING",
      },
    });

    try {
      // Mark as PROCESSING
      await prisma.extraction.update({
        where: { id: extraction.id },
        data: { status: "PROCESSING" },
      });

      const result = await extractTextFromFile(
        file.path,
        file.mimetype,
        provider,
      );

      // Mark as COMPLETED
      const completed = await prisma.extraction.update({
        where: { id: extraction.id },
        data: {
          status: "COMPLETED",
          rawContent: result.content,
          aiProvider: result.provider,
          aiModel: result.model,
          processedAt: new Date(),
        },
      });

      deleteFile(file.path);

      const response: ApiResponse<ExtractionResult> = {
        success: true,
        data: completed as ExtractionResult,
      };

      res.status(200).json(response);
    } catch (err) {
      // Mark as FAILED
      await prisma.extraction.update({
        where: { id: extraction.id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        },
      });

      // NOTE: We DO NOT delete the file on failure here to allow for retries.
      next(err);
    }
  },
);

/**
 * GET /api/extract/:id
 * Retrieve a previously processed extraction by ID.
 */
type ExtractParams = {
  id: string;
};

router.get(
  "/:id",
  async (
    req: Request<ExtractParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { id } = req.params;

    const extraction = await prisma.extraction
      .findUnique({
        where: { id },
      })
      .catch((err: unknown) => next(err));

    if (!extraction) {
      return next(new AppError(`Extraction with id "${id}" not found.`, 404));
    }
    const response: ApiResponse<ExtractionResult> = {
      success: true,
      data: extraction as ExtractionResult,
    };
    res.json(response);
  },
);

/**
 * GET /api/extract/:id/text
 * Retrieve only the rawContent as plain text (Content-Type: text/plain).
 */
router.get(
  "/:id/text",
  async (
    req: Request<ExtractParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { id } = req.params;

    const extraction = await prisma.extraction
      .findUnique({
        where: { id },
      })
      .catch((err: unknown) => {
        next(err);
        return null;
      });

    if (!extraction) {
      return next(new AppError(`Extraction with id "${id}" not found.`, 404));
    }

    if (extraction.status !== "COMPLETED") {
      res.status(400);
      res.setHeader("Content-Type", "text/plain");
      res.send(
        `Extraction status is ${extraction.status}. Only COMPLETED extractions have text content.`,
      );
      return;
    }

    res.setHeader("Content-Type", "text/plain");
    res.send(extraction.rawContent ?? "");
  },
);

/**
 * DELETE /api/extract/:id
 * Delete an extraction record from the DB and ensure the temporary file is deleted.
 */
router.delete(
  "/:id",
  async (
    req: Request<ExtractParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { id } = req.params;

    const extraction = await prisma.extraction
      .findUnique({
        where: { id },
      })
      .catch((err: unknown) => {
        next(err);
        return null;
      });

    if (!extraction) {
      return next(new AppError(`Extraction with id "${id}" not found.`, 404));
    }

    // Verify that the file no longer exists or delete it
    const filePath = path.join(config.upload.dir, extraction.fileName);
    deleteFile(filePath);

    // Delete record from DB
    const deleted = await prisma.extraction.delete({
      where: { id },
    });

    const response: ApiResponse<ExtractionResult> = {
      success: true,
      data: deleted as ExtractionResult,
    };
    res.json(response);
  },
);

/**
 * POST /api/extract/:id/retry
 * Retry a failed extraction.
 */
router.post(
  "/:id/retry",
  async (
    req: Request<ExtractParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { id } = req.params;

    const extraction = await prisma.extraction
      .findUnique({
        where: { id },
      })
      .catch((err: unknown) => {
        next(err);
        return null;
      });

    if (!extraction) {
      return next(new AppError(`Extraction with id "${id}" not found.`, 404));
    }

    if (extraction.status !== "FAILED") {
      return next(
        new AppError(
          `Only failed extractions can be retried. Current status is ${extraction.status}.`,
          400,
        ),
      );
    }

    const filePath = path.join(config.upload.dir, extraction.fileName);
    if (!fs.existsSync(filePath)) {
      return next(
        new AppError(
          "The temporary file no longer exists. Please upload the file again.",
          400,
        ),
      );
    }

    try {
      // Return status to PENDING/PROCESSING
      await prisma.extraction.update({
        where: { id },
        data: { status: "PROCESSING", errorMessage: null },
      });

      // Retransmit/reprocess
      const result = await extractTextFromFile(
        filePath,
        extraction.mimeType,
        extraction.aiProvider as "anthropic" | "gemini" | undefined,
      );

      // Save success result
      const completed = await prisma.extraction.update({
        where: { id },
        data: {
          status: "COMPLETED",
          rawContent: result.content,
          aiProvider: result.provider,
          aiModel: result.model,
          processedAt: new Date(),
        },
      });

      // Success -> clean up file
      deleteFile(filePath);

      const response: ApiResponse<ExtractionResult> = {
        success: true,
        data: completed as ExtractionResult,
      };
      res.json(response);
    } catch (err) {
      // Re-mark as FAILED
      await prisma.extraction.update({
        where: { id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        },
      });

      next(err);
    }
  },
);

/**
 * GET /api/extract
 * List extractions with optional pagination.
 * Query params: page (default 1), limit (default 20)
 */
router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const page = Math.max(
      1,
      parseInt((req.query["page"] as string) ?? "1", 10),
    );
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query["limit"] as string) ?? "20", 10)),
    );
    const skip = (page - 1) * limit;

    const [items, total] = await prisma
      .$transaction([
        prisma.extraction.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            originalName: true,
            fileType: true,
            status: true,
            aiProvider: true,
            aiModel: true,
            processedAt: true,
            createdAt: true,
            fileSizeBytes: true,
          },
        }),
        prisma.extraction.count(),
      ])
      .catch((err: unknown) => {
        next(err);
        return [[], 0] as [never[], number];
      });

    res.json({
      success: true,
      data: items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  },
);

export { router as extractRouter };
