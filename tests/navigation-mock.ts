import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
export const navigation = {
  url: "/results",
  router: {
    push(url: string) { navigation.url = url; for (const listener of listeners) listener(); },
    replace(url: string) { navigation.url = url; for (const listener of listeners) listener(); },
  },
};
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function snapshot() { return navigation.url; }
export function useSearchParams() {
  return new URL(useSyncExternalStore(subscribe, snapshot), "http://localhost").searchParams;
}
export function usePathname() {
  return new URL(useSyncExternalStore(subscribe, snapshot), "http://localhost").pathname;
}
export function useRouter() { return navigation.router; }
