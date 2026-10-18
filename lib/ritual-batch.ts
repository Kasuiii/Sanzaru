import type {RitualAction} from "./ritual-engine";

// A sync transaction has one server timestamp. Two messages in it would violate
// the per-player rate limit and roll the entire transaction back.
export function nextRitualBatch(queue: readonly RitualAction[]): RitualAction[] {
  const batch: RitualAction[] = [];
  for (const action of queue) {
    batch.push(action);
    if (action.type === "chat" || action.type === "signal" || batch.length === 12) break;
  }
  return batch;
}
