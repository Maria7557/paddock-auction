"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { AutocompleteField } from "@/components/register/AutocompleteField";
import { api, getApiErrorMessage, getApiErrorPayload } from "@/src/lib/api-client";
import {
  findCountryByName,
  loadCountryCities,
  type LocationCountry,
} from "@/src/lib/location_directory";
import { LOCATION_COUNTRIES } from "@/src/lib/location_countries";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default function BuyerRegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [country, setCountry] = useState("United Arab Emirates");
  const [city, setCity] = useState("");
  const [countries] = useState<LocationCountry[]>(LOCATION_COUNTRIES);
  const [cities, setCities] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const matchedCountry = findCountryByName(countries, country);

    if (!matchedCountry) {
      setCities([]);
      return () => {
        active = false;
      };
    }

    void loadCountryCities(matchedCountry.isoCode).then((nextCities) => {
      if (active) {
        setCities(nextCities);
      }
    });

    return () => {
      active = false;
    };
  }, [countries, country]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!companyName.trim()) {
      setFeedback("Company name is required.");
      return;
    }

    if (!country.trim()) {
      setFeedback("Country is required.");
      return;
    }

    if (!city.trim()) {
      setFeedback("City is required.");
      return;
    }

    if (!phoneNumber.trim()) {
      setFeedback("Phone number is required.");
      return;
    }

    if (password !== confirmPassword) {
      setFeedback("Password confirmation does not match.");
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const credentials = {
        email,
        password,
      };

      await api.auth.register({
        email: credentials.email,
        password: credentials.password,
        role: "BUYER",
        companyName,
        country,
        city,
        phoneNumber,
      });

      const { user } = await api.auth.login(credentials.email, credentials.password);

      if (typeof window !== "undefined") {
        window.localStorage.setItem("fleetbid_role", user.role);
        window.location.href = "/dashboard";
      }
    } catch (error) {
      const payload = getApiErrorPayload<{
        error?: string;
        issues?: Array<{
          path?: string;
          message?: string;
        }>;
      }>(error);

      if (payload?.error === "EMAIL_ALREADY_EXISTS") {
        setFeedback("Email is already registered.");
        return;
      }

      if (payload?.error === "CONFLICT") {
        setFeedback("Email or company account is already registered.");
        return;
      }

      if (payload?.error === "INVALID_REQUEST" && payload.issues?.[0]?.message) {
        setFeedback(payload.issues[0].message);
        return;
      }

      setFeedback(getApiErrorMessage(error, "Registration failed due to network error."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MarketShell>
      <section className="auth-layout">
        <article className="surface-panel auth-panel">
          <h1>Register as Buyer</h1>
          <p>Create your buyer account. You will enter the workspace immediately, and bidding unlocks as soon as your deposit is ready.</p>

          <form className="auth-form" onSubmit={onSubmit}>
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
            <label>
              Company name
              <input
                type="text"
                placeholder="Buyer Co LLC"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
              />
            </label>
            <label>
              Phone number
              <input
                type="tel"
                placeholder="+971 50 123 4567"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                required
              />
            </label>
            <AutocompleteField
              label="Country"
              listId="buyer-country-options"
              value={country}
              onChange={setCountry}
              placeholder="Start typing a country"
              helperText="Start typing to search all countries."
              required
            />
            <datalist id="buyer-country-options">
              {countries.map((option) => (
                <option key={option.isoCode} value={option.name} />
              ))}
            </datalist>
            <AutocompleteField
              label="City"
              listId="buyer-city-options"
              value={city}
              onChange={setCity}
              placeholder="Start typing a city"
              helperText="Start typing to search cities for the selected country."
              required
            />
            <datalist id="buyer-city-options">
              {cities.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
              />
            </label>
            <button type="submit" className="button button-primary" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit registration"}
            </button>
          </form>

          {feedback ? <p className="text-muted">{feedback}</p> : null}

          <p className="text-muted">
            Already registered? <Link href="/login/buyer">Sign in</Link>
          </p>
        </article>
      </section>
    </MarketShell>
  );
}
