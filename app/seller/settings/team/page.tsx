"use client";

import { useCallback, useEffect, useState } from "react";

import { InviteModal } from "@/components/seller/InviteModal";
import { TeamRoleRow } from "@/components/seller/TeamRoleRow";
import { api, getApiErrorMessage } from "@/src/lib/api-client";

type TeamMember = {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "VIEWER";
  status: string;
};

type TeamResponse = {
  members: TeamMember[];
};

export default function SellerSettingsTeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = await api.seller.team.list<TeamResponse>({ cache: "no-store" });
      setMembers(payload.members ?? []);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unexpected error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function inviteMember(input: { email: string; role: "OWNER" | "ADMIN" | "VIEWER" }): Promise<void> {
    setError(null);
    setNotice(null);

    await api.seller.team.invite(input);

    setNotice("Invite saved");
    await loadMembers();
  }

  async function updateRole(userId: string, role: "OWNER" | "ADMIN" | "VIEWER"): Promise<void> {
    setError(null);
    setNotice(null);

    try {
      await api.seller.team.updateRole(userId, { role });

      setNotice("Role updated");
      await loadMembers();
    } catch (updateError) {
      setError(getApiErrorMessage(updateError, "Failed to update role"));
    }
  }

  async function revokeAccess(userId: string): Promise<void> {
    const confirmed = window.confirm("Revoke access for this member?");

    if (!confirmed) {
      return;
    }

    setError(null);
    setNotice(null);

    try {
      await api.seller.team.remove(userId);

      setNotice("Access revoked");
      await loadMembers();
    } catch (revokeError) {
      setError(getApiErrorMessage(revokeError, "Failed to revoke access"));
    }
  }

  return (
    <section className="surface-panel seller-section-block">
      <div className="seller-section-head">
        <h2>Team Members</h2>
        <button type="button" className="button button-primary" onClick={() => setInviteOpen(true)}>
          + Invite Member
        </button>
      </div>

      {loading ? <p className="text-muted">Loading team...</p> : null}
      {error ? <p className="inline-note tone-error">{error}</p> : null}
      {notice ? <p className="inline-note tone-success">{notice}</p> : null}

      {!loading ? (
        <div className="seller-table-scroll">
          <table className="seller-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <TeamRoleRow
                  key={member.userId}
                  member={member}
                  onRoleChange={(userId, role) => {
                    void updateRole(userId, role);
                  }}
                  onRevoke={(userId) => {
                    void revokeAccess(userId);
                  }}
                />
              ))}
              {members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="seller-empty-cell">
                    No team members yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={async (input) => {
          await inviteMember(input);
        }}
      />
    </section>
  );
}
