import { ExtractionStatus, FileType } from "@prisma/client";

export { ExtractionStatus, FileType };

export interface ExtractionResult {
  id: string;
  fileName: string;
  originalName: string;
  fileType: FileType;
  status: ExtractionStatus;
  rawContent: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  processedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface ExtractRequestBody {
  // reserved for future per-request options
  provider?: "anthropic" | "gemini";
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AIExtractionResult {
  content: string;
  provider: string;
  model: string;
}
