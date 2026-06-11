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
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
