Automated Tests

0. Preparar archivos de prueba

Antes de ejecutar el benchmark, colocar los archivos de entrada dentro de:

benchmark/
├── test-files/
│ ├── prescription-jpg-01.jpg
│ ├── prescription-pdf-text.pdf
│ ├── prescription-pdf-scanned.pdf
│ └── ...

Archivos recomendados para la evaluación:

JPG/PNG de prescripciones tomadas con cámara
PDF con texto digital seleccionable
PDF escaneado (imagen embebida)
Casos de baja calidad o escritura manuscrita

Los archivos dentro de benchmark/test-files/ serán procesados automáticamente por el script.

1. Instalar dependencias

Verificar que las dependencias estén instaladas:

pnpm install

Configurar el archivo .env con las credenciales necesarias:

AI_PROVIDER=anthropic

ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=

2. Build check

Verificar que el proyecto compila sin errores:

pnpm build

3. Benchmark completo

Ejecutar el benchmark:

npx ts-node benchmark/run-benchmark.ts

El proceso:

Lee todos los archivos en benchmark/test-files/
Ejecuta extracción con cada proveedor configurado
Mide latencia y métricas disponibles
Guarda las salidas para comparación manual

4. Revisar resultados

Los resultados se generarán en:

benchmark/
└── results/
├── report.md
├── claude/
├── openai/
└── gemini/
