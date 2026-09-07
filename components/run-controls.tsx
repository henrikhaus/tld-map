'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Plus,
  Trash2,
  Download,
  Upload,
  ArrowDownUp,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import type { Run } from '@/lib/model';
import {
  exportRun,
  parseRunFile,
  MAX_RUN_FILE_BYTES,
} from '@/lib/run-transfer';

export default function RunControls({
  run,
  runs,
  onUpdate,
  onSelect,
  onCreate,
  onDelete,
  onImport,
  onNotice,
}: {
  run: Run;
  runs: Run[];
  onUpdate: (patch: Partial<Run>) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (run: Run) => void;
  onImport: (run: Run) => void;
  onNotice: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false),
    [name, setName] = useState('');
  const cancelled = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  function downloadRun() {
    try {
      const { content, filename } = exportRun(run);
      const url = URL.createObjectURL(
        new Blob([content], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : 'Could not export this run.',
      );
    }
  }
  async function importFile(file: File) {
    setImporting(true);
    try {
      if (file.size > MAX_RUN_FILE_BYTES)
        throw new Error('Choose a run file smaller than 10 MB.');
      onImport(parseRunFile(await file.text()));
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : 'Could not import this run.',
      );
    } finally {
      setImporting(false);
    }
  }
  useEffect(() => {
    if (editing) nameInput.current?.focus();
  }, [editing]);
  const finish = () => {
    if (!cancelled.current && name.trim()) onUpdate({ name: name.trim() });
    setEditing(false);
  };
  return (
    <div className="run-controls">
      <input
        ref={importInput}
        type="file"
        accept=".json,application/json"
        aria-label="Import run file"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void importFile(file);
        }}
      />
      <div className="run-name-row">
        {editing ? (
          <input
            ref={nameInput}
            className="run-name-input"
            aria-label="Run name"
            maxLength={60}
            value={name}
            onFocus={(event) => event.target.select()}
            onChange={(event) => setName(event.target.value)}
            onBlur={finish}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                cancelled.current = true;
                event.currentTarget.blur();
              }
            }}
          />
        ) : (
          <button
            className="run-name"
            title="Rename run"
            onClick={() => {
              cancelled.current = false;
              setName(run.name);
              setEditing(true);
            }}
          >
            {run.name}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="run-swap"
            aria-label="Switch run"
            title="Switch run"
          >
            <ArrowLeftRight size={17} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            finalFocus={() => nameInput.current ?? true}
            className="journal-dropdown run-dropdown"
            align="start"
          >
            {runs.map((other) => (
              <div className="run-option" key={other.id}>
                <DropdownMenuItem
                  onClick={() => {
                    setEditing(false);
                    onSelect(other.id);
                  }}
                  className="run-option-name"
                >
                  <span className="run-option-check">
                    {other.id === run.id && <Check size={14} />}
                  </span>
                  <span>{other.name}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="run-option-delete"
                  aria-label={`Delete ${other.name}`}
                  onClick={() => onDelete(other)}
                >
                  <Trash2 size={13} />
                </DropdownMenuItem>
              </div>
            ))}
            <DropdownMenuItem
              disabled={runs.length >= 100}
              className="new-run-option"
              onClick={() => {
                onCreate();
                cancelled.current = false;
                setName('My run');
                setEditing(true);
              }}
            >
              <Plus size={15} />
              New run
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="run-transfer-option">
                <ArrowDownUp size={14} /> Import / export
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="journal-dropdown">
                <DropdownMenuItem onClick={downloadRun}>
                  <Download size={14} /> Export current run
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={importing || runs.length >= 100}
                  onClick={() => importInput.current?.click()}
                >
                  <Upload size={14} /> Import run as a copy
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="run-difficulty"
          aria-label={`Change difficulty, currently ${run.difficulty}`}
        >
          {run.difficulty}
          <ChevronDown size={12} />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="journal-dropdown difficulty-dropdown">
          {(
            [
              'Interloper',
              'Misery',
              'Pilgrim',
              'Voyageur',
              'Stalker',
              'Custom',
            ] as const
          ).map((difficulty) => (
            <DropdownMenuItem
              key={difficulty}
              onClick={() => onUpdate({ difficulty })}
            >
              <span className="run-option-check">
                {run.difficulty === difficulty && <Check size={14} />}
              </span>
              {difficulty}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
