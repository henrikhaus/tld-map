'use client';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Hand,
  MessageSquare,
  Pencil,
  Type,
  MapPin,
  Eraser,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Plus,
  Minus,
  Maximize,
  Home,
  Flame,
  TriangleAlert,
  Package,
  Flag,
  Footprints,
  LoaderCircle,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  COLORS,
  markerKinds,
  type Annotation,
  type MapAsset,
  type Point,
  type Tool,
  type LootEntry,
} from '@/lib/model';
import InlineMapText from './inline-map-text';
import {
  draggedLabel,
  saveMapText,
  brushFromSlider,
  sliderFromBrush,
  isEraserClick,
} from '@/lib/map-annotations';
import MapPaint from './map-paint';
import { advanceMapGesture } from '@/lib/map-gesture';
import MapEraserPreview from './map-eraser-preview';
import { findEraserTarget, type EraserTarget } from '@/lib/map-eraser';
import {
  changeAnnotationHistory,
  type AnnotationHistory,
  type HistoryAction,
} from '@/lib/annotation-history';
import ToolNumber from './tool-number';
import {
  constrainView,
  panView,
  rememberView,
  restoreView,
  type MapView,
} from '@/lib/map-view';
export const markerIcons = {
  shelter: Home,
  fire: Flame,
  danger: TriangleAlert,
  supplies: Package,
  destination: Flag,
  hunting: Footprints,
};
const toolConfig = [
  { id: 'hand', label: 'Pan map', key: 'V', icon: Hand },
  { id: 'draw', label: 'Draw', key: 'D', icon: Pencil },
  { id: 'text', label: 'Write on map', key: 'T', icon: Type },
  { id: 'comment', label: 'Place a comment', key: 'N', icon: MessageSquare },
  { id: 'marker', label: 'Place an icon', key: 'M', icon: MapPin },
  { id: 'erase', label: 'Erase an annotation', key: 'E', icon: Eraser },
] as const;
const instruction: Record<Tool, string> = {
  hand: 'SCROLL TO ZOOM · DRAG TO EXPLORE',
  draw: 'DRAG TO DRAW · SPACE TO PAN',
  text: 'CLICK THE MAP TO WRITE',
  comment: 'CLICK THE MAP TO LEAVE A COMMENT',
  marker: 'CLICK A POINT TO PLACE AN ICON',
  erase: 'CLICK A HIGHLIGHTED ANNOTATION TO ERASE',
};
export function ToolButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            className={active ? 'active' : ''}
            onClick={onClick}
            disabled={disabled}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
export type EditorHandle = {
  edit: (annotation: Annotation) => void;
  focus: (annotation: Annotation) => void;
  setTool: (tool: Tool) => void;
};
export default function MapEditor({
  asset,
  annotations,
  onChange,
  pendingLoot,
  onPlaced,
  editorRef,
  worldLinks,
  initialFocus,
  charcoal = false,
  onToggleCharcoal,
  initialView,
  onViewChange,
}: {
  charcoal?: boolean;
  onToggleCharcoal?: () => void;
  initialView?: MapView;
  onViewChange?: (view: MapView) => void;
  asset: MapAsset;
  annotations: Annotation[];
  onChange: (next: Annotation[]) => void;
  pendingLoot: LootEntry | null;
  onPlaced: () => void;
  editorRef: React.RefObject<EditorHandle | null>;
  initialFocus?: Annotation | null;
  worldLinks?: {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    onClick: () => void;
  }[];
}) {
  const canvas = useRef<HTMLDivElement>(null),
    viewport = useRef({ width: 800, height: 600 }),
    viewRef = useRef({ x: 0, y: 0, scale: 0.15 });
  const [view, setViewState] = useState({ x: 0, y: 0, scale: 0.15 }),
    [tool, setTool] = useState<Tool>('hand'),
    [color, setColor] = useState(COLORS[0]),
    [brush, setBrush] = useState(3),
    [opacity, setOpacity] = useState(1),
    [textShadow, setTextShadow] = useState(false),
    [iconCircle, setIconCircle] = useState(false),
    [cursor, setCursor] = useState<Point | null>(null),
    [panning, setPanning] = useState(false),
    [eraseTarget, setEraseTarget] = useState<EraserTarget | null>(null),
    [movedLabel, setMovedLabel] = useState<Annotation | null>(null),
    [marker, setMarker] = useState<Annotation['icon']>('shelter');
  const [visible, setVisible] = useState(true),
    [loaded, setLoaded] = useState(false),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0),
    [draft, setDraft] = useState<Annotation | null>(null),
    [editing, setEditing] = useState<Annotation | null>(
      initialFocus?.type !== 'draw' ? (initialFocus ?? null) : null,
    ),
    [timeline, setTimeline] = useState<AnnotationHistory>({
      past: [],
      present: annotations,
      future: [],
    });
  const historyRef = useRef(timeline);
  const history = timeline.past,
    future = timeline.future;
  useEffect(() => {
    setEraseTarget(null);
  }, [tool, visible]);
  const dismissTextClick = useRef(false);
  const drag = useRef<{
      mode: 'pan' | 'draw' | 'label' | 'place' | 'erase' | 'activate';
      eraseId?: string;
      label?: Annotation;
      moved?: boolean;
      x: number;
      y: number;
      points: Point[];
    } | null>(null),
    space = useRef(false),
    current = useRef(annotations);
  useEffect(() => {
    current.current = annotations;
  }, [annotations]);
  const viewReady = useRef(false),
    savedView = useRef(initialView),
    saveViewCallback = useRef(onViewChange),
    viewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  saveViewCallback.current = onViewChange;
  const persistView = useCallback(() => {
    if (!viewTimer.current) return;
    clearTimeout(viewTimer.current);
    viewTimer.current = null;
    if (viewReady.current)
      saveViewCallback.current?.(
        rememberView(viewRef.current, viewport.current),
      );
  }, []);
  const setView = useCallback(
    (value: typeof view) => {
      const next = constrainView(value, asset, viewport.current);
      viewRef.current = next;
      setViewState(next);
      if (viewReady.current) {
        if (viewTimer.current) clearTimeout(viewTimer.current);
        viewTimer.current = setTimeout(persistView, 250);
      }
    },
    [asset, persistView],
  );
  useEffect(() => {
    window.addEventListener('pagehide', persistView);
    return () => {
      window.removeEventListener('pagehide', persistView);
      persistView();
    };
  }, [persistView]);
  const fit = useCallback(() => {
    const size = viewport.current;
    const scale =
      Math.min(size.width / asset.width, size.height / asset.height) * 0.95;
    setView({
      x: (size.width - asset.width * scale) / 2,
      y: (size.height - asset.height * scale) / 2,
      scale,
    });
  }, [asset, setView]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, entry.contentRect.width);
      const height = Math.max(1, entry.contentRect.height);
      if (
        viewReady.current &&
        width === viewport.current.width &&
        height === viewport.current.height
      )
        return;
      const previous = viewReady.current
        ? rememberView(viewRef.current, viewport.current)
        : savedView.current;
      viewport.current = {
        width,
        height,
      };
      if (!viewReady.current && initialFocus) {
        const scale = 0.6;
        setView({
          x: viewport.current.width / 2 - initialFocus.x * scale,
          y: viewport.current.height / 2 - initialFocus.y * scale,
          scale,
        });
      } else if (previous)
        setView(restoreView(previous, asset, viewport.current));
      else fit();
      viewReady.current = true;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit, initialFocus, setView, asset]);
  const applyHistory = useCallback(
    (action: HistoryAction) => {
      const previous = { ...historyRef.current, present: current.current };
      const next = changeAnnotationHistory(previous, action);
      if (next === previous) return;
      // Capture the whole transition before React can defer or replay a render.
      historyRef.current = next;
      current.current = next.present;
      setTimeline(next);
      onChange(next.present);
    },
    [onChange],
  );
  const commit = useCallback(
    (annotations: Annotation[]) => {
      applyHistory({ type: 'commit', annotations });
    },
    [applyHistory],
  );
  const undo = useCallback(() => {
    applyHistory({ type: 'undo' });
  }, [applyHistory]);
  const redo = useCallback(() => {
    applyHistory({ type: 'redo' });
  }, [applyHistory]);
  const focus = useCallback(
    (annotation: Annotation) => {
      const scale = Math.max(viewRef.current.scale, 0.6);
      setView({
        x: viewport.current.width / 2 - annotation.x * scale,
        y: viewport.current.height / 2 - annotation.y * scale,
        scale,
      });
    },
    [setView],
  );
  useImperativeHandle(
    editorRef,
    () => ({
      edit: (a: Annotation) => {
        focus(a);
        setEditing(a);
      },
      focus,
      setTool,
    }),
    [focus],
  );
  useEffect(() => {
    if (pendingLoot) {
      setTool('marker');
      setMarker('supplies');
      setVisible(true);
    }
  }, [pendingLoot]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"],[role="dialog"]',
        )
      )
        return;
      if (e.code === 'Space') {
        if ((e.target as HTMLElement).closest('button,a')) return;
        e.preventDefault();
        space.current = true;
      }
      if (e.key === 'Escape') {
        setTool('hand');
        setEditing(null);
        onPlaced();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (!(e.metaKey || e.ctrlKey || e.altKey)) {
        const next = toolConfig.find(
          (t) => t.key.toLowerCase() === e.key.toLowerCase(),
        );
        if (next) {
          setTool(next.id);
          if (next.id !== 'hand') setVisible(true);
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    const blur = () => {
      space.current = false;
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [undo, redo, onPlaced]);
  const zoom = useCallback(
    (factor: number, anchor?: Point) => {
      const prev = viewRef.current;
      const p = anchor ?? {
        x: viewport.current.width / 2,
        y: viewport.current.height / 2,
      };
      const fitScale = Math.min(
        viewport.current.width / asset.width,
        viewport.current.height / asset.height,
      );
      const scale = Math.max(fitScale * 0.3, Math.min(4, prev.scale * factor));
      setView({
        x: p.x - ((p.x - prev.x) * scale) / prev.scale,
        y: p.y - ((p.y - prev.y) * scale) / prev.scale,
        scale,
      });
    },
    [asset, setView],
  );
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,[data-controls]'))
        return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * 0.0015), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoom]);
  const focusComment = useCallback((element: HTMLTextAreaElement | null) => {
    requestAnimationFrame(() => {
      if (element?.isConnected) {
        element.focus();
        element.select();
      }
    });
  }, []);
  function point(event: React.PointerEvent): Point {
    const r = canvas.current!.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: Math.max(
        0,
        Math.min(asset.width, (event.clientX - r.left - v.x) / v.scale),
      ),
      y: Math.max(
        0,
        Math.min(asset.height, (event.clientY - r.top - v.y) / v.scale),
      ),
    };
  }
  function inside(event: React.PointerEvent) {
    const r = canvas.current!.getBoundingClientRect(),
      v = viewRef.current;
    const x = (event.clientX - r.left - v.x) / v.scale,
      y = (event.clientY - r.top - v.y) / v.scale;
    return x >= 0 && y >= 0 && x <= asset.width && y <= asset.height;
  }
  function eraserTargetAt(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('input,textarea,[data-controls]'))
      return null;
    const viewport = canvas.current!.getBoundingClientRect();
    const labels = Array.from(
      canvas.current!.querySelectorAll<HTMLElement>('[data-annotation-id]'),
    ).map((element) => {
      const bounds = (
        element.querySelector('button') ?? element
      ).getBoundingClientRect();
      return {
        id: element.dataset.annotationId!,
        bounds: {
          left: bounds.left - viewport.left,
          right: bounds.right - viewport.left,
          top: bounds.top - viewport.top,
          bottom: bounds.bottom - viewport.top,
        },
      };
    });
    return findEraserTarget(
      current.current,
      { x: event.clientX - viewport.left, y: event.clientY - viewport.top },
      viewRef.current,
      labels,
    );
  }
  function beginInteraction(event: React.PointerEvent<HTMLDivElement>) {
    dismissTextClick.current = false;
    if (
      editing?.type === 'text' &&
      !(event.target as HTMLElement).closest('textarea,input,[data-controls]')
    ) {
      event.preventDefault();
      event.stopPropagation();
      dismissTextClick.current = true;
      saveInline(editing);
      if (loaded && !failed && event.button === 0) {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          mode: 'place',
          x: event.clientX,
          y: event.clientY,
          points: [],
        };
      }
      return;
    }
    if (!loaded || failed || space.current || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('input,textarea,[data-controls]'))
      return;
    if (tool !== 'erase') {
      const id = (event.target as Element).closest<HTMLElement>(
        '[data-annotation-id]',
      )?.dataset.annotationId;
      const annotation = current.current.find((a) => a.id === id);
      if (tool === 'draw' || !annotation || annotation.type === 'text') return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dismissTextClick.current = true;
      drag.current = {
        mode: 'activate',
        label: annotation,
        x: event.clientX,
        y: event.clientY,
        points: [],
      };
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const target = visible ? eraserTargetAt(event) : null;
    drag.current = {
      mode: 'erase',
      eraseId: target?.annotation.id,
      x: event.clientX,
      y: event.clientY,
      points: [point(event)],
    };
    dismissTextClick.current = true;
    setEraseTarget(target);
  }
  function begin(event: React.PointerEvent<HTMLDivElement>) {
    if (!loaded || failed) return;
    if (
      (event.target as HTMLElement).closest(
        'button,input,textarea,[data-controls]',
      )
    )
      return;
    if (event.button !== 0 && event.button !== 1) return;
    if (tool === 'hand' || space.current || event.button === 1) {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        mode: 'pan',
        x: event.clientX,
        y: event.clientY,
        points: [],
      };
      setPanning(true);
      return;
    }
    if (!inside(event)) {
      if (tool !== 'draw') {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          mode: 'place',
          x: event.clientX,
          y: event.clientY,
          points: [],
        };
      }
      return;
    }
    const p = point(event);
    setVisible(true);
    const base = {
      id: crypto.randomUUID(),
      color,
      x: p.x,
      y: p.y,
      createdAt: new Date().toISOString(),
    };
    if (tool === 'draw') {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        mode: 'draw',
        x: event.clientX,
        y: event.clientY,
        points: [p],
      };
      setDraft({
        ...base,
        type: 'draw',
        points: [p],
        width: brush / view.scale,
        opacity,
      });
    } else if (tool === 'text' || tool === 'comment' || tool === 'marker') {
      // Mount the focused input after pointer-up so the initiating click cannot blur it.
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setCursor(null);
      drag.current = {
        mode: 'place',
        label:
          tool === 'marker'
            ? {
                ...base,
                type: 'marker',
                circle: iconCircle,
                icon: marker,
                title: pendingLoot
                  ? `${pendingLoot.item} · ${pendingLoot.location}`
                  : '',
                text: pendingLoot
                  ? `Loot reference: ${pendingLoot.region}. Listed in sets ${pendingLoot.sets.join(', ')}.`
                  : '',
                ...(pendingLoot ? { lootId: pendingLoot.id } : {}),
              }
            : { ...base, type: tool, title: '', text: '', shadow: textShadow },
        x: event.clientX,
        y: event.clientY,
        points: [],
      };
    }
  }
  function panGesture(event: React.PointerEvent<HTMLDivElement>) {
    const action = drag.current;
    if (!action || action.mode === 'draw' || action.mode === 'label')
      return false;
    const next = advanceMapGesture(
      { mode: action.mode, x: action.x, y: action.y },
      { x: event.clientX, y: event.clientY },
    );
    if (!next) return false;
    Object.assign(action, next.gesture);
    action.moved = true;
    dismissTextClick.current = true;
    setPanning(true);
    setCursor(null);
    setEraseTarget(null);
    setView(panView(viewRef.current, next.delta));
    return true;
  }
  function move(event: React.PointerEvent<HTMLDivElement>) {
    if (panGesture(event)) return;
    const rect = canvas.current!.getBoundingClientRect();
    const overControl = (event.target as HTMLElement).closest(
      'button,input,textarea,[data-controls],.map-annotation',
    );
    setCursor(
      loaded && !failed && inside(event) && !overControl
        ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
        : null,
    );
    const action = drag.current;
    if (tool === 'erase' && visible && loaded && !failed && !space.current) {
      setEraseTarget(eraserTargetAt(event) ?? null);
    } else setEraseTarget(null);
    if (!action) return;
    if (
      action.mode === 'erase' ||
      action.mode === 'place' ||
      action.mode === 'activate'
    )
      return;
    if (action.mode === 'label' && action.label) {
      const delta = {
        x: event.clientX - action.x,
        y: event.clientY - action.y,
      };
      if (Math.hypot(delta.x, delta.y) > 4 || action.moved) {
        action.moved = true;
        setMovedLabel(
          draggedLabel(action.label, delta, viewRef.current.scale, {
            x: asset.width,
            y: asset.height,
          }),
        );
      }
      return;
    }
    const p = point(event),
      last = action.points.at(-1)!;
    if (
      Math.hypot(p.x - last.x, p.y - last.y) > 1.5 / view.scale &&
      action.points.length < 20000
    ) {
      action.points.push(p);
      setDraft((d) => (d ? { ...d, points: [...action.points] } : null));
    }
  }
  function end(event: React.PointerEvent<HTMLDivElement>) {
    panGesture(event);
    const action = drag.current;
    if (action?.mode === 'place' && !action.moved && action.label) {
      if (editing) saveInline(editing);
      if (action.label.type === 'marker') {
        commit([...current.current, action.label]);
        onPlaced();
      } else setEditing(action.label);
    }
    if (action?.mode === 'activate' && action.label) activate(action.label);
    if (action?.mode === 'erase') {
      if (
        action.eraseId &&
        isEraserClick(
          action,
          { x: event.clientX, y: event.clientY },
          action.moved,
        ) &&
        eraserTargetAt(event)?.annotation.id === action.eraseId
      )
        commit(current.current.filter((item) => item.id !== action.eraseId));
      setEraseTarget(null);
    }
    if (action?.mode === 'label' && action.label) {
      if (action.moved) {
        const next = draggedLabel(
          action.label,
          { x: event.clientX - action.x, y: event.clientY - action.y },
          viewRef.current.scale,
          { x: asset.width, y: asset.height },
        );
        commit(
          current.current.map((item) => (item.id === next.id ? next : item)),
        );
      } else {
        setTool('text');
        setEditing(action.label);
      }
      setMovedLabel(null);
    }
    if (action?.mode === 'draw' && draft)
      commit([
        ...current.current,
        {
          ...draft,
          points:
            action.points.length === 1
              ? [
                  action.points[0],
                  {
                    x: action.points[0].x + 0.01,
                    y: action.points[0].y + 0.01,
                  },
                ]
              : action.points,
        },
      ]);
    if (action?.mode === 'pan') persistView();
    drag.current = null;
    setPanning(false);
    setDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function activate(a: Annotation) {
    if (tool === 'erase') {
      commit(current.current.filter((x) => x.id !== a.id));
      return;
    }
    if (a.type === 'text') setTool('text');
    setEditing(a);
  }
  function startLabelDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    annotation: Annotation,
  ) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (tool === 'erase') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      mode: 'label',
      label: annotation,
      x: event.clientX,
      y: event.clientY,
      points: [],
    };
  }
  function saveInline(draft: Annotation) {
    const next = saveMapText(current.current, draft);
    if (JSON.stringify(next) !== JSON.stringify(current.current)) commit(next);
    setEditing(null);
  }
  const paint = useMemo(
    () => [
      ...(visible ? annotations.filter((a) => a.type === 'draw') : []),
      ...(draft ? [draft] : []),
    ],
    [annotations, visible, draft],
  );
  const rendered = [
    ...(visible
      ? annotations
          .filter((a) => a.type !== 'note')
          .map((a) => (movedLabel?.id === a.id ? movedLabel : a))
      : []),
    ...(draft ? [draft] : []),
    ...(editing?.type === 'comment' &&
    !annotations.some((a) => a.id === editing.id)
      ? [editing]
      : []),
  ];
  const highlighted =
    tool === 'erase' && visible
      ? annotations.find((a) => a.id === eraseTarget?.annotation.id)
      : undefined;
  const PreviewIcon = markerIcons[marker ?? 'shelter'];
  return (
    <TooltipProvider delay={150}>
      <div
        ref={canvas}
        className={`map-canvas ${charcoal ? 'charcoal-map' : ''}`}
        aria-label="Interactive map. Use the toolbar to draw, write, or place icons."
        onPointerDownCapture={beginInteraction}
        onClickCapture={(event) => {
          if (dismissTextClick.current) {
            event.preventDefault();
            event.stopPropagation();
            dismissTextClick.current = false;
          }
        }}
        onPointerDown={begin}
        onPointerMoveCapture={move}
        onPointerLeave={() => {
          setCursor(null);
          setEraseTarget(null);
        }}
        onPointerUp={end}
        onPointerCancel={() => {
          dismissTextClick.current = false;
          drag.current = null;
          setPanning(false);
          setDraft(null);
          setMovedLabel(null);
          setEraseTarget(null);
          setCursor(null);
        }}
        style={{
          cursor: panning
            ? 'grabbing'
            : tool === 'hand'
              ? 'grab'
              : tool === 'erase'
                ? 'crosshair'
                : tool === 'text'
                  ? 'text'
                  : 'crosshair',
        }}
      >
        <div
          className="map-stage"
          style={{
            width: asset.width,
            height: asset.height,
            transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
          }}
        >
          {/* Full-resolution cartography must retain its original pixels and coordinates. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={retry}
            src={asset.src}
            width={asset.width}
            height={asset.height}
            alt="Detailed community region map for The Long Dark"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </div>
        <MapPaint strokes={paint} view={view} size={viewport.current} />
        <div
          className="map-annotation-stage"
          style={{
            width: asset.width,
            height: asset.height,
            transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
          }}
        >
          {rendered
            .filter(
              (a) =>
                a.type !== 'draw' &&
                (a.type === 'comment' || a.id !== editing?.id),
            )
            .map((a) => {
              const Icon =
                a.type === 'comment'
                  ? MessageSquare
                  : markerIcons[a.icon ?? 'destination'];
              return (
                <div
                  className={`map-annotation ${highlighted?.id === a.id ? 'erase-target' : ''}`}
                  key={a.id}
                  data-annotation-id={a.id}
                  style={{
                    left: a.x,
                    top: a.y,
                    transform: `scale(${1 / view.scale})`,
                  }}
                >
                  {a.type === 'text' ? (
                    <button
                      className={`annotation-text ${a.shadow ? 'text-has-shadow' : ''}`}
                      style={{ color: a.color }}
                      aria-label={`Edit map text: ${a.text}`}
                      onPointerDown={(event) => startLabelDrag(event, a)}
                      onClick={(event) => {
                        if (event.detail === 0) activate(a);
                      }}
                    >
                      {a.text}
                    </button>
                  ) : (
                    <Tooltip
                      open={tool === 'erase' || panning ? false : undefined}
                    >
                      <TooltipTrigger
                        render={
                          <button
                            onClick={() => activate(a)}
                            className={`${a.type === 'comment' ? 'annotation-comment' : 'annotation-marker'} ${a.circle ? 'marker-circle' : ''}`}
                            style={{ color: a.color }}
                            aria-label={
                              a.text ||
                              a.title ||
                              `${a.icon ?? 'Map'} ${a.type}`
                            }
                          />
                        }
                      >
                        <Icon fill="currentColor" strokeWidth={1.7} />
                      </TooltipTrigger>
                      <TooltipContent className="map-note-tooltip">
                        <span className="note-preview">
                          {a.title && <strong>{a.title}</strong>}
                          <span>{a.text || 'Click to edit'}</span>
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              );
            })}
          {editing?.type === 'text' && (
            <div
              className="map-annotation inline-text-anchor"
              style={{
                left: editing.x,
                top: editing.y,
                transform: `scale(${1 / view.scale})`,
              }}
            >
              <InlineMapText
                key={editing.id}
                draft={editing}
                onChange={setEditing}
                onSave={saveInline}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}
          {editing?.type === 'comment' && (
            <div
              className="map-annotation map-comment-editor"
              data-controls
              style={{
                left:
                  (Math.max(
                    8,
                    Math.min(
                      view.x + editing.x * view.scale + 20,
                      viewport.current.width - 278,
                    ),
                  ) -
                    view.x) /
                  view.scale,
                top:
                  (Math.max(
                    8,
                    Math.min(
                      view.y + editing.y * view.scale + 20,
                      viewport.current.height - 205,
                    ),
                  ) -
                    view.y) /
                  view.scale,
                transform: `scale(${1 / view.scale})`,
              }}
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  saveInline(editing);
                }}
              >
                <textarea
                  ref={focusComment}
                  aria-label="Map comment"
                  value={editing.text ?? ''}
                  maxLength={5000}
                  rows={4}
                  onChange={(event) =>
                    setEditing({ ...editing, text: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                      saveInline(editing);
                    }
                    if (event.key === 'Escape') {
                      event.stopPropagation();
                      setEditing(null);
                    }
                  }}
                />
                <div>
                  <button type="button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                  <button type="submit">Save</button>
                </div>
              </form>
            </div>
          )}
          {worldLinks?.map((link) => (
            <button
              key={link.id}
              className="world-hotspot"
              aria-label={`Open ${link.name} map`}
              title={link.name}
              tabIndex={tool === 'hand' ? 0 : -1}
              style={{
                left: link.x - link.width / 2,
                top: link.y - link.height / 2,
                width: link.width,
                height: link.height,
                pointerEvents: tool === 'hand' ? 'auto' : 'none',
              }}
              onClick={link.onClick}
            />
          ))}
        </div>
        {highlighted && eraseTarget && (
          <MapEraserPreview target={eraseTarget} view={view} />
        )}
        {cursor &&
          !editing &&
          !space.current &&
          tool !== 'hand' &&
          tool !== 'erase' && (
            <div
              className="tool-cursor-preview"
              aria-hidden="true"
              style={{ left: cursor.x, top: cursor.y, color }}
            >
              {tool === 'draw' ? (
                <span
                  className="brush-preview"
                  style={{
                    width: brush,
                    height: brush,
                    background: `${color}22`,
                    opacity,
                  }}
                />
              ) : tool === 'text' ? (
                <span
                  className={`text-preview ${textShadow ? 'text-has-shadow' : ''}`}
                >
                  Text
                </span>
              ) : tool === 'comment' ? (
                <MessageSquare
                  className="comment-preview"
                  size={24}
                  fill="currentColor"
                />
              ) : (
                <span
                  className={`icon-preview ${iconCircle ? 'marker-circle' : ''}`}
                >
                  <PreviewIcon fill="currentColor" strokeWidth={1.7} />
                </span>
              )}
            </div>
          )}
        {(!loaded || failed) && (
          <output className="map-loading">
            {failed ? (
              <>
                <TriangleAlert />
                <strong>This map could not load.</strong>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setFailed(false);
                    setLoaded(false);
                    setRetry((r) => r + 1);
                  }}
                >
                  Try again
                </button>
              </>
            ) : (
              <>
                <LoaderCircle className="animate-spin" />
                <span>Unfolding your map…</span>
              </>
            )}
          </output>
        )}
        <div className="drawing-tools" data-controls>
          <>
            {toolConfig.map((t) => (
              <ToolButton
                key={t.id}
                label={`${t.label} (${t.key})`}
                active={tool === t.id}
                onClick={() => {
                  setTool(t.id);
                  if (t.id !== 'hand') setVisible(true);
                }}
              >
                <t.icon />
              </ToolButton>
            ))}
          </>
          <div className="tool-rule" />
          <ToolButton
            label="Undo (⌘/Ctrl Z)"
            onClick={undo}
            disabled={!history.length}
          >
            <Undo2 />
          </ToolButton>
          <ToolButton
            label="Redo (⌘/Ctrl Shift Z)"
            onClick={redo}
            disabled={!future.length}
          >
            <Redo2 />
          </ToolButton>
          <div className="tool-rule" />
          <ToolButton
            label={visible ? 'Hide annotations' : 'Show annotations'}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <Eye /> : <EyeOff />}
          </ToolButton>
          {onToggleCharcoal && (
            <ToolButton
              label={
                charcoal ? 'Use original map colors' : 'Use charcoal night map'
              }
              active={charcoal}
              onClick={onToggleCharcoal}
            >
              {charcoal ? <Sun /> : <Moon />}
            </ToolButton>
          )}
        </div>
        {['draw', 'text', 'marker', 'comment'].includes(tool) && (
          <div
            className="tool-options"
            data-controls
            aria-label="Annotation options"
          >
            {COLORS.map((c) => (
              <button
                key={c}
                className={`swatch ${color === c ? 'active' : ''}`}
                aria-label={`Use ${c}`}
                aria-pressed={color === c}
                style={{ background: c }}
                onPointerDown={(event) => {
                  if (editing?.type === 'text') event.preventDefault();
                }}
                onClick={() => {
                  setColor(c);
                  if (editing?.type === 'text')
                    setEditing({ ...editing, color: c });
                }}
              />
            ))}
            <label className="custom-color" title="Custom color">
              <input
                type="color"
                aria-label="Choose custom annotation color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </label>
            {tool === 'draw' && (
              <>
                <label className="brush-option">
                  Size{' '}
                  <input
                    aria-label="Brush width"
                    type="range"
                    min="0"
                    max="100"
                    step="0.1"
                    value={sliderFromBrush(brush)}
                    aria-valuetext={`${brush} pixels`}
                    onChange={(event) =>
                      setBrush(brushFromSlider(Number(event.target.value)))
                    }
                  />
                  <ToolNumber
                    label="Brush width in pixels"
                    value={brush}
                    min={1}
                    max={60}
                    onChange={setBrush}
                  />
                </label>
                <label className="brush-option">
                  Opacity{' '}
                  <input
                    aria-label="Brush opacity"
                    type="range"
                    min="10"
                    max="100"
                    step="10"
                    value={Math.round(opacity * 100)}
                    onChange={(event) =>
                      setOpacity(Number(event.target.value) / 100)
                    }
                  />
                  <ToolNumber
                    label="Brush opacity percent"
                    value={Math.round(opacity * 100)}
                    min={10}
                    max={100}
                    step={10}
                    onChange={(value) => setOpacity(value / 100)}
                  />
                  %
                </label>
              </>
            )}
            {tool === 'text' && (
              <button
                className="style-toggle"
                aria-pressed={
                  editing?.type === 'text' ? !!editing.shadow : textShadow
                }
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  const next = !(editing?.type === 'text'
                    ? editing.shadow
                    : textShadow);
                  setTextShadow(next);
                  if (editing?.type === 'text')
                    setEditing({ ...editing, shadow: next });
                }}
              >
                Shadow
              </button>
            )}
            {tool === 'marker' && (
              <button
                className="style-toggle"
                aria-pressed={iconCircle}
                onClick={() => setIconCircle((value) => !value)}
              >
                Circle
              </button>
            )}
            {tool === 'marker' && (
              <div className="flex gap-1">
                {markerKinds.map((kind) => {
                  const Icon = markerIcons[kind];
                  return (
                    <button
                      key={kind}
                      aria-label={kind}
                      title={kind}
                      className={`marker-type ${marker === kind ? 'active' : ''}`}
                      onClick={() => setMarker(kind)}
                    >
                      <Icon fill="currentColor" strokeWidth={1.7} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {pendingLoot && (
          <div className="status-banner" data-controls>
            Place {pendingLoot.item} at {pendingLoot.location}{' '}
            <button
              aria-label="Cancel placing loot marker"
              onClick={() => {
                onPlaced();
                setTool('hand');
              }}
            >
              ×
            </button>
          </div>
        )}
        <div className="zoom-tools" data-controls>
          <ToolButton label="Zoom out" onClick={() => zoom(0.8)}>
            <Minus />
          </ToolButton>
          <span>{Math.round(view.scale * 100)}%</span>
          <ToolButton label="Zoom in" onClick={() => zoom(1.25)}>
            <Plus />
          </ToolButton>
          <ToolButton label="Fit map (reset view)" onClick={fit}>
            <Maximize />
          </ToolButton>
        </div>
        <div className="map-instruction">{instruction[tool]}</div>
      </div>
      <Dialog
        open={editing?.type === 'marker'}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="dialog-panel">
          <DialogTitle>Map marker</DialogTitle>
          <DialogDescription>Edit this map icon.</DialogDescription>
          {editing?.type === 'marker' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const existing = annotations.some((a) => a.id === editing.id);
                commit(
                  existing
                    ? annotations.map((a) =>
                        a.id === editing.id ? editing : a,
                      )
                    : [...annotations, editing],
                );
                setEditing(null);
              }}
            >
              <label>
                Title
                <input
                  value={editing.title ?? ''}
                  maxLength={120}
                  placeholder="A safe place for the night"
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                />
              </label>
              <label>
                Marker details
                <textarea
                  value={editing.text ?? ''}
                  maxLength={5000}
                  rows={4}
                  onChange={(e) =>
                    setEditing({ ...editing, text: e.target.value })
                  }
                />
              </label>
              <label className="marker-circle-option">
                <input
                  type="checkbox"
                  checked={editing.circle ?? false}
                  onChange={(event) =>
                    setEditing({ ...editing, circle: event.target.checked })
                  }
                />
                Black circle
              </label>
              <div className="flex gap-3 mt-3">
                {COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`swatch ${editing.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    aria-label={`Color ${c}`}
                    onClick={() => setEditing({ ...editing, color: c })}
                  />
                ))}
              </div>
              <div className="dialog-actions">
                {annotations.some((a) => a.id === editing.id) && (
                  <button
                    type="button"
                    className="text-button mr-auto"
                    onClick={() => {
                      commit(annotations.filter((a) => a.id !== editing.id));
                      setEditing(null);
                    }}
                  >
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button className="primary-button" type="submit">
                  Save marker
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
