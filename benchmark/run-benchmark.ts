import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import {
  getTestFiles,
  estimateCost,
  generateReport,
  sleep,
  BenchmarkResult,
  ProviderConfig,
} from "./benchmark-utils";

const EXTRACTION_PROMPT = `You are a medical document analyst. Extract ALL text content from this medical prescription/formula document completely and accurately.

Return the extracted content in a structured plain-text format preserving:
- Patient information (name, ID, date of birth, etc.)
- Doctor information (name, specialty, license number, etc.)
- Prescribed medications (name, dosage, frequency, duration, instructions)
- Diagnosis or clinical notes
- Dates and signatures
- Any other relevant medical information

Return ONLY the extracted content, no commentary or explanations.`;

const TEST_FILES_DIR = path.resolve(__dirname, "test-files");
const RESULTS_DIR = path.resolve(__dirname, "results");

async function main() {
  console.log("=== INICIANDO BENCHMARK DE EXTRACCIÓN DE DOCUMENTOS MÉDICOS ===\n");

  // Verificar configuraciones
  const providers: ProviderConfig[] = [
    {
      name: "anthropic",
      apiKey: process.env["ANTHROPIC_API_KEY"] || "",
      model: process.env["ANTHROPIC_MODEL"] || "claude-haiku-4-5",
      enabled: !!process.env["ANTHROPIC_API_KEY"],
    },
    {
      name: "openai",
      apiKey: process.env["OPENAI_API_KEY"] || "",
      model: process.env["OPENAI_MODEL"] || "gpt-4o",
      enabled: !!process.env["OPENAI_API_KEY"],
    },
    {
      name: "gemini",
      apiKey: process.env["GEMINI_API_KEY"] || "",
      model: process.env["GEMINI_MODEL"] || "gemini-2.5-flash",
      enabled: !!process.env["GEMINI_API_KEY"],
    },
  ];

  console.log("Proveedores configurados:");
  for (const p of providers) {
    console.log(`- ${p.name.toUpperCase()}: ${p.enabled ? `Habilitado (Modelo: ${p.model})` : "Deshabilitado (Falta API Key)"}`);
  }
  console.log("");

  const testFiles = getTestFiles(TEST_FILES_DIR);
  if (testFiles.length === 0) {
    console.log(`⚠️ No se encontraron archivos de prueba en: ${TEST_FILES_DIR}`);
    console.log("Por favor, agrega archivos PDF o imágenes (JPG, PNG, WEBP) en esa carpeta y vuelve a ejecutar.");
    return;
  }

  console.log(`Archivos de prueba encontrados (${testFiles.length}):`);
  for (const tf of testFiles) {
    console.log(`- ${tf.fileName} (${tf.mimeType})`);
  }
  console.log("");

  const results: BenchmarkResult[] = [];

  for (const fileInfo of testFiles) {
    console.log(`\n📄 Procesando archivo: ${fileInfo.fileName}`);
    const fileBuffer = fs.readFileSync(fileInfo.filePath);
    const base64Data = fileBuffer.toString("base64");

    for (const provider of providers) {
      if (!provider.enabled) continue;

      console.log(`  🤖 Consultando ${provider.name.toUpperCase()} (${provider.model})...`);
      const startTime = performance.now();
      let extractedText = "";
      let errorMsg: string | undefined;

      // Tokens reales de la API; se sobreescriben si la API los devuelve
      let inputTokens = 0;
      let outputTokens = 0;
      let tokensAreReal = false;

      try {
        if (provider.name === "anthropic") {
          const client = new Anthropic({ apiKey: provider.apiKey });
          const isPdf = fileInfo.mimeType === "application/pdf";

          const messageContent: Anthropic.MessageParam["content"] = isPdf
            ? [
                {
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: base64Data,
                  },
                } as Anthropic.DocumentBlockParam,
                { type: "text", text: EXTRACTION_PROMPT },
              ]
            : [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: fileInfo.mimeType as any,
                    data: base64Data,
                  },
                },
                { type: "text", text: EXTRACTION_PROMPT },
              ];

          const res = await client.messages.create({
            model: provider.model,
            max_tokens: 4096,
            messages: [{ role: "user", content: messageContent }],
          });

          const textBlock = res.content.find((b) => b.type === "text");
          extractedText = textBlock && textBlock.type === "text" ? textBlock.text : "";

          // Tokens reales de Anthropic
          inputTokens = res.usage.input_tokens;
          outputTokens = res.usage.output_tokens;
          tokensAreReal = true;

        } else if (provider.name === "openai") {
          const client = new OpenAI({ apiKey: provider.apiKey });
          const dataUri = `data:${fileInfo.mimeType};base64,${base64Data}`;

          const res = await client.chat.completions.create({
            model: provider.model,
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

          extractedText = res.choices[0]?.message?.content || "";

          // Tokens reales de OpenAI
          if (res.usage) {
            inputTokens = res.usage.prompt_tokens;
            outputTokens = res.usage.completion_tokens;
            tokensAreReal = true;
          }

        } else if (provider.name === "gemini") {
          const ai = new GoogleGenAI({ apiKey: provider.apiKey });
          const res = await ai.models.generateContent({
            model: provider.model,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      mimeType: fileInfo.mimeType,
                      data: base64Data,
                    },
                  },
                  { text: EXTRACTION_PROMPT },
                ],
              },
            ],
          });

          extractedText = res.text || "";

          // Tokens reales de Gemini
          if (res.usageMetadata) {
            inputTokens = res.usageMetadata.promptTokenCount ?? 0;
            outputTokens = res.usageMetadata.candidatesTokenCount ?? 0;
            tokensAreReal = true;
          }
        }
      } catch (err: any) {
        errorMsg = err.message || String(err);
        console.error(`  ❌ Error con ${provider.name.toUpperCase()}:`, errorMsg);
      }

      const endTime = performance.now();
      const latencyMs = endTime - startTime;

      // Fallback a estimación por tamaño base64 si la API no devolvió tokens (o hubo error)
      if (!tokensAreReal) {
        inputTokens = Math.ceil(base64Data.length / 4);
        outputTokens = Math.ceil(extractedText.length / 4);
      }

      const estimatedCost = errorMsg ? 0 : estimateCost(provider.name, inputTokens, outputTokens);

      console.log(
        `  ✅ ${provider.name.toUpperCase()} — ${latencyMs.toFixed(0)} ms | ` +
        `Entrada: ${inputTokens.toLocaleString()} tok | ` +
        `Salida: ${outputTokens.toLocaleString()} tok | ` +
        `Costo: $${estimatedCost.toFixed(6)} | ` +
        `Fuente: ${tokensAreReal ? "API" : "estimado"}`
      );

      results.push({
        provider: provider.name,
        model: provider.model,
        fileName: fileInfo.fileName,
        fileType: fileInfo.mimeType,
        latencyMs,
        extractedText,
        inputTokens,
        outputTokens,
        tokensAreReal,
        estimatedCostUsd: estimatedCost,
        error: errorMsg,
      });

      // Evitar límites de tasa (rate limiting)
      await sleep(1000);
    }
  }

  generateReport(results, RESULTS_DIR);
}

main().catch((err) => {
  console.error("Falla crítica en el script del benchmark:", err);
});
