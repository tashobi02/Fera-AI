// Copy for COMP-030/031. The Clipboard API needs a secure context; on the plain-HTTP
// finale laptop it is missing, so the text block is selected instead and the card says
// "copy it yourself" rather than claiming it was copied.
export async function copyText(
  text: string,
  block: HTMLElement | null,
): Promise<"copied" | "manual"> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
  } catch {
    // Permission denied or not focused: fall through to selecting the text.
  }
  if (block) {
    const range = document.createRange();
    range.selectNodeContents(block);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    block.focus();
  }
  return "manual";
}
