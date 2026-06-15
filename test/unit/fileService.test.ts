import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getFileType, deleteFile } from "../../src/services/fileService";
import { FileType } from "@prisma/client";
import fs from "fs";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

describe("fileService", () => {
  describe("getFileType", () => {
    it("should return PDF when mimeType is application/pdf", () => {
      expect(getFileType("application/pdf")).toBe(FileType.PDF);
    });

    it("should return IMAGE when mimeType is image/jpeg", () => {
      expect(getFileType("image/jpeg")).toBe(FileType.IMAGE);
    });

    it("should return IMAGE when mimeType is image/png", () => {
      expect(getFileType("image/png")).toBe(FileType.IMAGE);
    });
  });

  describe("deleteFile", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should delete file if it exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      deleteFile("dummy/path.pdf");
      expect(fs.existsSync).toHaveBeenCalledWith("dummy/path.pdf");
      expect(fs.unlinkSync).toHaveBeenCalledWith("dummy/path.pdf");
    });

    it("should not delete file if it does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      deleteFile("dummy/path.pdf");
      expect(fs.existsSync).toHaveBeenCalledWith("dummy/path.pdf");
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it("should catch errors and not crash", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error("Disk error");
      });

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      expect(() => deleteFile("dummy/path.pdf")).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
