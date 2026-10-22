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
# --include=dev: tsc e vite são devDependencies e o build precisa deles mesmo
# que o ambiente peça só produção (NODE_ENV/omit=dev) — "tsc: not found" no
# servidor, out/2026. A 2ª linha falha cedo, com mensagem clara, se faltar.
RUN npm ci --include=dev --no-audit --no-fund  && test -x node_modules/.bin/tsc && test -x node_modules/.bin/vite
# Same-origin: Caddy serve o front e faz proxy de /api pro backend no
# mesmo domínio/porta — ver deploy/Caddyfile.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# Etapa 2: Caddy — serve os estáticos do frontend e faz proxy pro backend
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend-build /app/frontend/dist /srv
