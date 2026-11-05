export const MAX_PORTRAIT_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_PORTRAIT_OUTPUT_BYTES = 220 * 1024;
export const PORTRAIT_SIZE = 512;

const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function portraitFileError(
  file: Pick<File, 'type' | 'size'>,
): string | null {
  if (!supportedTypes.has(file.type))
    return 'Choose a JPEG, PNG, or WebP image.';
  if (file.size > MAX_PORTRAIT_UPLOAD_BYTES)
    return 'Choose an image that is 8 MB or smaller.';
  return null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The image could not be read.'));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

export async function processCharacterPortrait(file: File): Promise<string> {
  const fileError = portraitFileError(file);
  if (fileError) throw new Error(fileError);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This image could not be opened. Try another image.');
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = PORTRAIT_SIZE;
    canvas.height = PORTRAIT_SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable.');

    const cropSize = Math.min(bitmap.width, bitmap.height);
    const cropX = (bitmap.width - cropSize) / 2;
    const cropY = (bitmap.height - cropSize) / 2;
    context.fillStyle = '#f8f9f5';
    context.fillRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
    context.drawImage(
      bitmap,
      cropX,
      cropY,
      cropSize,
      cropSize,
      0,
      0,
      PORTRAIT_SIZE,
      PORTRAIT_SIZE,
    );

    let blob: Blob | null = null;
    for (const quality of [0.86, 0.74, 0.62, 0.5, 0.38]) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      );
      if (!blob) throw new Error('The image could not be processed.');
      if (blob.size <= MAX_PORTRAIT_OUTPUT_BYTES) break;
    }
    if (!blob || blob.size > MAX_PORTRAIT_OUTPUT_BYTES)
      throw new Error('This image is still too large after compression.');

    return await blobToDataUrl(blob);
  } finally {
    bitmap.close();
  }
}
