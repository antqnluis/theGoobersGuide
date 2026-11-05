import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  processCharacterPortrait,
  type PortraitCrop,
} from './characterPortrait';

const MAX_ZOOM = 3;

interface ImageSize {
  width: number;
  height: number;
}

interface CropOffset {
  x: number;
  y: number;
}

interface DragStart {
  pointerId: number;
  pointerX: number;
  pointerY: number;
  offsetX: number;
  offsetY: number;
}

function imageGeometry(image: ImageSize, previewSize: number, zoom: number) {
  const scale =
    Math.max(previewSize / image.width, previewSize / image.height) * zoom;

  return {
    scale,
    width: image.width * scale,
    height: image.height * scale,
  };
}

function clampOffset(
  offset: CropOffset,
  image: ImageSize,
  previewSize: number,
  zoom: number,
): CropOffset {
  const geometry = imageGeometry(image, previewSize, zoom);
  const maxX = Math.max(0, (geometry.width - previewSize) / 2);
  const maxY = Math.max(0, (geometry.height - previewSize) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

export default function CharacterPortraitCropDialog({
  file,
  onCancel,
  onSave,
}: {
  file: File;
  onCancel: () => void;
  onSave: (portraitDataUrl: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<DragStart | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [previewSize, setPreviewSize] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    setSourceUrl(url);
    setImageSize(null);
    setImageError(null);
    image.onload = () => {
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () =>
      setImageError('This photo could not be opened. Choose another image.');
    image.src = url;

    return () => {
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    const updateSize = () =>
      setPreviewSize(preview.getBoundingClientRect().width);
    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!imageSize || previewSize <= 0) return;
    setOffset((current) => clampOffset(current, imageSize, previewSize, zoom));
  }, [imageSize, previewSize, zoom]);

  const geometry =
    imageSize && previewSize > 0
      ? imageGeometry(imageSize, previewSize, zoom)
      : null;

  function moveTo(x: number, y: number, nextZoom = zoom) {
    if (!imageSize || previewSize <= 0) return;
    setOffset(clampOffset({ x, y }, imageSize, previewSize, nextZoom));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!imageSize || !event.isPrimary || event.button !== 0) return;
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
    moveTo(
      start.offsetX + event.clientX - start.pointerX,
      start.offsetY + event.clientY - start.pointerY,
    );
  }

  function endDragging() {
    dragStart.current = null;
    setDragging(false);
  }

  function handleKeyboardMove(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 18 : 6;
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
    moveTo(x, y);
  }

  function handleZoom(event: ChangeEvent<HTMLInputElement>) {
    const nextZoom = Number(event.currentTarget.value);
    setZoom(nextZoom);
    moveTo(offset.x, offset.y, nextZoom);
  }

  async function saveCrop() {
    if (!imageSize || !geometry || previewSize <= 0) return;

    const cropSize = previewSize / geometry.scale;
    const crop: PortraitCrop = {
      size: cropSize,
      x: imageSize.width / 2 - offset.x / geometry.scale - cropSize / 2,
      y: imageSize.height / 2 - offset.y / geometry.scale - cropSize / 2,
    };

    setSaving(true);
    setSaveError(null);
    try {
      const portraitDataUrl = await processCharacterPortrait(file, crop);
      onSave(portraitDataUrl);
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : 'The portrait could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="portrait-crop-dialog"
      aria-labelledby="portrait-crop-title"
      aria-describedby="portrait-crop-instructions"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="portrait-crop-content">
        <header className="portrait-crop-header">
          <div>
            <h2 id="portrait-crop-title">Adjust portrait</h2>
            <p id="portrait-crop-instructions">
              Drag the photo to position it. Use the slider to zoom, or use the
              arrow keys to move it. Hold Shift for larger adjustments.
            </p>
          </div>
        </header>

        <div
          ref={previewRef}
          className={`portrait-crop-window${dragging ? ' is-dragging' : ''}`}
          role="group"
          aria-label="Photo crop area. Use the arrow keys to move the photo."
          tabIndex={0}
          onKeyDown={handleKeyboardMove}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDragging}
          onPointerCancel={endDragging}
          onLostPointerCapture={endDragging}
        >
          {sourceUrl && geometry && (
            <img
              className="portrait-crop-image"
              src={sourceUrl}
              alt=""
              draggable={false}
              style={{
                width: `${geometry.width}px`,
                height: `${geometry.height}px`,
                left: `${previewSize / 2 + offset.x}px`,
                top: `${previewSize / 2 + offset.y}px`,
              }}
            />
          )}
          {!imageSize && !imageError && (
            <p className="portrait-crop-loading" role="status">
              Preparing photo…
            </p>
          )}
          {imageError && (
            <p className="portrait-crop-error" role="alert">
              {imageError}
            </p>
          )}
        </div>

        <label className="portrait-zoom-control">
          <span>Zoom</span>
          <input
            type="range"
            min="1"
            max={MAX_ZOOM}
            step="0.01"
            value={zoom}
            aria-label="Photo zoom"
            aria-valuetext={`${Math.round(zoom * 100)} percent`}
            disabled={!imageSize}
            onChange={handleZoom}
          />
          <output>{Math.round(zoom * 100)}%</output>
        </label>

        {saveError && (
          <p className="form-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="portrait-crop-actions">
          <button
            type="button"
            className="button button-quiet"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={saveCrop}
            disabled={!imageSize || saving || Boolean(imageError)}
          >
            {saving ? 'Saving photo…' : 'Use photo'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
