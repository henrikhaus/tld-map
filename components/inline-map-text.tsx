'use client';
import { useEffect, useRef } from 'react';
import type { Annotation } from '@/lib/model';

export default function InlineMapText({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Annotation;
  onChange: (draft: Annotation) => void;
  onSave: (draft: Annotation) => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null),
    finished = useRef(false);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  function save() {
    if (finished.current) return;
    finished.current = true;
    onSave(draft);
  }
  return (
    <textarea
      ref={input}
      className={`inline-map-text ${draft.shadow ? 'text-has-shadow' : ''}`}
      aria-label="Map text"
      value={draft.text ?? ''}
      maxLength={300}
      rows={Math.max(1, (draft.text ?? '').split('\n').length)}
      spellCheck={false}
      wrap="off"
      style={{
        color: draft.color,
        width: `${Math.max(3, Math.max(...(draft.text ?? '').split('\n').map((line) => line.length)) + 1)}ch`,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => {
        const next = { ...draft, text: event.target.value };
        if (!next.text) {
          finished.current = true;
          onSave(next);
        } else onChange(next);
      }}
      onBlur={save}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          save();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          finished.current = true;
          onCancel();
        }
      }}
    />
  );
}
