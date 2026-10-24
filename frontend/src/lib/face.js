export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load that image.'));
    image.src = source;
  });
}

export async function compressImage(source, size = 512, quality = 0.72) {
  const image = source instanceof HTMLImageElement ? source : await loadImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const side = Math.min(image.width || size, image.height || size);
  const sx = Math.max(0, ((image.width || side) - side) / 2);
  const sy = Math.max(0, ((image.height || side) - side) / 2);
  ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', quality);
}

export function captureFrame(video, size = 512) {
  if (!video || !video.videoWidth || !video.videoHeight) return '';
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const side = Math.min(video.videoWidth, video.videoHeight);
  const sx = (video.videoWidth - side) / 2;
  const sy = (video.videoHeight - side) / 2;
  ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.72);
}

export async function startCamera(video, constraints = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera is not available in this browser.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 720 },
      height: { ideal: 720 },
      ...constraints.video,
    },
    audio: false,
  });
  if (video) {
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    await video.play().catch(() => {});
  }
  return stream;
}

export function stopStream(stream) {
  if (!stream) return;
  stream.getTracks?.().forEach((track) => track.stop());
}

export function skinFacePresent(source) {
  try {
    const width = 96;
    const height = 96;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    if (source instanceof HTMLVideoElement) {
      if (source.readyState < 2 || !source.videoWidth) return false;
      const side = Math.min(source.videoWidth, source.videoHeight);
      ctx.drawImage(source, (source.videoWidth - side) / 2, (source.videoHeight - side) / 2, side, side, 0, 0, width, height);
    } else {
      ctx.drawImage(source, 0, 0, width, height);
    }
    const { data } = ctx.getImageData(0, 0, width, height);
    let skin = 0;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      total += 1;
      const warm = r > 75 && g > 35 && b > 20 && r > g && r > b && max - min > 12;
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const ycbcr = y > 55 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
      if (warm || ycbcr) skin += 1;
    }
    return total > 0 && skin / total > 0.06;
  } catch {
    return false;
  }
}

export async function hasHumanFace(source) {
  if (!source) return false;
  try {
    if (typeof window !== 'undefined' && 'FaceDetector' in window) {
      const Detector = window.FaceDetector;
      const detector = new Detector({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(source);
      if (faces?.length) return true;
    }
  } catch {
    /* fall through to skin check */
  }
  return skinFacePresent(source);
}
