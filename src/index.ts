import "dotenv/config";
import express, { Application } from "express";
import { config } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import { extractRouter } from "./routes/extract";
import { authMiddleware } from "./middleware/auth";
import { extractRateLimiter } from "./middleware/rateLimiter";
import { requestLogger } from "./middleware/requestLogger";
import { logger } from "./shared/logger";

const app: Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global Request Logger
app.use(requestLogger);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Protect all routes below this line
app.use(authMiddleware);

// Routes
app.use("/api/extract", extractRateLimiter, extractRouter);

// Error handler (must be last)
app.use(errorHandler);

if (config.nodeEnv !== "test") {
  app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} [${config.nodeEnv}]`);
  });
}

export default app;
