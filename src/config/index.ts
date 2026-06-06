import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("3000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().min(1),
  AI_PROVIDER: z.enum(["anthropic", "openai", "gemini"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  MAX_FILE_SIZE_MB: z.string().default("20"),
  ALLOWED_MIME_TYPES: z
    .string()
    .default("application/pdf,image/jpeg,image/png,image/webp,image/gif"),
  UPLOAD_DIR: z.string().default("uploads"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const config = {
  port: parseInt(parsed.data.PORT, 10),
  nodeEnv: parsed.data.NODE_ENV,
  database: {
    url: parsed.data.DATABASE_URL,
  },
  ai: {
    provider: parsed.data.AI_PROVIDER,
    anthropic: {
      apiKey: parsed.data.ANTHROPIC_API_KEY ?? "",
      model: parsed.data.ANTHROPIC_MODEL,
    },
    openai: {
      apiKey: parsed.data.OPENAI_API_KEY ?? "",
      model: parsed.data.OPENAI_MODEL,
    },
    gemini: {
      apiKey: parsed.data.GEMINI_API_KEY ?? "",
      model: parsed.data.GEMINI_MODEL,
    },
  },
  upload: {
    maxFileSizeBytes: parseInt(parsed.data.MAX_FILE_SIZE_MB, 10) * 1024 * 1024,
    allowedMimeTypes: parsed.data.ALLOWED_MIME_TYPES.split(","),
    dir: parsed.data.UPLOAD_DIR,
  },
};
