export type UploadProgressCallback = (percent: number) => void;

export type UploadResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  body: string;
};

type UploadBody = string | ArrayBuffer | Blob;

/**
 * XMLHttpRequest is used narrowly for uploads because fetch does not expose
 * request-body progress. The loaded/total values come from the browser/native
 * networking layer, so percentages shown to students reflect bytes actually
 * sent rather than a timer pretending the upload advanced.
 */
export function requestWithUploadProgress(options: {
  url: string;
  method?: 'POST' | 'PUT';
  headers: Record<string, string>;
  body: UploadBody;
  signal?: AbortSignal;
  onProgress?: UploadProgressCallback;
  onUploadComplete?: () => void;
}): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastPercent = -1;
    let uploadComplete = false;

    const report = (percent: number) => {
      const bounded = Math.max(0, Math.min(100, Math.round(percent)));
      if (bounded === lastPercent) return;
      lastPercent = bounded;
      options.onProgress?.(bounded);
    };
    const completeUpload = () => {
      if (uploadComplete) return;
      uploadComplete = true;
      report(100);
      options.onUploadComplete?.();
    };
    const abort = () => xhr.abort();
    const cleanup = () => options.signal?.removeEventListener('abort', abort);

    xhr.open(options.method ?? 'POST', options.url, true);
    for (const [name, value] of Object.entries(options.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        report((event.loaded / event.total) * 100);
      }
      if (event.total > 0 && event.loaded >= event.total) completeUpload();
    };
    xhr.upload.onload = completeUpload;
    xhr.onload = () => {
      cleanup();
      completeUpload();
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        statusText: xhr.statusText,
        body: typeof xhr.responseText === 'string' ? xhr.responseText : '',
      });
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error('Network error while uploading. Please check your connection and try again.'));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new Error('The upload timed out. Please try again.'));
    };
    xhr.onabort = () => {
      cleanup();
      const error = new Error('Upload cancelled');
      error.name = 'AbortError';
      reject(error);
    };

    if (options.signal?.aborted) {
      cleanup();
      const error = new Error('Upload cancelled');
      error.name = 'AbortError';
      reject(error);
      return;
    }
    options.signal?.addEventListener('abort', abort, { once: true });
    report(0);
    xhr.send(options.body);
  });
}

export function parseUploadJson<T>(response: UploadResponse): T | null {
  try {
    return JSON.parse(response.body) as T;
  } catch {
    return null;
  }
}
