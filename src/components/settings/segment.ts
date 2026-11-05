/** A segment's look in the Settings tab bar and the Exit icons picker: raised while pressed. */
export const segmentStateClass = (pressed: boolean): string =>
  pressed
    ? "bg-bg-list shadow-[0_1px_2px_rgb(0_0_0/0.12)]"
    : "text-text-subtle hover:text-text-primary hover:cursor-pointer";
