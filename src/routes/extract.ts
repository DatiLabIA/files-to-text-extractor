import { Router, IRouter, Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { upload } from "../middleware/upload";
import { AppError } from "../middleware/errorHandler";
import { extractTextFromFile } from "../services/aiService";
import { getFileType, deleteFile } from "../services/fileService";
import { ApiResponse, ExtractionResult } from "../types";
import { config } from "../config";

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

      deleteFile(file.path);
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
