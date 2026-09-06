'use client';
import { useLayoutEffect, useRef } from 'react';
import type { Annotation } from '@/lib/model';
import { renderMapPaint } from '@/lib/paint-strokes';
export default function MapPaint({
  strokes,
  view,
  size,
}: {
  strokes: Annotation[];
  view: { x: number; y: number; scale: number };
  size: { width: number; height: number };
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { width, height } = size;
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const context = element.getContext('2d');
    if (!context) return;
    renderMapPaint(element, context, strokes, view, { width, height }, ratio);
  }, [strokes, view, width, height]);
  return (
    <canvas
      ref={canvas}
      className="map-paint"
      aria-hidden="true"
      style={{
        width: size.width,
        height: size.height,
      }}
    />
  );
}
