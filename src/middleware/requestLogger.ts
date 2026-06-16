import { Request, Response, NextFunction } from "express";
import { logger } from "../shared/logger";

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startTime = Date.now();
  const clientIp =
    (req.headers["x-forwarded-for"] as string) ||
    req.socket.remoteAddress ||
    req.ip ||
    "";

  logger.info({
    msg: `Request started: ${req.method} ${req.originalUrl}`,
    method: req.method,
    url: req.originalUrl,
    clientIp,
  });

  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    logger.info({
      msg: `Request finished: ${req.method} ${req.originalUrl}`,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      clientIp,
    });
  });

  next();
}
