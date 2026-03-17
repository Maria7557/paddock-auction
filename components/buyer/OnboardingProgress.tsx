import Link from "next/link";

import { IconCheck } from "@/components/ui/icons";
import { formatAed } from "@/src/lib/utils";

import styles from "./OnboardingProgress.module.css";

type OnboardingProgressProps = {
  step: 1 | 2 | 3 | 4;
};

type ProgressState = "done" | "active" | "pending";

type StepConfig = {
  id: 1 | 2 | 3;
  title: string;
  subtitle?: string;
  href?: string;
  state: ProgressState;
};

function resolveStepState(currentStep: 1 | 2 | 3 | 4, stepId: 1 | 2 | 3): ProgressState {
  if (stepId === 1) {
    return currentStep >= 2 ? "done" : "active";
  }

  if (stepId === 2) {
    if (currentStep >= 3) {
      return "done";
    }

    return currentStep === 2 ? "active" : "pending";
  }

  if (currentStep === 4) {
    return "done";
  }

  return currentStep === 3 ? "active" : "pending";
}

function StepBody({ config }: { config: StepConfig }) {
  const content = (
    <div className={styles.stepCard}>
      <div className={styles.circleWrap}>
        <span
          className={[
            styles.circle,
            config.state === "done" ? styles.circleDone : "",
            config.state === "active" ? styles.circleActive : "",
            config.state === "pending" ? styles.circlePending : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {config.state === "done" ? <IconCheck size={16} aria-hidden="true" /> : config.id}
        </span>
      </div>
      <div className={styles.copy}>
        <strong>{config.title}</strong>
        {config.subtitle ? <span>{config.subtitle}</span> : null}
      </div>
    </div>
  );

  if (config.href) {
    return (
      <Link href={config.href} className={styles.stepLink}>
        {content}
      </Link>
    );
  }

  return content;
}

export function OnboardingProgress({ step }: OnboardingProgressProps) {
  if (step === 4) {
    return null;
  }

  const steps: StepConfig[] = [
    {
      id: 1,
      title: "Account verified",
      state: resolveStepState(step, 1),
    },
    {
      id: 2,
      title: "Add deposit",
      subtitle:
        step === 2
          ? `Minimum ${formatAed(5000)} · Fully refundable within 24 hours`
          : undefined,
      href: step === 2 ? "/wallet" : undefined,
      state: resolveStepState(step, 2),
    },
    {
      id: 3,
      title: "Ready to bid",
      state: resolveStepState(step, 3),
    },
  ];

  return (
    <section className={styles.panel} aria-label="Buyer onboarding progress">
      <div className={styles.row}>
        {steps.map((config, index) => (
          <div key={config.id} className={styles.segment}>
            <StepBody config={config} />
            {index < steps.length - 1 ? <div className={styles.connector} aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
