import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  campaignMapDisplaySize,
  campaignMapFileError,
  clampCampaignMapOffset,
  processCampaignMap,
  type CampaignMapDimensions,
  type CampaignMapOffset,
} from './campaignMap';

const MIN_MAP_ZOOM = 1;
const MAX_MAP_ZOOM = 4;

interface DragStart {
  pointerId: number;
  pointerX: number;
  pointerY: number;
  offsetX: number;
  offsetY: number;
}

export default function CampaignMapPreview({
  campaignName,
  mapDataUrl,
  onSave,
}: {
  campaignName: string;
  mapDataUrl?: string;
  onSave: (mapDataUrl?: string) => boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<DragStart | null>(null);
  const [imageSize, setImageSize] = useState<CampaignMapDimensions | null>(
    null,
  );
  const [viewport, setViewport] = useState<CampaignMapDimensions>({
    width: 0,
    height: 0,
  });
  const [zoom, setZoom] = useState(MIN_MAP_ZOOM);
  const [offset, setOffset] = useState<CampaignMapOffset>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    setImageSize(null);
    setImageLoadError(false);
    setZoom(MIN_MAP_ZOOM);
    setOffset({ x: 0, y: 0 });
    if (!mapDataUrl) return;

    const image = new Image();
    image.onload = () =>
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => setImageLoadError(true);
    image.src = mapDataUrl;

    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [mapDataUrl]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateSize = () =>
      setViewport({ width: frame.clientWidth, height: frame.clientHeight });
    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!imageSize || viewport.width <= 0 || viewport.height <= 0) return;
    setOffset((current) =>
      clampCampaignMapOffset(current, imageSize, viewport, zoom),
    );
  }, [imageSize, viewport, zoom]);

  const displaySize = imageSize
    ? campaignMapDisplaySize(imageSize, viewport, zoom)
    : null;

  function moveMap(x: number, y: number, nextZoom = zoom) {
    if (!imageSize || viewport.width <= 0 || viewport.height <= 0) return;
    setOffset(clampCampaignMapOffset({ x, y }, imageSize, viewport, nextZoom));
  }

  function changeZoom(nextZoom: number) {
    const boundedZoom = Math.min(
      MAX_MAP_ZOOM,
      Math.max(MIN_MAP_ZOOM, nextZoom),
    );
    setZoom(boundedZoom);
    if (!imageSize || viewport.width <= 0 || viewport.height <= 0) return;
    setOffset((current) =>
      clampCampaignMapOffset(current, imageSize, viewport, boundedZoom),
    );
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!mapDataUrl || !imageSize || !event.isPrimary || event.button !== 0)
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
    setDragging(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    moveMap(
      start.offsetX + event.clientX - start.pointerX,
      start.offsetY + event.clientY - start.pointerY,
    );
  }

  function endDragging() {
    dragStart.current = null;
    setDragging(false);
  }

  function handleKeyboardMove(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 24 : 10;
    let x = offset.x;
    let y = offset.y;

    switch (event.key) {
      case 'ArrowLeft':
        x -= step;
        break;
      case 'ArrowRight':
        x += step;
        break;
      case 'ArrowUp':
        y -= step;
        break;
      case 'ArrowDown':
        y += step;
        break;
      default:
        return;
    }

    event.preventDefault();
    moveMap(x, y);
  }

  function resetView() {
    setZoom(MIN_MAP_ZOOM);
    setOffset({ x: 0, y: 0 });
  }

  async function chooseMap(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    const fileError = campaignMapFileError(file);
    if (fileError) {
      setMapError(fileError);
      return;
    }

    setMapError(null);
    setProcessing(true);
    try {
      const map = await processCampaignMap(file);
      onSave(map);
    } catch (cause) {
      setMapError(
        cause instanceof Error
          ? cause.message
          : 'The campaign map could not be saved.',
      );
    } finally {
      setProcessing(false);
    }
  }

  function removeMap() {
    if (onSave(undefined)) setMapError(null);
  }

  return (
    <section
      className="overview-map-section"
      aria-labelledby="campaign-map-heading"
    >
      <div className="section-heading">
        <h2 id="campaign-map-heading">Campaign map</h2>
      </div>
      <div
        ref={frameRef}
        className={`campaign-map-frame${mapDataUrl ? ' is-interactive' : ''}${dragging ? ' is-dragging' : ''}`}
        role={mapDataUrl ? 'group' : undefined}
        aria-label={
          mapDataUrl
            ? 'Campaign map preview. Drag to move it, or use the zoom controls.'
            : undefined
        }
        tabIndex={mapDataUrl && imageSize ? 0 : undefined}
        onKeyDown={handleKeyboardMove}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDragging}
        onPointerCancel={endDragging}
        onLostPointerCapture={endDragging}
      >
        {mapDataUrl &&
        displaySize &&
        displaySize.width > 0 &&
        displaySize.height > 0 &&
        !imageLoadError ? (
          <img
            className="campaign-map-image"
            src={mapDataUrl}
            alt={`${campaignName} campaign map`}
            draggable={false}
            style={{
              width: `${displaySize.width}px`,
              height: `${displaySize.height}px`,
              left: `${viewport.width / 2 + offset.x}px`,
              top: `${viewport.height / 2 + offset.y}px`,
            }}
          />
        ) : !mapDataUrl ? (
          <p className="campaign-map-empty">
            Add a map to keep a visual reference close at hand.
          </p>
        ) : imageLoadError ? (
          <p className="campaign-map-load-error" role="alert">
            This map preview could not be opened. Replace the map image to
            restore it.
          </p>
        ) : (
          <p className="campaign-map-loading" role="status">
            Preparing map preview…
          </p>
        )}
      </div>
      {mapDataUrl && imageSize && viewport.width > 0 && viewport.height > 0 && (
        <div className="campaign-map-controls" aria-label="Map zoom controls">
          <button
            type="button"
            className="campaign-map-zoom-button"
            aria-label="Zoom out map"
            disabled={zoom <= MIN_MAP_ZOOM}
            onClick={() => changeZoom(zoom - 0.25)}
          >
            −
          </button>
          <input
            type="range"
            min={MIN_MAP_ZOOM}
            max={MAX_MAP_ZOOM}
            step="0.05"
            value={zoom}
            aria-label="Map zoom"
            aria-valuetext={`${Math.round(zoom * 100)} percent`}
            onChange={(event) => changeZoom(Number(event.currentTarget.value))}
          />
          <button
            type="button"
            className="campaign-map-zoom-button"
            aria-label="Zoom in map"
            disabled={zoom >= MAX_MAP_ZOOM}
            onClick={() => changeZoom(zoom + 0.25)}
          >
            +
          </button>
          <output>{Math.round(zoom * 100)}%</output>
          <button
            type="button"
            className="button button-quiet campaign-map-reset"
            disabled={zoom === MIN_MAP_ZOOM && offset.x === 0 && offset.y === 0}
            onClick={resetView}
          >
            Reset view
          </button>
        </div>
      )}
      <div className="campaign-map-actions">
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Upload campaign map"
          onChange={chooseMap}
        />
        <button
          className="button button-quiet"
          type="button"
          disabled={processing}
          onClick={() => fileInput.current?.click()}
        >
          {processing
            ? 'Preparing map…'
            : mapDataUrl
              ? 'Replace map'
              : 'Add map'}
        </button>
        {mapDataUrl && (
          <button
            className="campaign-map-remove"
            type="button"
            disabled={processing}
            onClick={removeMap}
          >
            Remove
          </button>
        )}
      </div>
      <p className="campaign-map-help">
        JPEG, PNG, or WebP, up to 8 MB.
        {mapDataUrl && ' Drag to move; use the slider or +/− to zoom.'}
      </p>
      {mapError && (
        <p className="form-error campaign-map-error" role="alert">
          {mapError}
        </p>
      )}
    </section>
  );
}
