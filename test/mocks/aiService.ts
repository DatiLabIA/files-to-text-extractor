import { vi } from "vitest";

vi.mock("../../src/services/aiService", () => {
  return {
    extractTextFromFile: vi.fn().mockResolvedValue({
      content: "Texto extraído de prueba (mock)",
      provider: "anthropic",
      model: "claude-haiku-4-5",
    }),
  };
});
