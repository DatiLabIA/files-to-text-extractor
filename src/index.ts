import "dotenv/config";
import express, { Application } from "express";
import { config } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import { extractRouter } from "./routes/extract";

const app: Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/extract", extractRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handler (must be last)
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port} [${config.nodeEnv}]`);
});

export default app;
