/**
 * Client-side image compression and resizing utility for LumaChat.
 * Guarantees that uploaded images safely fit within Vercel Serverless Function
 * request payload constraints (4.5 MB limit) by targeting <= 2 MB compressed binary size (~2.7 MB Base64).
 */

export interface CompressionResult {
  dataUrl: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
}

export const MAX_COMPRESSED_BINARY_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_DIMENSION = 1920; // Full HD max dimension while preserving aspect ratio

export function getApproximateBase64Bytes(dataUrl: string): number {
  const base64Data = dataUrl.split(',')[1] || '';
  return Math.ceil((base64Data.length * 3) / 4);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image for compression.'));
    img.src = src;
  });
}

/**
 * Compresses and resizes an image file client-side.
 * Preserves alpha transparency for PNG / WebP, handles GIFs safely,
 * and maintains aspect ratio.
 */
export async function compressAndResizeImage(file: File): Promise<CompressionResult> {
  const mimeType = file.type.toLowerCase();
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(mimeType)) {
    throw new Error('Unsupported image format. Please select JPEG, PNG, WebP, or GIF.');
  }

  // Animated GIF preservation
  if (mimeType === 'image/gif') {
    if (file.size > MAX_COMPRESSED_BINARY_BYTES) {
      throw new Error(
        'GIF image exceeds 2 MB limit. Animated GIFs cannot be re-encoded safely without losing animation.'
      );
    }
    const dataUrl = await readFileAsDataUrl(file);
    return {
      dataUrl,
      originalSizeBytes: file.size,
      compressedSizeBytes: file.size,
    };
  }

  // If already under 500 KB, read directly if dimensions are reasonable
  if (file.size <= 500 * 1024) {
    const dataUrl = await readFileAsDataUrl(file);
    const bytes = getApproximateBase64Bytes(dataUrl);
    if (bytes <= MAX_COMPRESSED_BINARY_BYTES) {
      return {
        dataUrl,
        originalSizeBytes: file.size,
        compressedSizeBytes: bytes,
      };
    }
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(rawDataUrl);

  // Preserve aspect ratio while capping maximum dimension to 1920px
  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_DIMENSION) / width);
      width = MAX_DIMENSION;
    } else {
      width = Math.round((width * MAX_DIMENSION) / height);
      height = MAX_DIMENSION;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to initialize canvas context for image processing.');
  }

  // Clear canvas to ensure alpha transparency is preserved
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let targetMime =
    mimeType === 'image/png'
      ? 'image/png'
      : mimeType === 'image/webp'
      ? 'image/webp'
      : 'image/jpeg';

  let quality = 0.88;
  let compressedUrl = canvas.toDataURL(targetMime, quality);
  let estimatedBytes = getApproximateBase64Bytes(compressedUrl);

  // If PNG is over 2 MB, convert to WebP to maintain transparency with superior compression
  if (targetMime === 'image/png' && estimatedBytes > MAX_COMPRESSED_BINARY_BYTES) {
    targetMime = 'image/webp';
    compressedUrl = canvas.toDataURL('image/webp', quality);
    estimatedBytes = getApproximateBase64Bytes(compressedUrl);
  }

  // Iteratively reduce quality if still over 2 MB threshold
  while (estimatedBytes > MAX_COMPRESSED_BINARY_BYTES && quality > 0.45) {
    quality -= 0.15;
    compressedUrl = canvas.toDataURL(targetMime, quality);
    estimatedBytes = getApproximateBase64Bytes(compressedUrl);
  }

  if (estimatedBytes > MAX_COMPRESSED_BINARY_BYTES) {
    throw new Error(
      `Image is too large (${(estimatedBytes / (1024 * 1024)).toFixed(1)} MB) to upload safely. Maximum allowed compressed size is 2 MB.`
    );
  }

  return {
    dataUrl: compressedUrl,
    originalSizeBytes: file.size,
    compressedSizeBytes: estimatedBytes,
  };
}
