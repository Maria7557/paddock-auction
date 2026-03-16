"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import {
  api,
  getApiErrorMessage,
  type ApiUser,
} from "@/src/lib/api-client";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

type Step = "request" | "confirm";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  function finishLogin(user: ApiUser): void {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("fleetbid_role", user.role);
    }

    if (user.role === "ADMIN") {
      window.location.href = "/admin";
      return;
    }

    if (user.role === "SELLER") {
      router.push("/seller/dashboard");
      return;
    }

    router.push("/dashboard");
  }

  async function sendPasscode(): Promise<void> {
    setIsRequesting(true);
    setNotice(null);
    setError(null);

    try {
      const response = await api.auth.requestPasswordReset(email);
      setStep("confirm");
      setNotice(response.message);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to send passcode due to a network error."));
    } finally {
      setIsRequesting(false);
    }
  }

  async function requestPasscode(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await sendPasscode();
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsResetting(true);
    setError(null);

    try {
      const { user } = await api.auth.confirmPasswordReset({
        email,
        code,
        password,
        confirmPassword,
      });

      finishLogin(user);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to reset password due to a network error."));
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <MarketShell>
      <section className="auth-layout">
        <article className="surface-panel auth-panel">
          <h1>Forgot password</h1>
          <p>Request a one-time passcode, choose a new password, and we will log you in automatically.</p>

          {notice ? <p className="inline-note tone-success">{notice}</p> : null}
          {error ? <p className="inline-note tone-error">{error}</p> : null}

          {step === "request" ? (
            <form className="auth-form" onSubmit={requestPasscode}>
              <label>
                Work email
                <input
                  type="email"
                  placeholder="buyer@company.ae"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>

              <button type="submit" className="button button-primary" disabled={isRequesting}>
                {isRequesting ? "Sending passcode..." : "Send passcode"}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={resetPassword}>
              <label>
                Work email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>

              <label>
                Passcode
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  placeholder="123456"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </label>

              <label>
                New password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>

              <label>
                Confirm new password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </label>

              <button type="submit" className="button button-primary" disabled={isResetting}>
                {isResetting ? "Saving password..." : "Save new password"}
              </button>
            </form>
          )}

          <div className="inline-actions" style={{ marginTop: "12px" }}>
            {step === "confirm" ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  void sendPasscode();
                }}
                disabled={isRequesting || isResetting}
              >
                Resend passcode
              </button>
            ) : null}
            <Link href="/login" className="button button-secondary">
              Back to log in
            </Link>
          </div>
        </article>
      </section>
    </MarketShell>
  );
}
