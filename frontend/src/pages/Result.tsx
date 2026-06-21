import type { MatchingResult, Option, Choice, Member } from "../api.js";
import { rateLabel } from "../format.js";

interface Props {
  title: string;
  options: Option[];
  choices: Choice[];
  members: Member[];
  topicResult: MatchingResult | null;
  roomResult: MatchingResult | null;
  onNext: () => Promise<void>;
}

export default function Result({
  title,
  options,
  choices,
  members,
  topicResult,
  roomResult,
  onNext,
}: Props) {
  const optionLabel = (id: string) =>
    options.find((o) => o.id === id)?.label ?? "?";
  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.name ?? "?";

  return (
    <div className="card">
      <h2>結果: {title}</h2>

      <h3>みんなの選択</h3>
      <ul className="picks">
        {choices.map((c) => (
          <li key={c.member_id}>
            <strong>{memberName(c.member_id)}</strong>：{optionLabel(c.option_id)}
          </li>
        ))}
      </ul>

      <h3>このお題のマッチング</h3>
      {topicResult && topicResult.pairs.length > 0 ? (
        <ul className="pairs">
          {topicResult.pairs.map((p) => (
            <li key={`${p.memberAId}-${p.memberBId}`}>
              {p.memberAName} × {p.memberBName}
              <span className={p.rate === 100 ? "match" : "nomatch"}>
                {rateLabel(p.rate)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="subtitle">比較できるペアがいません</p>
      )}

      <h3>累計マッチング率（このルームの全お題）</h3>
      {roomResult && roomResult.pairs.length > 0 ? (
        <>
          <ul className="pairs">
            {roomResult.pairs.map((p) => (
              <li key={`cum-${p.memberAId}-${p.memberBId}`}>
                {p.memberAName} × {p.memberBName}
                <span className="rate">
                  {rateLabel(p.rate)}
                  <small>
                    （{p.matchedTopics}/{p.sharedTopics} お題一致）
                  </small>
                </span>
              </li>
            ))}
          </ul>
          {roomResult.best && roomResult.best.rate !== null && (
            <p className="best">
              ★ 最高マッチ: {roomResult.best.memberAName} ×{" "}
              {roomResult.best.memberBName}（{rateLabel(roomResult.best.rate)}）
            </p>
          )}
        </>
      ) : (
        <p className="subtitle">まだ集計データがありません</p>
      )}

      <button className="primary" onClick={onNext}>
        次のお題を設定する
      </button>
    </div>
  );
}
