import { vi } from "vitest";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

export function fakeMedia() {
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  const getUserMedia = vi.fn(async () => stream);
  const records: FakeMediaRecorder[] = [];
  let constructorThrows = false;
  let startThrows = false;
  class FakeMediaRecorder {
    static isTypeSupported() { return true; }
    state = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((e: BlobEvent) => void) | null = null;
    onstop: ((e: Event) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    constructor(readonly stream: MediaStream) {
      if (constructorThrows) throw new Error("no codec");
      records.push(this);
    }
    start() {
      if (startThrows) throw new Error("start failed");
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["synthetic audio"]) } as BlobEvent);
      this.onstop?.(new Event("stop"));
    }
  }
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia }, onLine: true });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  return {
    stream, stopTrack, getUserMedia, records,
    failConstructor: () => { constructorThrows = true; },
    failStart: () => { startThrows = true; },
  };
}
