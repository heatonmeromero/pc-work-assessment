// ファイル整理の採点とエラー分類
//
// ファイルごとに置かれたフォルダと正解フォルダを比較し、
// まちがいは「どの条件を取り違えたか」で分類する：
//   misfile_trash     : 不要ファイルの見分け（ゴミ箱に入れ忘れ／入れすぎ）
//   misfile_exception : 例外条件（「ただし〜」）の見落とし・適用しすぎ
//   misfile_year      : 年（日付）の取り違え
//   misfile_ext       : 種類（拡張子）の取り違え
//   misfile_other     : その他の置きまちがい
//   unsorted          : 未分類のまま
//
// 操作ログ（UI側で収集）:
//   hesitations: 同じ場所へ戻した・ドラッグを途中でやめた回数（迷い）
//   removes:     一度置いたファイルを置きなおした回数
//   totalMoves:  移動の総数

import type { TrialScore } from '../../types';
import type { FsProblem } from './generator';

export interface FsOps {
  hesitations: number;
  removes: number;
  totalMoves: number;
}

export function emptyFsOps(): FsOps {
  return { hesitations: 0, removes: 0, totalMoves: 0 };
}

export interface FsAnswer {
  placements: Record<string, string | null>;
  ops: FsOps;
}

export interface FsFileResult {
  name: string;
  placed: string | null; // フォルダ表示名
  correct: string; // フォルダ表示名
  ok: boolean;
  errors: string[];
}

export interface FsDetail {
  total: number;
  correctCount: number;
  unsorted: number;
  files: FsFileResult[];
  ops: FsOps;
}

export function scoreFileSort(problem: FsProblem, answer: FsAnswer): TrialScore {
  const placements = answer?.placements ?? {};
  const ops = answer?.ops ?? emptyFsOps();
  const folderById = new Map(problem.folders.map((f) => [f.id, f]));
  const folderName = (id: string | null): string | null => {
    if (id == null) return null;
    const f = folderById.get(id);
    if (!f) return id;
    const parent = f.parent ? folderById.get(f.parent) : undefined;
    return parent ? `${parent.name}＞${f.name}` : f.name;
  };

  const codes = new Set<string>();
  const files: FsFileResult[] = [];
  let correctCount = 0;
  let unsorted = 0;

  for (const file of problem.files) {
    const placedId = placements[file.id] ?? null;
    const errors: string[] = [];

    if (placedId === file.correctFolder) {
      correctCount++;
    } else if (placedId == null) {
      unsorted++;
      errors.push('unsorted');
    } else {
      const folder = folderById.get(placedId);
      if (!folder) {
        errors.push('misfile_other');
      } else if (folder.isTrash && !file.trash) {
        errors.push('misfile_trash'); // 必要なものを捨てた
      } else if (file.trash && !folder.isTrash) {
        errors.push('misfile_trash'); // 不要なものを捨て忘れた
      } else if (file.exception && !folder.isException) {
        errors.push('misfile_exception'); // 例外の見落とし
      } else if (!file.exception && folder.isException) {
        errors.push('misfile_exception'); // 例外の適用しすぎ
      } else {
        let explained = false;
        if (folder.year != null && folder.year !== file.year) {
          errors.push('misfile_year');
          explained = true;
        }
        if (folder.extGroup != null && folder.extGroup !== file.group) {
          errors.push('misfile_ext');
          explained = true;
        }
        if (!explained) errors.push('misfile_other');
      }
    }

    errors.forEach((e) => codes.add(e));
    files.push({
      name: file.name,
      placed: folderName(placedId),
      correct: folderName(file.correctFolder)!,
      ok: errors.length === 0,
      errors,
    });
  }

  return {
    correct: correctCount === problem.files.length,
    errorTypes: [...codes],
    detail: {
      total: problem.files.length,
      correctCount,
      unsorted,
      files,
      ops,
    } satisfies FsDetail,
  };
}
