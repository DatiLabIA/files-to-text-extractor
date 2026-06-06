import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import { config } from "../config";
import { AIExtractionResult } from "../types";
import { AppError } from "../middleware/errorHandler";

const EXTRACTION_PROMPT = `You are a medical document analyst. Extract ALL text content from this medical prescription/formula document completely and accurately.

Return the extracted content in a structured plain-text format preserving:
- Patient information (name, ID, date of birth, etc.)
- Doctor information (name, specialty, license number, etc.)
- Prescribed medications (name, dosage, frequency, duration, instructions)
- Diagnosis or clinical notes
- Dates and signatures
- Any other relevant medical information

Return ONLY the extracted content, no commentary or explanations.`;

// ── Anthropic (Claude) ──────────────────────────────────────────────────────

async function extractWithAnthropic(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<AIExtractionResult> {
  if (!config.ai.anthropic.apiKey) {
    throw new AppError("ANTHROPIC_API_KEY is not configured", 500);
  }

  const client = new Anthropic({ apiKey: config.ai.anthropic.apiKey });

  const isPdf = mimeType === "application/pdf";

  const messageContent: Anthropic.MessageParam["content"] = isPdf
    ? [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: fileBuffer.toString("base64"),
          },
        } as Anthropic.DocumentBlockParam,
        { type: "text", text: EXTRACTION_PROMPT },
      ]
    : [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType as
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp",
            data: fileBuffer.toString("base64"),
          },
        },
        { type: "text", text: EXTRACTION_PROMPT },
      ];

  const response = await client.messages.create({
    model: config.ai.anthropic.model,
    max_tokens: 4096,
    messages: [{ role: "user", content: messageContent }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new AppError("AI returned no text content", 500);
  }

  return {
    content: textBlock.text,
    provider: "anthropic",
    model: config.ai.anthropic.model,
  };
}

// ── OpenAI (GPT-4o) ────────────────────────────────────────────────────────

async function extractWithOpenAI(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<AIExtractionResult> {
  if (!config.ai.openai.apiKey) {
    throw new AppError("OPENAI_API_KEY is not configured", 500);
  }

  const client = new OpenAI({ apiKey: config.ai.openai.apiKey });
  const base64Data = fileBuffer.toString("base64");
  const dataUri = `data:${mimeType};base64,${base64Data}`;

  const response = await client.chat.completions.create({
    model: config.ai.openai.model,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: dataUri, detail: "high" },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new AppError("AI returned no text content", 500);
  }

  return {
    content,
    provider: "openai",
    model: config.ai.openai.model,
  };
}

// ── Google Gemini ───────────────────────────────────────────────────────────

async function extractWithGemini(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<AIExtractionResult> {
  if (!config.ai.gemini.apiKey) {
    throw new AppError("GEMINI_API_KEY is not configured", 500);
  }

  const ai = new GoogleGenAI({ apiKey: config.ai.gemini.apiKey });

  const response = await ai.models.generateContent({
    model: config.ai.gemini.model,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: fileBuffer.toString("base64"),
            },
          },
          { text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const content = response.text;
  if (!content) {
    throw new AppError("AI returned no text content", 500);
  }

  return {
    content,
    provider: "gemini",
    model: config.ai.gemini.model,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function extractTextFromFile(
  filePath: string,
  mimeType: string,
): Promise<AIExtractionResult> {
  const fileBuffer = fs.readFileSync(filePath);

  switch (config.ai.provider) {
    case "anthropic":
      return extractWithAnthropic(fileBuffer, mimeType);
    case "openai":
      return extractWithOpenAI(fileBuffer, mimeType);
    case "gemini":
      return extractWithGemini(fileBuffer, mimeType);
    default:
      throw new AppError(
        `AI provider "${config.ai.provider}" is not supported yet`,
        500,
      );
  }
}
