import * as fs from "fs";
import * as path from "path";

export interface BenchmarkResult {
  provider: string;
  model: string;
  fileName: string;
  fileType: string;
  latencyMs: number;
  extractedText: string;
  // Tokens reales de la API (o estimación si la API no los devuelve)
  inputTokens: number;
  outputTokens: number;
  tokensAreReal: boolean; // true = reportados por la API, false = estimación por tamaño base64
  estimatedCostUsd: number;
  error?: string;
}

export interface ProviderConfig {
  name: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

export function getTestFiles(dir: string): { filePath: string; fileName: string; mimeType: string }[] {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return [];
  }

  const files = fs.readdirSync(dir);
  const result: { filePath: string; fileName: string; mimeType: string }[] = [];

  for (const file of files) {
    if (file === ".gitkeep" || file.startsWith(".")) {
      continue;
    }

    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    const ext = path.extname(file).toLowerCase();
    let mimeType = "";

    if (ext === ".pdf") {
      mimeType = "application/pdf";
    } else if (ext === ".jpg" || ext === ".jpeg") {
      mimeType = "image/jpeg";
    } else if (ext === ".png") {
      mimeType = "image/png";
    } else if (ext === ".webp") {
      mimeType = "image/webp";
    } else if (ext === ".gif") {
      mimeType = "image/gif";
    }

    if (mimeType) {
      result.push({
        filePath,
        fileName: file,
        mimeType,
      });
    }
  }

  return result;
}

export function estimateCost(provider: string, inputTokens: number, outputTokens: number): number {
  // Tarifas por millón de tokens
  let inputRate = 0;
  let outputRate = 0;

  switch (provider.toLowerCase()) {
    case "anthropic": // claude-haiku-4-5
      inputRate = 1.00 / 1_000_000;
      outputRate = 5.00 / 1_000_000;
      break;
    case "openai": // gpt-4o
      inputRate = 2.50 / 1_000_000;
      outputRate = 10.00 / 1_000_000;
      break;
    case "gemini": // gemini-2.5-flash
      inputRate = 0.30 / 1_000_000;
      outputRate = 2.50 / 1_000_000;
      break;
  }

  return (inputTokens * inputRate) + (outputTokens * outputRate);
}

export function generateReport(results: BenchmarkResult[], outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Guardar resultados individuales
  for (const res of results) {
    if (res.error) continue;
    const providerDir = path.join(outputDir, res.provider);
    if (!fs.existsSync(providerDir)) {
      fs.mkdirSync(providerDir, { recursive: true });
    }
    const cleanFileName = res.fileName.replace(/[^\w\s.-]/g, "_");
    fs.writeFileSync(
      path.join(providerDir, `${cleanFileName}.txt`),
      res.extractedText,
      "utf8"
    );
  }

  // Agrupar resultados por archivo
  const filesMap = new Map<string, BenchmarkResult[]>();
  for (const res of results) {
    if (!filesMap.has(res.fileName)) {
      filesMap.set(res.fileName, []);
    }
    filesMap.get(res.fileName)!.push(res);
  }

  let markdown = `# Reporte de Evaluación de Proveedores de IA para Extracción Médica\n\n`;
  markdown += `Fecha de ejecución: ${new Date().toLocaleString()}\n\n`;

  markdown += `## Resumen Comparativo General\n\n`;
  markdown += `| Archivo | Proveedor | Modelo | Latencia (ms) | Tokens Entrada | Tokens Salida | Total Tokens | Costo Est. (USD) | Fuente Tokens | Estado |\n`;
  markdown += `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;

  for (const [fileName, fileResults] of filesMap.entries()) {
    for (const res of fileResults) {
      const latency = res.error ? "N/A" : `${res.latencyMs.toFixed(0)} ms`;
      const inputTok = res.error ? "N/A" : res.inputTokens.toLocaleString();
      const outputTok = res.error ? "N/A" : res.outputTokens.toLocaleString();
      const totalTok = res.error ? "N/A" : (res.inputTokens + res.outputTokens).toLocaleString();
      const cost = res.error ? "N/A" : `$${res.estimatedCostUsd.toFixed(6)}`;
      const tokenSource = res.error ? "N/A" : (res.tokensAreReal ? "✅ API" : "⚠️ Estimado");
      const status = res.error ? `❌ Error: ${res.error}` : "✅ Completado";
      markdown += `| \`${fileName}\` | **${res.provider}** | \`${res.model}\` | ${latency} | ${inputTok} | ${outputTok} | ${totalTok} | ${cost} | ${tokenSource} | ${status} |\n`;
    }
  }

  // Resumen agregado por proveedor
  markdown += `\n## Totales por Proveedor\n\n`;
  markdown += `| Proveedor | Archivos Procesados | Total Tokens Entrada | Total Tokens Salida | Total Tokens | Costo Total Est. (USD) |\n`;
  markdown += `| --- | --- | --- | --- | --- | --- |\n`;

  const providerMap = new Map<string, BenchmarkResult[]>();
  for (const res of results) {
    if (!providerMap.has(res.provider)) providerMap.set(res.provider, []);
    providerMap.get(res.provider)!.push(res);
  }

  for (const [provider, provResults] of providerMap.entries()) {
    const successful = provResults.filter((r) => !r.error);
    const totalInput = successful.reduce((sum, r) => sum + r.inputTokens, 0);
    const totalOutput = successful.reduce((sum, r) => sum + r.outputTokens, 0);
    const totalCost = successful.reduce((sum, r) => sum + r.estimatedCostUsd, 0);
    markdown += `| **${provider}** | ${successful.length}/${provResults.length} | ${totalInput.toLocaleString()} | ${totalOutput.toLocaleString()} | ${(totalInput + totalOutput).toLocaleString()} | $${totalCost.toFixed(6)} |\n`;
  }

  markdown += `\n## Análisis de Calidad y Conclusiones\n\n`;
  markdown += `Revisar los textos extraídos en las carpetas respectivas:\n`;
  markdown += `- [Claude (Anthropic)](file:///benchmark/results/anthropic)\n`;
  markdown += `- [GPT-4o (OpenAI)](file:///benchmark/results/openai)\n`;
  markdown += `- [Gemini (Google)](file:///benchmark/results/gemini)\n\n`;

  markdown += `### Criterios Clave:\n`;
  markdown += `1. **Precisión de Prescripción**: ¿Los nombres de medicamentos, dosis y posologías están libres de errores?\n`;
  markdown += `2. **Lectura Manuscrita**: ¿Qué modelo reconoce mejor las firmas o notas a mano del doctor?\n`;
  markdown += `3. **Velocidad y Costo**: Comparación directa de la latencia medida y las estimaciones de costo.\n`;
  markdown += `\n> ⚠️ Tokens marcados como "Estimado" son aproximaciones por tamaño del archivo base64. Los marcados "API" son los valores reales reportados por cada proveedor.\n`;

  fs.writeFileSync(path.join(outputDir, "report.md"), markdown, "utf8");
  console.log(`\nReporte generado con éxito en: ${path.join(outputDir, "report.md")}`);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
