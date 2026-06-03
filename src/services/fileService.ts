import fs from "fs";
import { FileType } from "@prisma/client";

export function getFileType(mimeType: string): FileType {
  if (mimeType === "application/pdf") return FileType.PDF;
  return FileType.IMAGE;
}

export function deleteFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`Failed to delete file ${filePath}:`, err);
  }
}
