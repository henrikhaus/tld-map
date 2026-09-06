'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Run } from '@/lib/model';

export default function RunControls({
  run,
  runs,
  onUpdate,
  onSelect,
  onCreate,
  onDelete,
}: {
  run: Run;
  runs: Run[];
  onUpdate: (patch: Partial<Run>) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (run: Run) => void;
}) {
  const [editing, setEditing] = useState(false),
    [name, setName] = useState('');
  const cancelled = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) nameInput.current?.focus();
  }, [editing]);
  const finish = () => {
    if (!cancelled.current && name.trim()) onUpdate({ name: name.trim() });
    setEditing(false);
  };
  return (
    <div className="run-controls">
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
