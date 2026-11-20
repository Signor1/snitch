// Vibration API where supported, no-op elsewhere.
const can = () => typeof navigator !== "undefined" && "vibrate" in navigator;

export const haptics = {
  tap: () => can() && navigator.vibrate(8),
  stamp: () => can() && navigator.vibrate([0, 18, 40, 10]),
  reveal: () => can() && navigator.vibrate([0, 30, 60, 30, 60, 80]),
  tick: () => can() && navigator.vibrate(4),
};
