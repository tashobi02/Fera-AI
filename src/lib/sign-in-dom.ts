export function setInputValueAndNotify(input: HTMLInputElement | null, value: string): void {
  if (!input) return;

  const view = input.ownerDocument.defaultView;
  const prototype = view?.HTMLInputElement.prototype ?? Object.getPrototypeOf(input);
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;

  const EventConstructor = view?.Event;
  if (EventConstructor) input.dispatchEvent(new EventConstructor("input", { bubbles: true }));
}
