export type FeedbackTone = "success" | "info" | "warning" | "error";

export type InlineFeedbackProps = {
  title: string;
  detail?: string;
  tone?: FeedbackTone;
  code?: string;
};

export function InlineFeedback({
  title,
  detail,
  tone = "info",
  code,
}: InlineFeedbackProps) {
  return (
    <div className={`inline-feedback tone-${tone}`} role="status" aria-live="polite">
      <div>
        <p className="feedback-title">{title}</p>
        {detail ? <p className="feedback-detail">{detail}</p> : null}
      </div>
      {code ? <code>{code}</code> : null}
    </div>
  );
}

export type ToastMessage = {
  id: string;
  title: string;
  detail?: string;
  tone: FeedbackTone;
};

type ToastStackProps = {
  messages: ToastMessage[];
};

export function ToastStack({ messages }: ToastStackProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="toast-stack" aria-live="polite" aria-label="Notifications">
      {messages.map((message) => (
        <article key={message.id} className={`toast-item tone-${message.tone}`}>
          <p className="feedback-title">{message.title}</p>
          {message.detail ? <p className="feedback-detail">{message.detail}</p> : null}
        </article>
      ))}
    </div>
  );
}
