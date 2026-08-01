import { factory } from "fresh/serializable";
import { InputEventHandler, TargetedInputEvent } from "preact";

export const onInputFactory = factory(
  function <E extends HTMLInputElement | HTMLTextAreaElement>(
    onInput?: InputEventHandler<E>,
    onValueChange?: (value: string) => void,
  ) {
    if (!onInput && !onValueChange) return undefined;
    return (e: TargetedInputEvent<E>) => {
      if (onValueChange) onValueChange(e.currentTarget.value);
      if (onInput) onInput(e);
    };
  },
);
