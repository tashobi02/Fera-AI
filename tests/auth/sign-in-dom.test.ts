import { describe, expect, it, vi } from "vitest";
import { setInputValueAndNotify } from "@/lib/sign-in-dom";

describe("demo sign-in input notification", () => {
  it("uses the native value setter and dispatches a bubbling input event", () => {
    const input = { value: "" } as HTMLInputElement;
    const prototype = Object.create(Object.getPrototypeOf(input)) as object;
    const nativeSetter = vi.fn(function (this: HTMLInputElement, value: string) {
      this.value = value;
    });
    Object.defineProperty(prototype, "value", { configurable: true, set: nativeSetter });
    const dispatchEvent = vi.fn((_event: Event) => true);
    Object.assign(input, {
      ownerDocument: { defaultView: { HTMLInputElement: { prototype }, Event } },
      dispatchEvent,
    });

    setInputValueAndNotify(input, "staff.demo");

    expect(nativeSetter).toHaveBeenCalledWith("staff.demo");
    expect(input.value).toBe("staff.demo");
    const event = dispatchEvent.mock.calls[0]?.[0];
    expect(event).toBeInstanceOf(Event);
    expect(event).toMatchObject({ type: "input", bubbles: true });
  });

  it("does nothing when there is no input element", () => {
    expect(() => setInputValueAndNotify(null, "staff.demo")).not.toThrow();
  });
});
