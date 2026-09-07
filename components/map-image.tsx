'use client';
/* eslint-disable @next/next/no-img-element -- Pre-generated cartography retains fixed annotation coordinates. */
import { useState } from 'react';
import type { MapAsset } from '@/lib/model';
import { mapImageDescription } from '@/lib/map-guides';

export default function MapImage({
  asset,
  onLoad,
  onError,
}: {
  asset: MapAsset;
  onLoad: () => void;
  onError: () => void;
}) {
  const [previewReady, setPreviewReady] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [fullReady, setFullReady] = useState(false);
  const hasPreview = !!asset.previewSrc;
  const description = mapImageDescription(asset);
  return (
    <>
      {hasPreview && (
        <img
          src={asset.previewSrc}
          width={asset.width}
          height={asset.height}
          alt={description}
          draggable={false}
          decoding="async"
          fetchPriority="high"
          style={{ visibility: fullReady ? 'hidden' : 'visible' }}
          onLoad={() => {
            setPreviewReady(true);
            onLoad();
          }}
          onError={() => setPreviewFailed(true)}
        />
      )}
      {(!hasPreview || previewReady || previewFailed) && (
        <img
          src={asset.src}
          width={asset.width}
          height={asset.height}
          alt={description}
          draggable={false}
          decoding="async"
          fetchPriority={hasPreview ? 'low' : 'high'}
          style={
            hasPreview
              ? {
                  position: 'absolute',
                  inset: 0,
                  visibility: fullReady ? 'visible' : 'hidden',
                }
              : undefined
          }
          onLoad={() => {
            setFullReady(true);
            onLoad();
          }}
          onError={() => {
            if (!previewReady) onError();
          }}
        />
      )}
    </>
  );
}
