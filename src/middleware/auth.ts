import { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { AppError } from "./errorHandler";

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(
      new AppError(
        "Unauthorized: Missing or invalid Authorization header",
        401,
      ),
    );
  }

  const token = authHeader.substring(7);

  if (token !== config.security.authToken) {
    return next(new AppError("Unauthorized: Invalid API Key", 401));
  }

  next();
}
