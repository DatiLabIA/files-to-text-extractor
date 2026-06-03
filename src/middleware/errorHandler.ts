import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ApiResponse } from "../types";

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
    const response: ApiResponse = { success: false, error: err.message };
    res.status(err.statusCode).json(response);
    return;
  }

  if (err instanceof Error && err.message.includes("Unsupported file type")) {
    const response: ApiResponse = { success: false, error: err.message };
    res.status(415).json(response);
    return;
  }

  if (err instanceof Error && err.message.includes("File too large")) {
    const response: ApiResponse = {
      success: false,
      error: `File exceeds the maximum allowed size.`,
    };
    res.status(413).json(response);
    return;
  }

  console.error("Unhandled error:", err);
  const response: ApiResponse = {
    success: false,
    error: "Internal server error",
  };
  res.status(500).json(response);
}
