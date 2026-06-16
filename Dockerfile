# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar pnpm globalmente
RUN npm install -g pnpm@10.11.0

# Copiar archivos de dependencias
COPY package.json pnpm-lock.yaml ./

# Copiar carpeta de Prisma para generar el cliente
COPY prisma ./prisma

# Instalar todas las dependencias
RUN pnpm install --frozen-lockfile

# Generar cliente de Prisma
RUN pnpm prisma:generate

# Copiar el resto del código y construir
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# Podar dependencias de desarrollo para el entorno de producción
RUN pnpm prune --prod

# Stage 2: Runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copiar dependencias de producción y compilados del builder
COPY package.json pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Exponer el puerto configurado en el servicio
EXPOSE 3000

# Ejecutar migraciones pendientes y arrancar el servidor
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]