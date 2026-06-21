-- favoritQ-A schema
-- Applied automatically by the postgres image on first startup.

-- gen_random_uuid() is available in PostgreSQL 13+ core (pgcrypto built in).

CREATE TABLE IF NOT EXISTS rooms (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,
    name        TEXT,
    status      TEXT NOT NULL DEFAULT 'open',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    -- 参加時に発行する秘密トークン。本人確認（なりすまし防止）に使う。
    token       TEXT,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 既存DBへの後方互換: runSchema は毎起動で実行されるため冪等にカラム追加。
ALTER TABLE members ADD COLUMN IF NOT EXISTS token TEXT;

CREATE INDEX IF NOT EXISTS idx_members_room ON members(room_id);

-- お題
CREATE TABLE IF NOT EXISTS topics (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'closed'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topics_room ON topics(room_id);

-- 1ルームで同時に active なお題は最大1つ
CREATE UNIQUE INDEX IF NOT EXISTS uq_topics_one_active
    ON topics(room_id) WHERE status = 'active';

-- AI が生成した選択肢
CREATE TABLE IF NOT EXISTS options (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id    UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_options_topic ON options(topic_id);

-- 各メンバーの選択（お題ごとに1人1票）
CREATE TABLE IF NOT EXISTS choices (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id    UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    option_id   UUID NOT NULL REFERENCES options(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (topic_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_choices_topic ON choices(topic_id);
