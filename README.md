# favoritQ-A

ルームを作り、ルーム内で **お題** を決め、そのお題に沿った選択肢を **AI が提示**。
ルームメンバーが「好き」を選び、好みがマッチしたら **マッチング率** を表示する Web アプリです。
お題はマッチング率を出した後も、**何度でも設定し直して繰り返せます**（累計マッチング率も表示）。

## 技術スタック

- **DB**: PostgreSQL 16
- **バックエンド**: Node.js + TypeScript（Express + Socket.IO + `pg`）
- **フロントエンド**: React + TypeScript + Vite
- **AI**: Anthropic Claude API（`@anthropic-ai/sdk`、`claude-haiku-4-5`）。選択肢生成は軽いタスクなので高速・低コストな Haiku を使用。APIキー未設定時はモック選択肢にフォールバック
- **リアルタイム**: Socket.IO（複数人の同期）

## ディレクトリ構成

```
.
├── .devcontainer/devcontainer.json   # VS Code Dev Container 定義
├── docker-compose.yml                # db / backend / frontend
├── .env.example                      # 環境変数のサンプル
├── db/init.sql                       # DBスキーマ（初回起動時に自動適用）
├── backend/                          # Express + Socket.IO API
└── frontend/                         # React (Vite) フロント
```

## 起動方法（Docker Compose）

```bash
# 1. 環境変数を用意（任意で ANTHROPIC_API_KEY を設定。無くてもモックで動作）
cp .env.example .env

# 2. 3サービス（db / backend / frontend）を起動
docker compose up --build
```

起動後：

- フロント: http://localhost:5173
- バックエンド: http://localhost:5000/api/health
- DB: localhost:5432

> `ANTHROPIC_API_KEY` を設定すると Claude が選択肢を生成します。未設定の場合は
> 固定のモック選択肢が返るため、APIキーなしでも一連の流れを確認できます。

## 使い方

1. トップで名前を入れて **「ルームを作る」**。表示された6桁のルームコードを共有。
2. 他のメンバーは別タブ/端末で同じコードを使って **「コードで参加」**。
3. **お題を入力** → AI（またはモック）の選択肢が表示される。
4. 各メンバーが選択肢から「好き」を選ぶ。
5. 全員が選び終わると **マッチング率**（このお題単体 ＋ ルーム累計）が表示される。
6. **「次のお題を設定する」** で再びお題を入力でき、累計マッチング率が更新されていく。

## Dev Container（VS Code）

VS Code で「Reopen in Container」を選ぶと、`docker-compose.yml` の `backend` サービスに
アタッチした開発環境が起動します（ポート 5173 / 5000 / 5432 をフォワード）。

## API 概要

| Method | Path | 説明 |
| ------ | ---- | ---- |
| POST | `/api/rooms` | ルーム作成 |
| POST | `/api/rooms/:code/join` | 名前で参加（メンバートークンを発行して返す） |
| POST | `/api/rooms/:code/leave` | ルームから退出（`x-member-token` で本人確認） |
| GET  | `/api/rooms/:code` | ルーム状態（メンバー・進行中お題） |
| POST | `/api/rooms/:code/topics` | お題設定＋選択肢生成 |
| POST | `/api/topics/:id/choices` | 選択を記録（`x-member-token` ヘッダで本人確認） |
| GET  | `/api/topics/:id/result` | お題単体のマッチング率 |
| POST | `/api/topics/:id/close` | お題を閉じる（次のお題へ） |
| GET  | `/api/rooms/:code/result` | ルーム累計のマッチング率 |

## メモ

- 本リポジトリは「動く雛形（スケルトン）」をベースに拡張中です。本番デプロイ設定は
  `DEPLOY.md` を参照してください。
- 投票の本人確認: 参加時にサーバが秘密のメンバートークンを発行し、クライアントは
  localStorage に保存。投票時に `x-member-token` ヘッダで送り、なりすましを防ぎます。
- 機密情報（APIキー）は `.env`（gitignore 済み）にのみ置いてください。
