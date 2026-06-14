import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { RequestHandler } from "express";

export const extractRateLimiter: RequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60, // Limit each API key or IP to 60 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req): string => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }
    return ipKeyGenerator(req.ip ?? "unknown-ip");
  },
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: "Too many requests, please try again later.",
    });
  },
});
