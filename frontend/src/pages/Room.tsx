import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, type RoomState, type MatchingResult } from "../api.js";
import { getSocket } from "../socket.js";
import { loadMember, clearMember } from "../member.js";
import Vote from "./Vote.js";
import Result from "./Result.js";

export default function Room() {
  const { code = "" } = useParams();
  const navigate = useNavigate();

  const me = loadMember(code);
  const [state, setState] = useState<RoomState | null>(null);
  const [topicTitle, setTopicTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topicResult, setTopicResult] = useState<MatchingResult | null>(null);
  const [roomResult, setRoomResult] = useState<MatchingResult | null>(null);
  const [usingMock, setUsingMock] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setState(await api.getRoom(code));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [code]);

  // 未参加ならホームへ
  useEffect(() => {
    if (!me) navigate("/");
  }, [me, navigate]);

  // 初期ロード + Socket 購読
  const myMemberId = me?.memberId;
  useEffect(() => {
    refresh();
    const socket = getSocket();
    socket.emit("join-room", { code, memberId: myMemberId });

    const onChange = () => refresh();
    socket.on("member-joined", onChange);
    socket.on("member-left", onChange);
    socket.on("topic-started", onChange);
    socket.on("choice-made", onChange);
    socket.on("result-ready", onChange);
    socket.on("topic-closed", () => {
      setTopicResult(null);
      setRoomResult(null);
      setUsingMock(false);
      refresh();
    });

    return () => {
      socket.emit("leave-room", { code });
      socket.off("member-joined", onChange);
      socket.off("member-left", onChange);
      socket.off("topic-started", onChange);
      socket.off("choice-made", onChange);
      socket.off("result-ready", onChange);
      socket.off("topic-closed");
    };
  }, [code, refresh, myMemberId]);

  const activeTopic = state?.activeTopic ?? null;
  const total = state?.members.length ?? 0;
  const voted = activeTopic?.choices.length ?? 0;
  const myChoice = activeTopic?.choices.find((c) => c.member_id === me?.memberId);
  const allVoted = !!activeTopic && total > 0 && voted >= total;

  // 全員が投票したら結果を取得
  useEffect(() => {
    if (allVoted && activeTopic) {
      api.topicResult(activeTopic.id).then(setTopicResult).catch(() => {});
      api.roomResult(code).then(setRoomResult).catch(() => {});
    }
  }, [allVoted, activeTopic, code]);

  async function handleCreateTopic() {
    if (!topicTitle.trim()) return setError("お題を入力してください");
    setBusy(true);
    setError(null);
    try {
      const result = await api.createTopic(code, topicTitle.trim());
      setUsingMock(result.usingMock);
      setTopicTitle("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVote(optionId: string) {
    if (!me || !activeTopic) return;
    await api.vote(activeTopic.id, me.memberId, optionId, me.token);
    await refresh();
  }

  async function handleNext() {
    if (!activeTopic) return;
    await api.closeTopic(activeTopic.id);
  }

  async function handleLeave() {
    if (!me) return;
    if (!confirm("このルームから退出しますか？")) return;
    try {
      await api.leaveRoom(code, me.memberId, me.token);
    } catch {
      /* 失敗してもローカルからは退出する */
    }
    clearMember(code);
    navigate("/");
  }

  if (!me) return null;

  return (
    <div className="container">
      <header className="room-header">
        <div>
          <h1>ルーム {code}</h1>
          <p className="subtitle">あなた: {me.memberName}</p>
          <button className="link" onClick={handleLeave}>
            退出する
          </button>
        </div>
        <div className="members">
          <strong>参加者 ({total})</strong>
          <ul>
            {state?.members.map((m) => (
              <li key={m.id}>{m.name}</li>
            ))}
          </ul>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {/* フェーズ分岐 */}
      {!activeTopic && (
        <div className="card">
          <h2>お題を設定</h2>
          <p className="subtitle">
            お題を入力すると、AI（またはモック）が選択肢を提示します。
          </p>
          <label>
            お題
            <input
              value={topicTitle}
              onChange={(e) => setTopicTitle(e.target.value)}
              placeholder="例: 旅行で行くなら？"
              maxLength={100}
            />
          </label>
          <button className="primary" disabled={busy} onClick={handleCreateTopic}>
            {busy ? "選択肢を生成中…" : "お題を決定して選択肢を生成"}
          </button>
        </div>
      )}

      {usingMock && activeTopic && (
        <p className="notice">AI が利用できなかったため、仮の選択肢を表示しています。</p>
      )}

      {activeTopic && !myChoice && (
        <Vote
          title={activeTopic.title}
          options={activeTopic.options}
          onVote={handleVote}
        />
      )}

      {activeTopic && myChoice && !allVoted && (
        <div className="card">
          <h2>お題: {activeTopic.title}</h2>
          <p className="subtitle">
            投票済み。他のメンバーを待っています… ({voted}/{total})
          </p>
        </div>
      )}

      {activeTopic && allVoted && (
        <Result
          title={activeTopic.title}
          options={activeTopic.options}
          choices={activeTopic.choices}
          members={state?.members ?? []}
          topicResult={topicResult}
          roomResult={roomResult}
          onNext={handleNext}
        />
      )}
    </div>
  );
}
