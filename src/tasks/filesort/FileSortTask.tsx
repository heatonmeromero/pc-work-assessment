import { useMemo, useRef, useState } from 'react';
import type { TaskComponentProps } from '../taskModule';
import type { FsExt, FsFile, FsFolder, FsProblem } from './generator';
import { emptyFsOps } from './score';
import type { FsAnswer, FsOps } from './score';

const EXT_COLORS: Record<FsExt, string> = {
  pdf: '#b3261e',
  xlsx: '#15803d',
  docx: '#2563eb',
  jpg: '#7c3aed',
  csv: '#0e7490',
};

// チップとフォルダ箱はコンポーネントの外で定義する。
// （内側で定義すると毎レンダーで別型になり全チップが再マウントされ、
//   ドラッグ中の dragend が失われて「迷い」の記録が欠ける）

interface ChipProps {
  file: FsFile;
  selected: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onDragStartChip: (e: React.DragEvent, id: string) => void;
  onDragEndChip: () => void;
}

function FileChipView({ file, selected, disabled, onSelect, onDragStartChip, onDragEndChip }: ChipProps) {
  return (
    <button
      type="button"
      className={'fs-file' + (selected ? ' selected' : '')}
      draggable={!disabled}
      disabled={disabled}
      onDragStart={(e) => onDragStartChip(e, file.id)}
      onDragEnd={onDragEndChip}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(file.id);
      }}
      aria-pressed={selected}
      title={file.name}
    >
      <span className="fs-badge" style={{ background: EXT_COLORS[file.ext] }}>
        {file.ext}
      </span>
      <span className="fs-name">{file.name}</span>
    </button>
  );
}

interface ZoneHandlers {
  onDragOver: (e: React.DragEvent, zoneId: string | null) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, zoneId: string | null) => void;
}

interface FolderBoxProps {
  folder: FsFolder;
  files: FsFile[];
  hovered: boolean;
  clickable: boolean;
  disabled: boolean;
  selectedId: string | null;
  zone: ZoneHandlers;
  onZoneClick: (zoneId: string | null) => void;
  chipHandlers: Pick<ChipProps, 'onSelect' | 'onDragStartChip' | 'onDragEndChip'>;
}

function FolderBoxView({ folder, files, hovered, clickable, disabled, selectedId, zone, onZoneClick, chipHandlers }: FolderBoxProps) {
  return (
    <div
      className={
        'fs-folder' +
        (folder.isTrash ? ' fs-trash' : '') +
        (hovered ? ' fs-hover' : '') +
        (clickable ? ' fs-clickable' : '')
      }
      onDragOver={(e) => zone.onDragOver(e, folder.id)}
      onDragLeave={zone.onDragLeave}
      onDrop={(e) => zone.onDrop(e, folder.id)}
      onClick={() => onZoneClick(folder.id)}
      role="group"
      aria-label={`フォルダ ${folder.name}（${files.length}個）`}
    >
      <div className="fs-folder-head">
        <span className="fs-folder-icon" aria-hidden="true">{folder.isTrash ? '🗑' : '📁'}</span>
        <span className="fs-folder-name">{folder.name}</span>
        <span className="fs-folder-count">{files.length}</span>
      </div>
      {files.length > 0 && (
        <div className="fs-folder-files">
          {files.map((f) => (
            <FileChipView
              key={f.id}
              file={f}
              selected={selectedId === f.id}
              disabled={disabled}
              {...chipHandlers}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ファイル整理課題のUI（疑似ファイルマネージャー。実OSのファイルは触らない）。
 * ・ドラッグ＆ドロップでフォルダへ分類。クリックで選んでフォルダをクリックでも移動できる。
 * ・迷い（同じ場所へ戻す・ドラッグ中断）と置きなおしを記録する。
 */
export function FileSortTask({ problem, disabled, onSubmit }: TaskComponentProps<FsProblem, FsAnswer>) {
  const [placements, setPlacements] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(problem.files.map((f) => [f.id, null]))
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [hoverZone, setHoverZone] = useState<string | null>(null);
  const opsRef = useRef<FsOps>(emptyFsOps());
  const dragIdRef = useRef<string | null>(null);
  const droppedRef = useRef(false);
  const submittedRef = useRef(false);

  const fileById = useMemo(() => new Map(problem.files.map((f) => [f.id, f])), [problem.files]);
  const topFolders = problem.folders.filter((f) => !f.parent);
  const childrenOf = (id: string) => problem.folders.filter((f) => f.parent === id);
  const isLeaf = (f: FsFolder) => childrenOf(f.id).length === 0;

  const move = (fileId: string, target: string | null) => {
    if (disabled) return;
    const current = placements[fileId] ?? null;
    if (current === target) {
      // 同じ場所へ戻した＝迷いとして記録（ペナルティ表示はしない）
      opsRef.current.hesitations++;
      return;
    }
    if (current !== null) opsRef.current.removes++;
    opsRef.current.totalMoves++;
    setPlacements((prev) => ({ ...prev, [fileId]: target }));
  };

  const onDragStartChip = (e: React.DragEvent, fileId: string) => {
    if (disabled) return;
    dragIdRef.current = fileId;
    droppedRef.current = false;
    e.dataTransfer.setData('text/plain', fileId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragEndChip = () => {
    if (dragIdRef.current && !droppedRef.current) {
      opsRef.current.hesitations++; // ドラッグを途中でやめた
    }
    dragIdRef.current = null;
    setHoverZone(null);
  };

  const zone: ZoneHandlers = {
    onDragOver: (e, zoneId) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const key = zoneId ?? 'unsorted';
      if (hoverZone !== key) setHoverZone(key);
    },
    onDragLeave: (e) => {
      if (e.currentTarget === e.target) setHoverZone(null);
    },
    onDrop: (e, zoneId) => {
      e.preventDefault();
      e.stopPropagation();
      const fileId = e.dataTransfer.getData('text/plain') || dragIdRef.current;
      if (fileId && fileById.has(fileId)) {
        droppedRef.current = true;
        move(fileId, zoneId);
      }
      setHoverZone(null);
    },
  };

  const onZoneClick = (zoneId: string | null) => {
    if (disabled || selected == null) return;
    move(selected, zoneId);
    setSelected(null);
  };

  const onSelect = (fileId: string) => {
    setSelected((cur) => (cur === fileId ? null : fileId));
  };

  const submit = () => {
    if (disabled || submittedRef.current) return;
    submittedRef.current = true;
    onSubmit({ placements: { ...placements }, ops: { ...opsRef.current } }, { editCount: opsRef.current.removes });
  };

  const filesIn = (zoneId: string | null) => problem.files.filter((f) => (placements[f.id] ?? null) === zoneId);
  const unsortedFiles = filesIn(null);
  const chipHandlers = { onSelect, onDragStartChip, onDragEndChip };

  return (
    <div className="task-filesort">
      <div className="fs-rule" aria-label="分けかたのルール">
        <div className="fs-rule-title">分けかたのルール</div>
        <ul>
          {problem.ruleLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="fs-layout">
        <div
          className={'fs-unsorted' + (hoverZone === 'unsorted' ? ' fs-hover' : '')}
          onDragOver={(e) => zone.onDragOver(e, null)}
          onDragLeave={zone.onDragLeave}
          onDrop={(e) => zone.onDrop(e, null)}
          onClick={() => onZoneClick(null)}
          aria-label={`未整理のファイル（${unsortedFiles.length}個）`}
        >
          <div className="fs-unsorted-head">未整理（のこり {unsortedFiles.length} 個）</div>
          <div className="fs-unsorted-files">
            {unsortedFiles.map((f) => (
              <FileChipView key={f.id} file={f} selected={selected === f.id} disabled={disabled} {...chipHandlers} />
            ))}
            {unsortedFiles.length === 0 && <span className="sub">すべて移しました</span>}
          </div>
        </div>

        <div className="fs-folders">
          {topFolders.map((folder) =>
            isLeaf(folder) ? (
              <FolderBoxView
                key={folder.id}
                folder={folder}
                files={filesIn(folder.id)}
                hovered={hoverZone === folder.id}
                clickable={selected != null}
                disabled={disabled}
                selectedId={selected}
                zone={zone}
                onZoneClick={onZoneClick}
                chipHandlers={chipHandlers}
              />
            ) : (
              <div className="fs-parent" key={folder.id}>
                <div className="fs-parent-name">📂 {folder.name}</div>
                <div className="fs-parent-children">
                  {childrenOf(folder.id).map((child) => (
                    <FolderBoxView
                      key={child.id}
                      folder={child}
                      files={filesIn(child.id)}
                      hovered={hoverZone === child.id}
                      clickable={selected != null}
                      disabled={disabled}
                      selectedId={selected}
                      zone={zone}
                      onZoneClick={onZoneClick}
                      chipHandlers={chipHandlers}
                    />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <div className="sf-footer">
        <span className="sf-changed-count">
          {selected != null ? '移したいフォルダをクリックしてください' : 'ファイルはドラッグ、またはクリックで選んでから移せます'}
        </span>
        <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={disabled}>
          整理おわり{unsortedFiles.length > 0 ? `（のこり${unsortedFiles.length}個）` : ''}
        </button>
      </div>
    </div>
  );
}
