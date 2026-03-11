"use client";

import { FormEvent, useState } from "react";

type InviteModalProps = {
  open: boolean;
  onClose: () => void;
  onInvite: (input: { email: string; role: "OWNER" | "ADMIN" | "VIEWER" }) => Promise<void>;
};

export function InviteModal({ open, onClose, onInvite }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"OWNER" | "ADMIN" | "VIEWER">("VIEWER");
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return null;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);

    try {
      await onInvite({ email, role });
      setEmail("");
      setRole("VIEWER");
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="seller-modal-backdrop" role="dialog" aria-modal="true">
      <div className="seller-modal-panel">
        <h3>Invite Member</h3>

        <form className="seller-form-grid" onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="member@company.ae"
            />
          </label>

          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as "OWNER" | "ADMIN" | "VIEWER")}>
              <option value="OWNER">OWNER</option>
              <option value="ADMIN">ADMIN</option>
              <option value="VIEWER">VIEWER</option>
            </select>
          </label>

          <div className="seller-modal-actions">
            <button type="submit" className="button button-primary" disabled={submitting}>
              {submitting ? "Inviting..." : "Send Invite"}
            </button>
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
