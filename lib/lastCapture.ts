export type LastCapture = {
  uri: string;
  mimeType?: string | null;
  blob?: Blob | null;
  size?: number | null;
};

let lastCapture: LastCapture | null = null;

export function rememberLastCapture(next: LastCapture | null) {
  lastCapture = next;
}

export function getLastCapture(): LastCapture | null {
  return lastCapture;
}
