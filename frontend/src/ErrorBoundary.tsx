import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: unknown): State {
    const message =
      err instanceof Error ? err.message : "予期しないエラーが発生しました";
    return { hasError: true, message };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", err, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container">
          <div className="card">
            <h2>エラーが発生しました</h2>
            <p className="error">{this.state.message}</p>
            <button
              className="primary"
              onClick={() => {
                this.setState({ hasError: false, message: "" });
                window.location.href = "/";
              }}
            >
              ホームに戻る
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
