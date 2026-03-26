"use client";

import { useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { getApiErrorMessage, initiateTopup } from "@/src/lib/api-client";
import { stripePromise } from "@/src/lib/stripe-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./WalletTopupForm.module.css";

const MIN_AMOUNT_AED = 10;
const PRESET_AMOUNTS = [10, 500, 1000, 5000] as const;

type Step = 1 | 2 | 3;

interface WalletTopupFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

type PaymentStepProps = {
  amount: number;
  onBack: () => void;
  onCancel: () => void;
  onSuccess: () => void;
};

function parseCustomAmount(value: string): number | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function resolveAmount(selectedPreset: number | null, customAmount: string): number {
  const parsedCustomAmount = parseCustomAmount(customAmount);
  return parsedCustomAmount ?? selectedPreset ?? 0;
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <div className={styles.stepIndicator} aria-label={`Step ${step} of 3`}>
      {[1, 2, 3].map((item, index) => (
        <span key={item} className={styles.stepIndicatorItemWrap}>
          <span className={`${styles.stepIndicatorItem} ${step === item ? styles.stepIndicatorItemActive : ""}`}>
            {item}
          </span>
          {index < 2 ? <span className={styles.stepDivider}>·</span> : null}
        </span>
      ))}
    </div>
  );
}

function PaymentStep({ amount, onBack, onCancel, onSuccess }: PaymentStepProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePayNow = async () => {
    if (isSubmitting) {
      return;
    }

    if (!stripe || !elements) {
      setPaymentError("Card details are still loading. Please try again.");
      return;
    }

    setIsSubmitting(true);
    setPaymentError(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (result.error) {
      setPaymentError(result.error.message ?? "Payment could not be confirmed. Please try again.");
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    onSuccess();
  };

  return (
    <div className={styles.stepPane}>
      <div className={styles.copy}>
        <p className={styles.paymentAmount}>
          <strong>Paying {formatAed(amount)}</strong>
        </p>
      </div>

      <div className={styles.paymentShell}>
        <PaymentElement />
      </div>

      {paymentError ? (
        <p className={styles.error} role="alert">
          {paymentError}
        </p>
      ) : null}

      <button type="button" className={styles.secondaryLink} onClick={onBack} disabled={isSubmitting}>
        ← Change amount
      </button>

      <div className={styles.footerActions}>
        <button type="button" className={styles.ghostLink} onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>

        <button
          type="button"
          className={`btn btn-primary ${styles.primaryAction}`}
          onClick={() => void handlePayNow()}
          disabled={isSubmitting || !stripe || !elements}
        >
          <span className={styles.buttonContent}>
            {isSubmitting ? <span className={styles.spinner} aria-hidden="true" /> : null}
            <span>Pay now</span>
          </span>
        </button>
      </div>
    </div>
  );
}

export default function WalletTopupForm({ onSuccess, onCancel }: WalletTopupFormProps) {
  const [step, setStep] = useState<Step>(1);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [confirmedAmount, setConfirmedAmount] = useState<number | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const resetAttempt = () => {
    idempotencyKeyRef.current = null;
    setClientSecret(null);
    setSetupError(null);
  };

  const handlePresetSelect = (amount: number) => {
    setSelectedPreset(amount);
    setCustomAmount("");
    setAmountError(null);
    resetAttempt();
  };

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    setSelectedPreset(null);
    setSetupError(null);
    idempotencyKeyRef.current = null;

    const parsedAmount = parseCustomAmount(value);

    if (!value.trim() || (parsedAmount !== null && parsedAmount >= MIN_AMOUNT_AED)) {
      setAmountError(null);
    }
  };

  const handleContinue = async () => {
    const amount = resolveAmount(selectedPreset, customAmount);

    if (amount < MIN_AMOUNT_AED) {
      setAmountError("Minimum deposit is AED 10");
      return;
    }

    setAmountError(null);
    setSetupError(null);
    setIsPreparingPayment(true);

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    try {
      const payment = await initiateTopup(amount, idempotencyKeyRef.current);

      setConfirmedAmount(amount);
      setClientSecret(payment.clientSecret);
      setStep(2);
    } catch (error) {
      setSetupError(getApiErrorMessage(error, "Payment setup failed — please try again"));
    } finally {
      setIsPreparingPayment(false);
    }
  };

  const handleChangeAmount = () => {
    resetAttempt();
    setStep(1);
  };

  const handlePaymentSuccess = () => {
    setStep(3);
  };

  const currentAmount = confirmedAmount ?? resolveAmount(selectedPreset, customAmount);

  return (
    <div className={styles.card}>
      <StepIndicator step={step} />

      {step === 1 ? (
        <div className={styles.stepPane}>
          <div className={styles.copy}>
            <h2 className={styles.title}>Add funds to your wallet</h2>
            <p className={styles.subtitle}>Funds are fully refundable while no bids are active</p>
          </div>

          <div className={styles.presetRow}>
            {PRESET_AMOUNTS.map((amount) => {
              const isSelected = selectedPreset === amount && !customAmount.trim();

              return (
                <button
                  key={amount}
                  type="button"
                  className={`${styles.presetButton} ${isSelected ? styles.presetButtonSelected : ""}`}
                  onClick={() => handlePresetSelect(amount)}
                >
                  {formatAed(amount)}
                </button>
              );
            })}
          </div>

          <div className={styles.inputGroup}>
            <input
              type="number"
              min={MIN_AMOUNT_AED}
              step="1"
              inputMode="decimal"
              className={styles.input}
              placeholder="Or enter amount"
              value={customAmount}
              onChange={(event) => handleCustomAmountChange(event.target.value)}
            />

            {amountError ? (
              <p className={styles.error} role="alert">
                {amountError}
              </p>
            ) : null}

            {setupError ? (
              <p className={styles.error} role="alert">
                {setupError}
              </p>
            ) : null}
          </div>

          <div className={styles.footerActions}>
            <button type="button" className={styles.ghostLink} onClick={onCancel} disabled={isPreparingPayment}>
              Cancel
            </button>

            <button
              type="button"
              className={`btn btn-primary ${styles.primaryAction}`}
              onClick={() => void handleContinue()}
              disabled={isPreparingPayment}
            >
              <span className={styles.buttonContent}>
                {isPreparingPayment ? <span className={styles.spinner} aria-hidden="true" /> : null}
                <span>Continue →</span>
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 && clientSecret && currentAmount >= MIN_AMOUNT_AED ? (
        <Elements key={clientSecret} stripe={stripePromise} options={{ clientSecret }}>
          <PaymentStep
            amount={currentAmount}
            onBack={handleChangeAmount}
            onCancel={onCancel}
            onSuccess={handlePaymentSuccess}
          />
        </Elements>
      ) : null}

      {step === 3 ? (
        <div className={`${styles.stepPane} ${styles.successPane}`}>
          <div className={styles.successIcon} aria-hidden="true">
            <svg viewBox="0 0 56 56" role="presentation">
              <circle className={styles.successCircle} cx="28" cy="28" r="24" />
              <path className={styles.successCheck} d="M18 28.5 24.5 35 38 21.5" />
            </svg>
          </div>

          <div className={styles.copy}>
            <h2 className={styles.title}>Payment received</h2>
            <p className={styles.subtitle}>Your wallet balance will update within a few seconds</p>
          </div>

          <button type="button" className={`btn btn-primary btn-full ${styles.doneButton}`} onClick={onSuccess}>
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}
