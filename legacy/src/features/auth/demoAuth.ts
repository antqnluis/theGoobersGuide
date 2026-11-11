export const DEMO_USERS = [
  {
    id: 'player-one',
    username: 'player-one',
    password: 'demo',
    displayName: 'Player One',
  },
  {
    id: 'player-two',
    username: 'player-two',
    password: 'demo',
    displayName: 'Player Two',
  },
] as const;

export type DemoUserId = (typeof DEMO_USERS)[number]['id'];
export type DemoUser = Omit<(typeof DEMO_USERS)[number], 'password'>;

export const DEFAULT_DEMO_USER_ID: DemoUserId = 'player-one';
const SESSION_KEY = 'the-goobers-guide:demo-session';
type SessionStoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function isDemoUserId(value: unknown): value is DemoUserId {
  return DEMO_USERS.some((user) => user.id === value);
}

export function demoUserById(id: unknown): DemoUser | null {
  const user = DEMO_USERS.find((candidate) => candidate.id === id);
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
  };
}

export function authenticateDemoUser(
  username: string,
  password: string,
): DemoUser | null {
  const user = DEMO_USERS.find(
    (candidate) =>
      candidate.username === username.trim().toLowerCase() &&
      candidate.password === password,
  );
  return user ? demoUserById(user.id) : null;
}

export function readDemoSession(storage?: SessionStoragePort): DemoUser | null {
  try {
    return demoUserById(
      (storage ?? window.sessionStorage).getItem(SESSION_KEY),
    );
  } catch {
    return null;
  }
}

export function writeDemoSession(
  userId: DemoUserId,
  storage?: SessionStoragePort,
): boolean {
  try {
    (storage ?? window.sessionStorage).setItem(SESSION_KEY, userId);
    return true;
  } catch {
    return false;
  }
}

export function clearDemoSession(storage?: SessionStoragePort): boolean {
  try {
    (storage ?? window.sessionStorage).removeItem(SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}
