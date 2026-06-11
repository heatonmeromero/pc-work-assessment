import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppSettings, AssessmentPlan, AssessmentRecord, DataDoc, SessionPlan, SessionRecord, UserRecord } from '../types';
import { clearInflight, loadDoc, loadInflight, saveDoc } from './storage';

export type Screen =
  | { name: 'top' }
  | { name: 'mode' }
  | { name: 'setup'; mode: 'training' | 'adaptive' | 'assessment' }
  | { name: 'session'; plan: SessionPlan }
  | { name: 'assessment'; plan: AssessmentPlan }
  | { name: 'assessmentResult'; assessmentId: string }
  | { name: 'result'; sessionId: string; backTo?: Screen }
  | { name: 'history' }
  | { name: 'report' }
  | { name: 'admin' };

interface AppContextValue {
  doc: DataDoc;
  screen: Screen;
  navigate: (s: Screen) => void;
  currentUserId: string | null;
  setCurrentUser: (id: string | null) => void;
  addUser: (id: string) => string | null; // エラーメッセージ or null
  updateUser: (id: string, patch: Partial<UserRecord>) => void;
  deleteUser: (id: string) => void;
  saveSession: (rec: SessionRecord) => void;
  updateSession: (id: string, patch: Partial<SessionRecord>) => void;
  deleteSession: (id: string) => void;
  saveAssessment: (rec: AssessmentRecord) => void;
  updateAssessment: (id: string, patch: Partial<AssessmentRecord>) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  updateDefaults: (patch: Partial<AppSettings['defaults']>) => void;
  importData: (json: string) => { users: number; sessions: number } | string;
  clearAll: () => void;
  recoveredSessionId: string | null;
  dismissRecovered: () => void;
  /** 保存失敗（容量超過など）が起きたか。バナー表示用 */
  saveFailed: boolean;
  dismissSaveFailed: () => void;
  /** 画面離脱前の確認（未保存メモなど）。null で解除 */
  setNavGuard: (guard: { message: string } | null) => void;
}

const Ctx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppContext missing');
  return v;
}

/**
 * 起動時の保存データ読込＋中断セッションの復元。
 * レンダー中の副作用にしないため、モジュールスコープで一度だけ実行する
 * （StrictMode のレンダー破棄・二重実行があっても結果が変わらない）。
 */
let bootResult: { doc: DataDoc; recovered: string | null } | null = null;
function boot(): { doc: DataDoc; recovered: string | null } {
  if (bootResult) return bootResult;
  const doc = loadDoc();
  let recovered: string | null = null;
  const inflight = loadInflight();
  if (inflight && inflight.trials.length > 0 && !doc.sessions.some((s) => s.id === inflight.id)) {
    inflight.status = 'recovered';
    doc.sessions.push(inflight);
    saveDoc(doc);
    recovered = inflight.id;
  }
  clearInflight();
  bootResult = { doc, recovered };
  return bootResult;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<DataDoc>(() => boot().doc);
  const [screen, setScreen] = useState<Screen>({ name: 'top' });
  const [currentUserId, setCurrentUser] = useState<string | null>(null);
  const [recoveredSessionId, setRecovered] = useState<string | null>(() => boot().recovered);
  const [saveFailed, setSaveFailed] = useState(false);
  const saveFailedRef = useRef(false);
  const navGuardRef = useRef<{ message: string } | null>(null);

  const mutate = useCallback((fn: (d: DataDoc) => DataDoc) => {
    setDoc((prev) => {
      const next = fn(prev);
      if (!saveDoc(next)) saveFailedRef.current = true;
      return next;
    });
    // updaterは遅延実行されるため、反映後に失敗フラグを拾ってバナー表示する
    window.setTimeout(() => {
      if (saveFailedRef.current) {
        saveFailedRef.current = false;
        setSaveFailed(true);
      }
    }, 0);
  }, []);

  // 文字サイズをドキュメントに反映
  useEffect(() => {
    document.documentElement.dataset.fontscale = doc.settings.fontScale;
  }, [doc.settings.fontScale]);

  const navigate = useCallback((s: Screen) => {
    // 未保存メモなどがある場合は確認してから移動する
    if (navGuardRef.current && !window.confirm(navGuardRef.current.message)) return;
    navGuardRef.current = null;
    setScreen(s);
    window.scrollTo(0, 0);
  }, []);

  const setNavGuard = useCallback((guard: { message: string } | null) => {
    navGuardRef.current = guard;
  }, []);

  const dismissSaveFailed = useCallback(() => setSaveFailed(false), []);

  const addUser = useCallback(
    (rawId: string): string | null => {
      const id = rawId.trim();
      if (!id) return 'IDを入力してください';
      if (id.length > 20) return 'IDは20文字以内にしてください';
      let error: string | null = null;
      mutate((d) => {
        if (d.users.some((u) => u.id === id)) {
          error = 'そのIDは既に登録されています';
          return d;
        }
        const user: UserRecord = { id, createdAt: new Date().toISOString() };
        return { ...d, users: [...d.users, user] };
      });
      return error;
    },
    [mutate]
  );

  const updateUser = useCallback(
    (id: string, patch: Partial<UserRecord>) => {
      mutate((d) => ({
        ...d,
        users: d.users.map((u) => (u.id === id ? { ...u, ...patch } : u)),
      }));
    },
    [mutate]
  );

  const deleteUser = useCallback(
    (id: string) => {
      mutate((d) => ({
        ...d,
        users: d.users.filter((u) => u.id !== id),
        sessions: d.sessions.filter((s) => s.userId !== id),
        assessments: d.assessments.filter((a) => a.userId !== id),
      }));
      setCurrentUser((cur) => (cur === id ? null : cur));
    },
    [mutate]
  );

  const saveSession = useCallback(
    (rec: SessionRecord) => {
      mutate((d) =>
        d.sessions.some((s) => s.id === rec.id)
          ? { ...d, sessions: d.sessions.map((s) => (s.id === rec.id ? rec : s)) }
          : { ...d, sessions: [...d.sessions, rec] }
      );
    },
    [mutate]
  );

  const updateSession = useCallback(
    (id: string, patch: Partial<SessionRecord>) => {
      mutate((d) => ({
        ...d,
        sessions: d.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }));
    },
    [mutate]
  );

  const deleteSession = useCallback(
    (id: string) => {
      mutate((d) => ({ ...d, sessions: d.sessions.filter((s) => s.id !== id) }));
    },
    [mutate]
  );

  const saveAssessment = useCallback(
    (rec: AssessmentRecord) => {
      mutate((d) =>
        d.assessments.some((a) => a.id === rec.id)
          ? { ...d, assessments: d.assessments.map((a) => (a.id === rec.id ? rec : a)) }
          : { ...d, assessments: [...d.assessments, rec] }
      );
    },
    [mutate]
  );

  const updateAssessment = useCallback(
    (id: string, patch: Partial<AssessmentRecord>) => {
      mutate((d) => ({
        ...d,
        assessments: d.assessments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      }));
    },
    [mutate]
  );

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      mutate((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
    },
    [mutate]
  );

  const updateDefaults = useCallback(
    (patch: Partial<AppSettings['defaults']>) => {
      mutate((d) => ({ ...d, settings: { ...d.settings, defaults: { ...d.settings.defaults, ...patch } } }));
    },
    [mutate]
  );

  const importData = useCallback(
    (json: string): { users: number; sessions: number } | string => {
      try {
        const parsed = JSON.parse(json) as DataDoc;
        if (parsed.version !== 1 || !Array.isArray(parsed.users) || !Array.isArray(parsed.sessions)) {
          return 'ファイル形式が正しくありません（このアプリのJSONエクスポートを選んでください）';
        }
        // 件数を正しく返すため、マージは現在のdocスナップショットに対して
        // 事前に計算する（setStateのupdater内で数えると、updaterの実行が
        // 遅延されるため return 時点では常に0件になってしまう）
        let addedUsers = 0;
        let addedSessions = 0;
        const users = [...doc.users];
        for (const u of parsed.users) {
          if (u?.id && !users.some((x) => x.id === u.id)) {
            users.push(u);
            addedUsers++;
          }
        }
        const sessions = [...doc.sessions];
        for (const s of parsed.sessions) {
          if (s?.id && !sessions.some((x) => x.id === s.id)) {
            sessions.push(s);
            addedSessions++;
            if (!users.some((x) => x.id === s.userId)) {
              users.push({ id: s.userId, createdAt: s.startedAt });
              addedUsers++;
            }
          }
        }
        const assessments = [...doc.assessments];
        for (const a of parsed.assessments ?? []) {
          if (a?.id && !assessments.some((x) => x.id === a.id)) assessments.push(a);
        }
        const next = { ...doc, users, sessions, assessments };
        mutate(() => next);
        return { users: addedUsers, sessions: addedSessions };
      } catch {
        return 'JSONの読み込みに失敗しました';
      }
    },
    [mutate, doc]
  );

  const clearAll = useCallback(() => {
    mutate(() => ({ version: 1, users: [], sessions: [], assessments: [], settings: doc.settings }));
  }, [mutate, doc.settings]);

  const dismissRecovered = useCallback(() => setRecovered(null), []);

  const value = useMemo<AppContextValue>(
    () => ({
      doc,
      screen,
      navigate,
      currentUserId,
      setCurrentUser,
      addUser,
      updateUser,
      deleteUser,
      saveSession,
      updateSession,
      deleteSession,
      saveAssessment,
      updateAssessment,
      updateSettings,
      updateDefaults,
      importData,
      clearAll,
      recoveredSessionId,
      dismissRecovered,
      saveFailed,
      dismissSaveFailed,
      setNavGuard,
    }),
    [doc, screen, navigate, currentUserId, addUser, updateUser, deleteUser, saveSession, updateSession, deleteSession, saveAssessment, updateAssessment, updateSettings, updateDefaults, importData, clearAll, recoveredSessionId, dismissRecovered, saveFailed, dismissSaveFailed, setNavGuard]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
