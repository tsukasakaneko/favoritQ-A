# ──────────────────────────────────────────────
# Stage 1: フロントエンドビルド
# ──────────────────────────────────────────────
FROM node:20 AS frontend-build

WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# VITE_API_BASE を空にして同一オリジン相対パスでAPIを呼ぶ
RUN VITE_API_BASE="" npm run build

# ──────────────────────────────────────────────
# Stage 2: バックエンドビルド
# ──────────────────────────────────────────────
FROM node:20 AS backend-build

WORKDIR /backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ ./
RUN npm run build

# ──────────────────────────────────────────────
# Stage 3: 実行イメージ（スリム）
# ──────────────────────────────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

# 本番依存のみインストール
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# バックエンドの成果物
COPY --from=backend-build /backend/dist ./dist

# DBスキーマ（起動時に runSchema() で適用）
COPY db/init.sql ./db/init.sql

# フロントの成果物（静的配信用）
COPY --from=frontend-build /frontend/dist ./public

EXPOSE 5000

CMD ["node", "dist/index.js"]
