"use client";

type TeamMember = {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "VIEWER";
  status: string;
};

type TeamRoleRowProps = {
  member: TeamMember;
  onRoleChange: (userId: string, role: "OWNER" | "ADMIN" | "VIEWER") => void;
  onRevoke: (userId: string) => void;
};

export function TeamRoleRow({ member, onRoleChange, onRevoke }: TeamRoleRowProps) {
  return (
    <tr>
      <td>{member.name}</td>
      <td>{member.email}</td>
      <td>
        <select
          value={member.role}
          onChange={(event) => onRoleChange(member.userId, event.target.value as "OWNER" | "ADMIN" | "VIEWER")}
        >
          <option value="OWNER">OWNER</option>
          <option value="ADMIN">ADMIN</option>
          <option value="VIEWER">VIEWER</option>
        </select>
      </td>
      <td>{member.status}</td>
      <td>
        <button
          type="button"
          className="seller-action-btn seller-action-danger"
          onClick={() => onRevoke(member.userId)}
        >
          Revoke Access
        </button>
      </td>
    </tr>
  );
}
