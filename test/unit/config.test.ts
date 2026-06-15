import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("config parsing", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("should parse configuration successfully with correct env variables", async () => {
    process.env.PORT = "4000";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.AUTH_TOKEN = "my-secure-token";
    process.env.AI_PROVIDER = "anthropic";

    const { config } = await import("../../src/config/index");

    expect(config.port).toBe(4000);
    expect(config.database.url).toBe(
      "postgresql://user:pass@localhost:5432/db",
    );
    expect(config.security.authToken).toBe("my-secure-token");
    expect(config.ai.provider).toBe("anthropic");
  });

  it("should fail validation and exit if DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    process.env.AUTH_TOKEN = "my-secure-token";
    process.env.PORT = "3000";
    process.env.AI_PROVIDER = "anthropic";

    vi.resetModules();

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const processSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`process.exit(${code})`);
    }) as any);

    try {
      await import("../../src/config/index");
      expect.fail("Should have called process.exit");
    } catch (error: any) {
      expect(error.message).toContain("process.exit(1)");
    }

    expect(processSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalled();

    processSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
