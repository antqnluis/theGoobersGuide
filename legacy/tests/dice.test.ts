import { describe, expect, it } from 'vitest';
import { addRoll } from '../src/features/dice/rollHistory';
import {
  dieSizes,
  expression,
  rollDice,
  rollDie,
} from '../src/features/dice/rollDice';

describe('dice calculation', () => {
  it('rolls each supported die within its inclusive range', () => {
    for (const die of dieSizes) {
      expect(rollDie(die, () => 0)).toBe(1);
      expect(rollDie(die, () => die - 1)).toBe(die);
      for (let index = 0; index < 50; index++) {
        const result = rollDie(die);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(die);
      }
    }
  });

  it('rejects out-of-range random samples before mapping to faces', () => {
    const samples = [0xffff_ffff, 5];
    expect(rollDie(100, () => samples.shift()!)).toBe(6);
  });

  it('calculates multiple dice and positive, zero, and negative modifiers', () => {
    const values = [1, 5, 3];
    const positive = rollDice(6, 3, 4, () => values.shift()!);
    expect(positive.results).toEqual([2, 6, 4]);
    expect(positive.total).toBe(16);
    expect(positive.expression).toBe('3d6 + 4');
    expect(rollDice(20, 1, 0, () => 9).total).toBe(10);
    expect(rollDice(8, 2, -3, () => 0).total).toBe(-1);
    expect(expression(2, 8, -3)).toBe('2d8 - 3');
  });

  it('allows repeated rolls and keeps the newest ten in session history', () => {
    let history: ReturnType<typeof rollDice>[] = [];
    for (let index = 0; index < 12; index++) {
      history = addRoll(
        history,
        rollDice(20, 1, index, () => index),
      );
    }
    expect(history).toHaveLength(10);
    expect(history[0].modifier).toBe(11);
    expect(history[9].modifier).toBe(2);
    expect(history[0].total).toBe(23);
  });

  it('rejects invalid die types, counts, modifiers, and random values', () => {
    expect(() => rollDice(7 as 6, 1, 0)).toThrow();
    for (const count of [0, 21, 1.5, NaN])
      expect(() => rollDice(6, count, 0)).toThrow();
    for (const modifier of [-101, 101, 1.5, NaN])
      expect(() => rollDice(6, 1, modifier)).toThrow();
    expect(() => rollDie(6, () => -1)).toThrow();
    expect(() => rollDie(6, () => 0x1_0000_0000)).toThrow();
  });
});
