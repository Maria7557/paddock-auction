export const DEFAULT_NAVIGATION_GUARD_MESSAGE = "You have unsaved changes. Leave this page?";

type GuardedClickState = {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  download?: string;
  metaKey: boolean;
  nextPathname: string | null;
  shiftKey: boolean;
  target?: string | null;
};

function normalizePathname(value: string): string {
  if (!value) {
    return "/";
  }

  const normalized = value.startsWith("/") ? value : `/${value}`;

  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

export function getNavigationTargetPath(href: string | URL): string | null {
  const value = typeof href === "string" ? href : href.toString();

  if (!value) {
    return null;
  }

  if (value.startsWith("#")) {
    return null;
  }

  try {
    const url = new URL(value, "https://fleetbid.local");
    return normalizePathname(url.pathname);
  } catch {
    return normalizePathname(value.split(/[?#]/, 1)[0] ?? "");
  }
}

export function shouldBypassGuardedLinkClick({
  altKey,
  button,
  ctrlKey,
  defaultPrevented,
  download,
  metaKey,
  nextPathname,
  shiftKey,
  target,
}: GuardedClickState): boolean {
  if (defaultPrevented) {
    return true;
  }

  if (button !== 0) {
    return true;
  }

  if (metaKey || ctrlKey || shiftKey || altKey) {
    return true;
  }

  if (target && target !== "_self") {
    return true;
  }

  if (download) {
    return true;
  }

  return nextPathname === null;
}
