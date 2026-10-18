import { LIMITS } from "@/contracts";

export type AudioMetadataResult =
  | { readonly ok: true; readonly durationSeconds: number }
  | { readonly ok: false; readonly errorId: "E-009" | "E-011" };

type PcmFormat = {
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
};

function ascii(bytes: Uint8Array, at: number, expected: string): boolean {
  if (at + expected.length > bytes.byteLength) return false;
  for (let i = 0; i < expected.length; i++) {
    if (bytes[at + i] !== expected.charCodeAt(i)) return false;
  }
  return true;
}

function fail(errorId: "E-009" | "E-011"): AudioMetadataResult {
  return { ok: false, errorId };
}

/**
 * Verify server-readable duration metadata. Only PCM WAV is currently supported;
 * the client duration is a consistency hint and never supplies the billed duration.
 */
export function verifyAudioMetadata(
  bytes: Uint8Array,
  mime: string,
  claimedDurationSeconds?: number,
): AudioMetadataResult {
  const mediaType = mime.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "audio/wav" && mediaType !== "audio/x-wav" && mediaType !== "audio/wave") {
    return fail("E-011");
  }
  if (bytes.byteLength < 44 || !ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WAVE")) return fail("E-011");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffSize = view.getUint32(4, true);
  if (riffSize + 8 !== bytes.byteLength) return fail("E-011");

  let format: PcmFormat | null = null;
  let dataBytes: number | null = null;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    if (!Number.isSafeInteger(dataEnd) || dataEnd > bytes.byteLength) return fail("E-011");

    if (ascii(bytes, offset, "fmt ")) {
      if (format !== null || chunkLength < 16) return fail("E-011");
      format = {
        channels: view.getUint16(dataStart + 2, true),
        sampleRate: view.getUint32(dataStart + 4, true),
        byteRate: view.getUint32(dataStart + 8, true),
        blockAlign: view.getUint16(dataStart + 12, true),
        bitsPerSample: view.getUint16(dataStart + 14, true),
      };
      if (view.getUint16(dataStart, true) !== 1) return fail("E-011"); // PCM only
    } else if (ascii(bytes, offset, "data")) {
      if (dataBytes !== null) return fail("E-011");
      dataBytes = chunkLength;
    }

    offset = dataEnd + (chunkLength % 2);
    if (offset > bytes.byteLength) return fail("E-011");
  }
  if (offset !== bytes.byteLength || !format || dataBytes === null || dataBytes === 0) return fail("E-011");

  const bytesPerSample = format.bitsPerSample / 8;
  if (
    ![8, 16, 24, 32].includes(format.bitsPerSample)
    || format.channels < 1
    || format.channels > 2
    || format.sampleRate < 8_000
    || format.sampleRate > 192_000
    || format.blockAlign !== format.channels * bytesPerSample
    || format.byteRate !== format.sampleRate * format.blockAlign
    || dataBytes % format.blockAlign !== 0
  ) return fail("E-011");

  const durationSeconds = dataBytes / format.byteRate;
  if (!Number.isFinite(durationSeconds) || durationSeconds < LIMITS.audioSeconds.min || durationSeconds > LIMITS.audioSeconds.max) {
    return fail("E-009");
  }
  if (claimedDurationSeconds !== undefined && (
    !Number.isFinite(claimedDurationSeconds)
    || Math.abs(claimedDurationSeconds - durationSeconds) > 0.5
  )) return fail("E-009");

  return { ok: true, durationSeconds };
}
