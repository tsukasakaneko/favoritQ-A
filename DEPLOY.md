# デプロイ手順

## アーキテクチャ

本番環境は **Render 単一 Web サービス + マネージド PostgreSQL** で動作します。

- バックエンド（Express + Socket.IO）が `/api/*` REST と WebSocket を提供
- 同じサービスがビルド済みの React 静的ファイルを配信（SPA フォールバック付き）
- CORS 設定不要（同一オリジンで完結）

オプションで Cloudflare を DNS / CDN / SSL プロキシとして前段に配置できます。

---

## Render へのデプロイ

### A. Blueprint（推奨・ワンクリック）

1. GitHub にこのブランチ（または main）を push する。
2. Render ダッシュボード → **"New → Blueprint"** を選択。
3. リポジトリを連携し `render.yaml` を検出させる。
4. `ANTHROPIC_API_KEY` を入力して **"Apply"**。
5. Render が自動で Web サービスと PostgreSQL を作成・デプロイする。
6. デプロイ完了後 `https://<app>.onrender.com/api/health` で疎通確認。

> スキーマ（`db/init.sql`）は起動時に自動適用されます。手動マイグレーション不要です。

### B. 手動作成

1. **PostgreSQL を作成**
   - Render → **"New → PostgreSQL"** → 名前を付けて作成。
   - 作成後に **"Internal Database URL"** をコピーしておく。

2. **Web サービスを作成**
   - Render → **"New → Web Service"** → リポジトリを連携。
   - Environment: **Docker**
   - Dockerfile Path: `./Dockerfile`
   - Health Check Path: `/api/health`

3. **環境変数を設定**（Web サービスの Environment タブ）

   | キー | 値 |
   |------|----|
   | `DATABASE_URL` | 手順1でコピーした Internal Database URL |
   | `ANTHROPIC_API_KEY` | Anthropic コンソールで取得した APIキー（任意） |
   | `NODE_ENV` | `production` |

4. **"Save Changes"** → 自動デプロイ開始。

---

## Cloudflare を組み合わせる

Cloudflare Workers 単体でのデプロイは **このアプリには非対応**です（後述の比較表を参照）。
ただし Cloudflare を **DNS / CDN / SSL のプロキシ** として活用できます。

1. Cloudflare にドメインを追加し、NS レコードを切り替える。
2. DNS レコードに CNAME を追加:
   - Name: `@`（または `www`）
   - Target: `<app>.onrender.com`
   - Proxy: **オレンジ雲（有効）**
3. SSL/TLS モードを **Full (strict)** に設定。
4. WebSocket はデフォルトでプロキシを通過します。

これで `https://yourdomain.com` → Cloudflare CDN → Render という構成になります。

---

## サービス比較

| | Render（採用）| Railway | Fly.io | Cloudflare Workers |
|---|---|---|---|---|
| **スリープ** | 無料枠は15分で休眠 | 無し | 無し | サーバーレス |
| **WebSocket** | ✅ ネイティブ対応 | ✅ | ✅ | ⚠️ Durable Objects が必要 |
| **マネージド Postgres** | ✅ 無料枠あり | ✅ | ✅（外部連携） | ❌（D1 は SQLite、別設計が必要） |
| **Docker デプロイ** | ✅ | ✅ | ✅ | ❌ |
| **料金目安** | 無料〜$7/月 | 無料〜$5/月 | 無料〜$5/月 | 無料枠大きい |
| **セットアップ難易度** | ★☆☆ | ★☆☆ | ★★☆ | ★★★（要リアーキテクチャ） |

### なぜ Cloudflare Workers 単体では不可か

このアプリは以下の理由で Cloudflare Workers に直接デプロイできません:

- **Socket.IO（WebSocket 常駐接続）**: Workers はリクエスト単位のサーバーレスモデル。常駐 WebSocket サーバーを動かすには Durable Objects が必要で、Socket.IO ライブラリ自体も要書き換え。
- **Node.js ランタイム依存**: Workers のランタイムは V8 Isolate であり、Node.js API（`pg` ドライバー等）は使用不可。
- **PostgreSQL**: Cloudflare には D1（SQLite 互換）があるが `pg` ドライバーは未対応。Workers から外部 Postgres に接続する構成は可能だが、接続プール管理が複雑になる。

---

## ローカル開発

本番用 Dockerfile はローカル開発フローに影響しません。

```bash
# ローカル開発（変更なし）
cp .env.example .env
docker compose up --build
```

- フロント: http://localhost:5173
- バックエンド: http://localhost:5000/api/health

---

## 本番イメージのローカル確認

```bash
# ビルド
docker build -t favoritq .

# 起動（DATABASE_URL に接続可能な Postgres が必要）
docker run -e DATABASE_URL="postgres://..." -e PORT=8080 -p 8080:8080 favoritq
```
