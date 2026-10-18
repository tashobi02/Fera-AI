// Keep scripts-cli.test.ts offline while still executing model-fetch.mjs.
// Only the external Transformers.js import is replaced; the CLI's own guards
// and error handling remain under test.
//
// model-fetch.mjs uses the global `fetch()` to download pinned public
// assets from huggingface.co. To keep the unit offline we also intercept
// the global fetch with a deterministic offline stub: any URL the CLI
// tries to fetch is rejected with "offline test stub" so the CLI's own
// error handler emits the expected "download failed" message and the
// subprocess never reaches the network. The intercept is purely a
// Node loader hook, not a production bypass flag in the CLI.
const offlineTransformersUrl = `data:text/javascript,${encodeURIComponent(`
export const env = {};
export async function pipeline() {
  throw new Error("offline test stub");
}
`)}`;

// Install the offline fetch stub on globalThis the first time the
// loader is used. The CLI's bounded per-file timeout (60s) and total
// timeout (5m) still bound the subprocess even if the stub is bypassed.
if (!globalThis.__feraOfflineFetchInstalled) {
  globalThis.__feraOfflineFetchInstalled = true;
  globalThis.fetch = async function offlineFetch(url) {
    throw new Error(`offline test stub: cannot reach ${url}`);
  };
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@huggingface/transformers") {
    return { url: offlineTransformersUrl, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
