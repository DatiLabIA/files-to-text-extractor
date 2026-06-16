import { describe, it, expect } from "vitest";
import { logger } from "../../src/shared/logger";

describe("Logger Singleton", () => {
  it("should be defined and configure log level", () => {
    expect(logger).toBeDefined();
    expect(logger.level).toBe("silent"); // test environment sets level to silent
  });
});
