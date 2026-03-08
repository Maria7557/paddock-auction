export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem("fleetbid_token");
}

export function getRole(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem("fleetbid_role");
}

export function logout(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem("fleetbid_token");
  window.localStorage.removeItem("fleetbid_role");
  window.location.href = "/login";
}

export function isLoggedIn(): boolean {
  return Boolean(getToken());
}
