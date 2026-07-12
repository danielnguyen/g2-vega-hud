export type InputFingerprint = {
  key: string;
  receivedAt: number;
};

export type InputDedupeState = InputFingerprint | null;

export type InputDedupeResult = {
  accepted: boolean;
  state: InputDedupeState;
};

export const DUPLICATE_EVENT_WINDOW_MS = 120;

export function filterDuplicateInput(
  previous: InputDedupeState,
  current: InputFingerprint,
  windowMs = DUPLICATE_EVENT_WINDOW_MS
): InputDedupeResult {
  const elapsed = current.receivedAt - (previous?.receivedAt ?? Number.NEGATIVE_INFINITY);
  const duplicate = previous?.key === current.key && elapsed >= 0 && elapsed <= windowMs;

  if (duplicate) {
    return { accepted: false, state: current };
  }

  return { accepted: true, state: current };
}
