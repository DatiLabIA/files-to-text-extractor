import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ApiResponse } from "../types";
import { logger } from "../shared/logger";

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    const response: ApiResponse = {
      success: false,
      error: err.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", "),
    };

    res.status(400).json(response);
    return;
  }

  if (err instanceof AppError) {
    const response: ApiResponse = {
      success: false,
      error: err.message,
    };

    res.status(err.statusCode).json(response);
    return;
  }

  if (err instanceof Error && err.message.includes("Unsupported file type")) {
    res.status(415).json({
      success: false,
      error: err.message,
    });
    return;
  }

  if (err instanceof Error && err.message.includes("File too large")) {
    res.status(413).json({
      success: false,
      error: "File exceeds the maximum allowed size.",
    });
    return;
  }

  logger.error({
    msg: "Unhandled error",
    error:
      err instanceof Error
        ? {
            message: err.message,
            stack: err.stack,
          }
        : err,
  });

  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
}
