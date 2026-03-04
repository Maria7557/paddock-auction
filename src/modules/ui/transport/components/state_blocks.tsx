import { ReactNode } from "react";

type SkeletonBlockProps = {
  label?: string;
  rows?: number;
};

type EmptyBlockProps = {
  title: string;
  detail: string;
  action?: ReactNode;
};

type ErrorBlockProps = {
  title: string;
  detail: string;
  onRetry?: () => void;
};

export function SkeletonBlock({ label = "Loading", rows = 3 }: SkeletonBlockProps) {
  return (
    <section className="surface-panel" aria-label={label} aria-busy="true">
      <div className="skeleton-stack">
        {Array.from({ length: rows }).map((_, index) => (
          <div className="skeleton-line" key={`${label}-${index}`} />
        ))}
      </div>
    </section>
  );
}

export function EmptyBlock({ title, detail, action }: EmptyBlockProps) {
  return (
    <section className="surface-panel state-block">
      <h2>{title}</h2>
      <p className="text-muted">{detail}</p>
      {action ? <div>{action}</div> : null}
    </section>
  );
}

export function ErrorBlock({ title, detail, onRetry }: ErrorBlockProps) {
  return (
    <section className="surface-panel state-block tone-error" role="alert">
      <h2>{title}</h2>
      <p className="text-muted">{detail}</p>
      {onRetry ? (
        <button type="button" className="button button-primary" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </section>
  );
}
