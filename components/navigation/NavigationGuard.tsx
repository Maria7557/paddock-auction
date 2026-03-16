"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DEFAULT_NAVIGATION_GUARD_MESSAGE,
  getNavigationTargetPath,
  shouldBypassGuardedLinkClick,
} from "@/components/navigation/navigation-guard-utils";

type NavigationBlocker = {
  message: string;
};

type NavigationGuardContextValue = {
  confirmNavigation: (overrideMessage?: string) => boolean;
  setBlocker: (id: string, blocker: NavigationBlocker | null) => void;
};

type NavigationGuardProviderProps = {
  children: ReactNode;
};

type UseNavigationGuardOptions = {
  message?: string;
  when: boolean;
};

type GuardedLinkProps = React.ComponentProps<typeof Link> & {
  confirmMessage?: string;
};

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

function readBlockerMessage(blockers: Record<string, NavigationBlocker>): string | null {
  const [firstBlocker] = Object.values(blockers);
  return firstBlocker?.message ?? null;
}

export function NavigationGuardProvider({ children }: NavigationGuardProviderProps) {
  const [blockers, setBlockers] = useState<Record<string, NavigationBlocker>>({});
  const blockersRef = useRef(blockers);

  useEffect(() => {
    blockersRef.current = blockers;
  }, [blockers]);

  const setBlocker = useCallback((id: string, blocker: NavigationBlocker | null) => {
    setBlockers((previous) => {
      if (!blocker) {
        if (!(id in previous)) {
          return previous;
        }

        const next = { ...previous };
        delete next[id];
        return next;
      }

      const existing = previous[id];

      if (existing?.message === blocker.message) {
        return previous;
      }

      return {
        ...previous,
        [id]: blocker,
      };
    });
  }, []);

  const confirmNavigation = useCallback(
    (overrideMessage?: string) => {
      if (typeof window === "undefined") {
        return true;
      }

      const message = overrideMessage ?? readBlockerMessage(blockersRef.current);

      if (!message) {
        return true;
      }

      return window.confirm(message);
    },
    [],
  );

  const value = useMemo(
    () => ({
      confirmNavigation,
      setBlocker,
    }),
    [confirmNavigation, setBlocker],
  );

  return <NavigationGuardContext.Provider value={value}>{children}</NavigationGuardContext.Provider>;
}

export function useConfirmNavigation(): (overrideMessage?: string) => boolean {
  const context = useContext(NavigationGuardContext);
  const confirmNavigation = context?.confirmNavigation;

  return useCallback(
    (overrideMessage?: string) => {
      if (!confirmNavigation) {
        return true;
      }

      return confirmNavigation(overrideMessage);
    },
    [confirmNavigation],
  );
}

export function useNavigationGuard({
  message = DEFAULT_NAVIGATION_GUARD_MESSAGE,
  when,
}: UseNavigationGuardOptions): { confirmOwnNavigation: () => boolean } {
  const context = useContext(NavigationGuardContext);
  const blockerId = useId();
  const setBlocker = context?.setBlocker;

  useEffect(() => {
    if (!setBlocker) {
      return;
    }

    setBlocker(blockerId, when ? { message } : null);

    return () => {
      setBlocker(blockerId, null);
    };
  }, [blockerId, message, setBlocker, when]);

  useEffect(() => {
    if (!when) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [when]);

  const confirmOwnNavigation = useCallback(() => {
    if (!when || typeof window === "undefined") {
      return true;
    }

    return window.confirm(message);
  }, [message, when]);

  return { confirmOwnNavigation };
}

export function GuardedLink({ confirmMessage, href, onClick, ...props }: GuardedLinkProps) {
  const pathname = usePathname();
  const confirmNavigation = useConfirmNavigation();

  const nextPathname = useMemo(() => {
    if (typeof href === "string" || href instanceof URL) {
      return getNavigationTargetPath(href);
    }

    if (typeof href.pathname === "string") {
      return getNavigationTargetPath(href.pathname);
    }

    return null;
  }, [href]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    if (
      shouldBypassGuardedLinkClick({
        altKey: event.altKey,
        button: event.button,
        ctrlKey: event.ctrlKey,
        defaultPrevented: event.defaultPrevented,
        download: event.currentTarget.getAttribute("download") ?? undefined,
        metaKey: event.metaKey,
        nextPathname,
        shiftKey: event.shiftKey,
        target: event.currentTarget.getAttribute("target"),
      })
    ) {
      onClick?.(event);
      return;
    }

    if (nextPathname && pathname && nextPathname === getNavigationTargetPath(pathname)) {
      onClick?.(event);
      return;
    }

    if (!confirmNavigation(confirmMessage)) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
  }

  return <Link {...props} href={href} onClick={handleClick} />;
}

export { DEFAULT_NAVIGATION_GUARD_MESSAGE } from "@/components/navigation/navigation-guard-utils";
