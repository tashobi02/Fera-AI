import { describe, expect, it } from "vitest";
import { verifyAudioMetadata } from "@/server/intake/audio-metadata";

function pcmWav(seconds: number, sampleRate = 8_000): Uint8Array {
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = seconds * sampleRate * blockAlign;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  view.setUint32(40, dataSize, true);
  return bytes;
}

describe("server-side audio metadata verification", () => {
  it("derives duration from validated WAV metadata", () => {
    expect(verifyAudioMetadata(pcmWav(6), "audio/wav")).toEqual({ ok: true, durationSeconds: 6 });
  });

  it.each(["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"])("fails closed for unsupported codec %s", (mime) => {
    expect(verifyAudioMetadata(pcmWav(6), mime)).toEqual({ ok: false, errorId: "E-011" });
  });

  it("rejects malformed, truncated and forged RIFF metadata", () => {
    const valid = pcmWav(6);
    expect(verifyAudioMetadata(valid.slice(0, 20), "audio/wav")).toEqual({ ok: false, errorId: "E-011" });
    const forged = valid.slice();
    new DataView(forged.buffer).setUint32(40, 4, true);
    expect(verifyAudioMetadata(forged, "audio/wav")).toEqual({ ok: false, errorId: "E-011" });
  });

  it("rejects a client duration hint that disagrees with the WAV duration", () => {
    expect(verifyAudioMetadata(pcmWav(6), "audio/wav", 42)).toEqual({ ok: false, errorId: "E-009" });
  });
});
