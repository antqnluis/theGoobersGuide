import { createContext, useContext, useEffect, useRef } from 'react';

type RegisterGuard = (guard: () => boolean) => () => void;

export const NavigationGuardContext = createContext<RegisterGuard>(
  () => () => {},
);

export function useUnsavedChanges(dirty: boolean, message: string) {
  const allowNavigation = useRef(false);
  const registerGuard = useContext(NavigationGuardContext);

  useEffect(() => {
    if (!dirty) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const unregister = registerGuard(
      () => allowNavigation.current || window.confirm(message),
    );

    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      unregister();
    };
  }, [dirty, message, registerGuard]);

  return allowNavigation;
}
