import { describe, expect, it } from 'vitest';
import {
  authenticateDemoUser,
  clearDemoSession,
  readDemoSession,
  writeDemoSession,
} from '../src/features/auth/demoAuth';

function memorySession() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('demo sign-in', () => {
  it('accepts either fixed demo account and rejects incorrect credentials', () => {
    expect(authenticateDemoUser('player-one', 'demo')).toMatchObject({
      id: 'player-one',
      displayName: 'Player One',
    });
    expect(authenticateDemoUser(' Player-Two ', 'demo')).toMatchObject({
      id: 'player-two',
      displayName: 'Player Two',
    });
    expect(authenticateDemoUser('player-one', 'wrong')).toBeNull();
    expect(authenticateDemoUser('unknown', 'demo')).toBeNull();
  });

  it('stores only the account ID for the tab session and clears it on logout', () => {
    const storage = memorySession();

    expect(writeDemoSession('player-two', storage)).toBe(true);
    expect(readDemoSession(storage)).toMatchObject({
      id: 'player-two',
      displayName: 'Player Two',
    });
    expect(clearDemoSession(storage)).toBe(true);
    expect(readDemoSession(storage)).toBeNull();
  });

  it('ignores an unknown account ID in session storage', () => {
    const storage = memorySession();
    storage.setItem('the-goobers-guide:demo-session', 'unknown');

    expect(readDemoSession(storage)).toBeNull();
  });
});
