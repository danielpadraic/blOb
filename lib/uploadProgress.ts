export type UploadProgressEvent = {
  loaded: number;
  total: number;
};

export type UploadProgressHandler = (event: UploadProgressEvent) => void;

export function uploadProgressPercent(loaded: number, total: number): number | null {
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
}
