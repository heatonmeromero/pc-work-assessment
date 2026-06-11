import type { AppSettings, DataDoc, SessionRecord } from '../types';

const KEY = 'pcwa:data:v1';
const INFLIGHT_KEY = 'pcwa:inflight:v1';
const CORRUPT_KEY = 'pcwa:corrupt-backup';

export function defaultSettings(): AppSettings {
  return {
    fontScale: 'm',
    defaults: {
      nUp: 3,
      mWindow: 3,
      kDown: 2,
      reversalTarget: 4,
      feedback: true,
      practice: true,
    },
  };
}

export function emptyDoc(): DataDoc {
  return { version: 1, users: [], sessions: [], assessments: [], settings: defaultSettings() };
}

export function loadDoc(): DataDoc {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDoc();
    const parsed = JSON.parse(raw) as DataDoc;
    if (parsed.version !== 1 || !Array.isArray(parsed.users) || !Array.isArray(parsed.sessions)) {
      throw new Error('invalid doc');
    }
    // 旧バージョンのデータ・設定の欠損をデフォルトで補完
    if (!Array.isArray(parsed.assessments)) parsed.assessments = [];
    parsed.settings = { ...defaultSettings(), ...parsed.settings, defaults: { ...defaultSettings().defaults, ...(parsed.settings?.defaults ?? {}) } };
    return parsed;
  } catch {
    // 壊れたデータは退避してまっさらで起動（消さない）
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try {
        localStorage.setItem(CORRUPT_KEY, raw);
      } catch {
        /* ignore */
      }
    }
    return emptyDoc();
  }
}

/** 保存。容量超過などで失敗したら false（呼び出し側で利用者に知らせる） */
export function saveDoc(doc: DataDoc): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

/** 現在の保存データのおおよそのバイト数（localStorageはUTF-16のため文字数×2） */
export function storageUsageBytes(): number {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? raw.length * 2 : 0;
  } catch {
    return 0;
  }
}

/** localStorageのおおよその上限（ブラウザにより異なるが5MBが一般的） */
export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

/** 実施中セッションの逐次保存（ブラウザ強制終了からの復元用） */
export function saveInflight(rec: SessionRecord): void {
  try {
    localStorage.setItem(INFLIGHT_KEY, JSON.stringify(rec));
  } catch {
    /* 容量超過などは無視（本保存はセッション終了時に行う） */
  }
}

export function loadInflight(): SessionRecord | null {
  try {
    const raw = localStorage.getItem(INFLIGHT_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as SessionRecord;
    if (!rec.id || !Array.isArray(rec.trials)) return null;
    return rec;
  } catch {
    return null;
  }
}

export function clearInflight(): void {
  localStorage.removeItem(INFLIGHT_KEY);
}
