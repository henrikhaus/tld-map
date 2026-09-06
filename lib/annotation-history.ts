import type { Annotation } from './model';

export type AnnotationHistory = {
  past: Annotation[][];
  present: Annotation[];
  future: Annotation[][];
};
export type HistoryAction =
  | { type: 'commit'; annotations: Annotation[] }
  | { type: 'undo' }
  | { type: 'redo' };

export function changeAnnotationHistory(
  state: AnnotationHistory,
  action: HistoryAction,
): AnnotationHistory {
  if (action.type === 'commit') {
    if (action.annotations === state.present) return state;
    return {
      past: [...state.past.slice(-39), state.present],
      present: action.annotations,
      future: [],
    };
  }
  if (action.type === 'undo') {
    if (!state.past.length) return state;
    return {
      past: state.past.slice(0, -1),
      present: state.past[state.past.length - 1],
      future: [state.present, ...state.future],
    };
  }
  if (!state.future.length) return state;
  return {
    past: [...state.past, state.present],
    present: state.future[0],
    future: state.future.slice(1),
  };
}
