import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** 「最初の画面にもどる」などの復帰操作 */
  onReset?: () => void;
}
interface State {
  error: Error | null;
}

/**
 * 画面描画中の予期せぬエラーを受け止める安全網。
 * 施設で利用者の前に真っ白な画面が出ないようにし、保存済みデータを守りつつ
 * 最初の画面へもどる導線を出す。データはlocalStorageにあるため失われない。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 開発時の手がかり。本番でも console には残る（個人情報は扱っていない）
    console.error('画面の描画でエラーが発生しました:', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="screen">
          <section className="panel">
            <h2>画面の表示中に問題が起きました</h2>
            <p>
              これまでの記録は保存されています。お手数ですが、最初の画面にもどってもう一度お試しください。
              何度も起きる場合は、管理画面から全データをJSONエクスポートしてバックアップを取ってください。
            </p>
            <details className="advanced">
              <summary>技術的な詳細（支援者・開発者用）</summary>
              <pre className="error-detail">{String(this.state.error?.stack ?? this.state.error)}</pre>
            </details>
            <div className="panel-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => {
                  this.setState({ error: null });
                  this.props.onReset?.();
                }}
              >
                最初の画面にもどる
              </button>
            </div>
          </section>
        </div>
      );
    }
    return this.props.children;
  }
}
