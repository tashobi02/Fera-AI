// Keep scripts-cli.test.ts offline while still executing model-fetch.mjs.
// Only the external Transformers.js import is replaced; the CLI's own guards
// and error handling remain under test.
const offlineTransformersUrl = `data:text/javascript,${encodeURIComponent(`
export const env = {};
export async function pipeline() {
  throw new Error("offline test stub");
}
`)}`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@huggingface/transformers") {
    return { url: offlineTransformersUrl, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
