import { useState } from "react";
import type { Option } from "../api.js";

interface Props {
  title: string;
  options: Option[];
  onVote: (optionId: string) => Promise<void>;
}

export default function Vote({ title, options, onVote }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await onVote(selected);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>お題: {title}</h2>
      <p className="subtitle">あなたの「好き」を選んでください</p>
      <div className="options">
        {options.map((o) => (
          <button
            key={o.id}
            className={`option ${selected === o.id ? "selected" : ""}`}
            onClick={() => setSelected(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <button className="primary" disabled={!selected || busy} onClick={submit}>
        この選択肢に決定
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
