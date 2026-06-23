import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { saveMember } from "../member.js";

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return setError("名前を入力してください");
    setBusy(true);
    setError(null);
    try {
      const { room } = await api.createRoom();
      const joined = await api.joinRoom(room.code, name.trim());
      saveMember(room.code, joined.member.id, joined.member.name, joined.token);
      navigate(`/room/${room.code}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!name.trim()) return setError("名前を入力してください");
    if (!code.trim()) return setError("ルームコードを入力してください");
    setBusy(true);
    setError(null);
    try {
      const joined = await api.joinRoom(code.trim(), name.trim());
      saveMember(
        joined.room.code,
        joined.member.id,
        joined.member.name,
        joined.token
      );
      navigate(`/room/${joined.room.code}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1>favoritQ-A</h1>
      <p className="subtitle">
        ルームでお題を決めて、AIの選択肢から「好き」を選ぶ。
        みんなの好みのマッチング率を見てみよう。
      </p>

      <div className="card">
        <label>
          あなたの名前
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: たろう"
            maxLength={30}
          />
        </label>

        <button onClick={handleCreate} disabled={busy} className="primary">
          ルームを作る
        </button>

        <div className="divider">または</div>

        <label>
          ルームコード
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="例: ABC123"
            maxLength={6}
          />
        </label>
        <button onClick={handleJoin} disabled={busy}>
          コードで参加
        </button>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
