# Etapa 1: build do frontend (React + Vite) — copia também o design-system
# (dependência de pacote irmão via "file:../design-system" no
# frontend/package.json), preservando a mesma estrutura relativa de pastas
# que existe fora do container.
# bookworm-slim (glibc), não alpine (musl): o binário nativo do lightningcss
# (usado pelo Tailwind v4) falha a resolver via optionalDependencies em
# musl mesmo com o pacote certo no lockfile — troca de base evita o bug.
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app
COPY design-system ./design-system
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm ci
# Same-origin: Caddy serve o front e faz proxy de /api pro backend no
# mesmo domínio/porta — ver deploy/Caddyfile.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# Etapa 2: Caddy — serve os estáticos do frontend e faz proxy pro backend
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend-build /app/frontend/dist /srv
