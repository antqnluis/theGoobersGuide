export const MAX_CAMPAIGN_MAP_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_CAMPAIGN_MAP_OUTPUT_BYTES = 640 * 1024;
export const MAX_CAMPAIGN_MAP_DIMENSION = 1400;

export interface CampaignMapDimensions {
  width: number;
  height: number;
}

export interface CampaignMapOffset {
  x: number;
  y: number;
}

export function campaignMapDisplaySize(
  image: CampaignMapDimensions,
  viewport: CampaignMapDimensions,
  zoom: number,
): CampaignMapDimensions {
  if (
    image.width <= 0 ||
    image.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    return { width: 0, height: 0 };

  const scale =
    Math.min(viewport.width / image.width, viewport.height / image.height) *
    zoom;
  return { width: image.width * scale, height: image.height * scale };
}

export function clampCampaignMapOffset(
  offset: CampaignMapOffset,
  image: CampaignMapDimensions,
  viewport: CampaignMapDimensions,
  zoom: number,
): CampaignMapOffset {
  const displaySize = campaignMapDisplaySize(image, viewport, zoom);
  const maxX = Math.max(0, (displaySize.width - viewport.width) / 2);
  const maxY = Math.max(0, (displaySize.height - viewport.height) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function campaignMapFileError(
  file: Pick<File, 'type' | 'size'>,
): string | null {
  if (!supportedTypes.has(file.type))
    return 'Choose a JPEG, PNG, or WebP map image.';
  if (file.size > MAX_CAMPAIGN_MAP_UPLOAD_BYTES)
    return 'Choose a map image that is 8 MB or smaller.';
  return null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The map image could not be read.'));
    reader.onerror = () =>
      reject(new Error('The map image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

export async function processCampaignMap(file: File): Promise<string> {
  const fileError = campaignMapFileError(file);
  if (fileError) throw new Error(fileError);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This map image could not be opened. Try another image.');
  }

  try {
    const scale = Math.min(
      1,
      MAX_CAMPAIGN_MAP_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable.');

    context.fillStyle = '#f8f9f5';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);

    let blob: Blob | null = null;
    for (const quality of [0.88, 0.8, 0.72, 0.64, 0.56, 0.48]) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      );
      if (!blob) throw new Error('The map image could not be processed.');
      if (blob.size <= MAX_CAMPAIGN_MAP_OUTPUT_BYTES) break;
    }
    if (!blob || blob.size > MAX_CAMPAIGN_MAP_OUTPUT_BYTES)
      throw new Error(
        'This map image is too large after optimization. Choose a smaller image.',
      );

    return await blobToDataUrl(blob);
  } finally {
    bitmap.close();
  }
}
