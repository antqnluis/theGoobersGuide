import type { RollResult } from './rollDice';

export function addRoll(
  history: RollResult[],
  result: RollResult,
): RollResult[] {
  return [result, ...history].slice(0, 10);
}
