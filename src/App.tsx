import { useEffect, useRef, useState } from 'react';
import { APP_NAME, APP_VERSION } from './constants';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProvider, useApp } from './store/AppContext';
import { AdminScreen } from './screens/AdminScreen';
import { AssessmentScreen } from './screens/AssessmentScreen';
import { AssessmentResultScreen } from './screens/AssessmentResultScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ModeSelect } from './screens/ModeSelect';
import { ReportScreen } from './screens/ReportScreen';
import { ResultScreen } from './screens/ResultScreen';
import { SessionScreen } from './screens/SessionScreen';
import { SetupScreen } from './screens/SetupScreen';
import { TopScreen } from './screens/TopScreen';

/**
 * 同じブラウザで2つ目のタブ/ウィンドウを開いたときの検知。
 * データが「後勝ち上書き」で消える事故を防ぐため、2つ目以降は操作をブロックする。
 */
function useSingleTab(): { state: 'checking' | 'owner' | 'blocked'; recheck: () => void } {
  const [state, setState] = useState<'checking' | 'owner' | 'blocked'>('checking');
  const stateRef = useRef(state);
  stateRef.current = state;
  const chanRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      setState('owner');
      return;
    }
    const chan = new BroadcastChannel('pcwa-tab-lock');
    chanRef.current = chan;
    chan.onmessage = (e) => {
      if (e.data === 'probe') {
        if (stateRef.current === 'owner') chan.postMessage('owner-here');
      } else if (e.data === 'owner-here') {
        if (stateRef.current === 'checking') setState('blocked');
      }
    };
    chan.postMessage('probe');
    const t = window.setTimeout(() => {
      setState((s) => (s === 'checking' ? 'owner' : s));
    }, 400);
    return () => {
      window.clearTimeout(t);
      chan.close();
      chanRef.current = null;
    };
  }, []);

  const recheck = () => {
    setState('checking');
    chanRef.current?.postMessage('probe');
    window.setTimeout(() => {
      setState((s) => (s === 'checking' ? 'owner' : s));
    }, 400);
  };

  return { state, recheck };
}

function FontSwitcher() {
  const { doc, updateSettings } = useApp();
  const cur = doc.settings.fontScale;
  return (
    <div className="font-switch" role="group" aria-label="文字の大きさ">
      {(
        [
          ['s', '小'],
          ['m', '中'],
          ['l', '大'],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={'font-btn' + (cur === key ? ' selected' : '')}
          aria-pressed={cur === key}
          onClick={() => updateSettings({ fontScale: key })}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SaveFailedBanner() {
  const { saveFailed, dismissSaveFailed } = useApp();
  if (!saveFailed) return null;
  return (
    <div className="banner banner-error" role="alert">
      <span>
        ⚠ 記録を保存できませんでした。ブラウザの保存容量が不足している可能性があります。
        管理画面で容量を確認し、JSONエクスポートでバックアップした上で、不要な利用者の記録を削除してください。
      </span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={dismissSaveFailed}>
        閉じる
      </button>
    </div>
  );
}

function Shell() {
  const { screen, navigate } = useApp();
  const inSession = screen.name === 'session' || screen.name === 'assessment';

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          {APP_NAME}
          <span className="app-version">v{APP_VERSION}</span>
        </div>
        <FontSwitcher />
      </header>
      <main className="app-main">
        <SaveFailedBanner />
        <ErrorBoundary key={screen.name} onReset={() => navigate({ name: 'top' })}>
          {screen.name === 'top' && <TopScreen />}
          {screen.name === 'mode' && <ModeSelect />}
          {screen.name === 'setup' && <SetupScreen mode={screen.mode} />}
          {inSession && screen.name === 'session' && <SessionScreen key={screen.plan.seed} plan={screen.plan} />}
          {screen.name === 'assessment' && <AssessmentScreen key={screen.plan.seed} plan={screen.plan} />}
          {screen.name === 'assessmentResult' && <AssessmentResultScreen assessmentId={screen.assessmentId} />}
          {screen.name === 'result' && <ResultScreen sessionId={screen.sessionId} backTo={screen.backTo} />}
          {screen.name === 'history' && <HistoryScreen />}
          {screen.name === 'report' && <ReportScreen />}
          {screen.name === 'admin' && <AdminScreen />}
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default function App() {
  const tab = useSingleTab();

  if (tab.state === 'blocked') {
    return (
      <div className="tab-blocked">
        <div className="tab-blocked-card">
          <h1>別の画面で開いています</h1>
          <p>
            このアプリは、同じブラウザの別のタブ（またはウィンドウ）ですでに開かれています。
            2か所で同時に使うと記録が消えることがあるため、こちらの画面では操作できません。
          </p>
          <p className="sub">先に開いている画面を使うか、そちらを閉じてから下のボタンを押してください。</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={tab.recheck}>
            もう一度確認する
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
