import type { EraserTarget } from '@/lib/map-eraser';
import type { Camera } from '@/lib/map-view';

export default function MapEraserPreview({
  target,
  view,
}: {
  target: EraserTarget;
  view: Camera;
}) {
  const { annotation, bounds } = target;
  const points = annotation.points
    ?.map((p) => `${p.x * view.scale + view.x},${p.y * view.scale + view.y}`)
    .join(' ');
  return (
    <svg className="map-eraser-preview" aria-hidden="true">
      {bounds ? (
        <>
          <rect
            x={bounds.left - 4}
            y={bounds.top - 4}
            width={bounds.right - bounds.left + 8}
            height={bounds.bottom - bounds.top + 8}
            fill="#ffffff25"
            stroke="#111"
            strokeWidth={4}
          />
          <rect
            x={bounds.left - 4}
            y={bounds.top - 4}
            width={bounds.right - bounds.left + 8}
            height={bounds.bottom - bounds.top + 8}
            fill="none"
            stroke="#fff"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        </>
      ) : annotation.type === 'draw' && annotation.points?.length ? (
        <g
          opacity={Math.min(1, (annotation.opacity ?? 1) + 0.3)}
          style={{ filter: 'brightness(1.35)' }}
        >
          {annotation.points.length === 1 ? (
            <circle
              cx={annotation.points[0].x * view.scale + view.x}
              cy={annotation.points[0].y * view.scale + view.y}
              r={((annotation.width ?? 3) * view.scale + 4) / 2}
              fill={annotation.color}
            />
          ) : (
            <polyline
              points={points}
              fill="none"
              stroke={annotation.color}
              strokeWidth={(annotation.width ?? 3) * view.scale + 4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </g>
      ) : null}
    </svg>
  );
}
