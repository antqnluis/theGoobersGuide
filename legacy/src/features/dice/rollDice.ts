export const dieSizes = [4, 6, 8, 10, 12, 20, 100] as const;
export type DieSize = (typeof dieSizes)[number];

export interface RollResult {
  expression: string;
  die: DieSize;
  count: number;
  results: number[];
  modifier: number;
  total: number;
  rolledAt: string;
}

export function expression(
  count: number,
  die: DieSize,
  modifier: number,
): string {
  return `${count}d${die}${modifier < 0 ? ' - ' : ' + '}${Math.abs(modifier)}`;
}

function randomUint32(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0];
}

export function rollDie(die: DieSize, nextUint32 = randomUint32): number {
  if (!dieSizes.includes(die)) throw new RangeError('Choose a supported die.');
  const range = 0x1_0000_0000;
  const ceiling = Math.floor(range / die) * die;
  let value: number;
  do {
    value = nextUint32();
    if (!Number.isInteger(value) || value < 0 || value >= range)
      throw new RangeError('Random source returned an invalid value.');
  } while (value >= ceiling);
  return (value % die) + 1;
}

export function rollDice(
  die: DieSize,
  count: number,
  modifier: number,
  nextUint32 = randomUint32,
): RollResult {
  if (!dieSizes.includes(die)) throw new RangeError('Choose a supported die.');
  if (!Number.isInteger(count) || count < 1 || count > 20)
    throw new RangeError('Choose between 1 and 20 dice.');
  if (!Number.isInteger(modifier) || modifier < -100 || modifier > 100)
    throw new RangeError('Enter a whole-number modifier from -100 to 100.');
  const results = Array.from({ length: count }, () => rollDie(die, nextUint32));
  return {
    expression: expression(count, die, modifier),
    die,
    count,
    results,
    modifier,
    total: results.reduce((sum, result) => sum + result, modifier),
    rolledAt: new Date().toISOString(),
  };
}
