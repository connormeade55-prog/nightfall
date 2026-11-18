import type { CustomRole } from "@/lib/custom-roles";

/** Admin-picked colors are data, so they're applied inline rather than as theme tokens. */
export function RoleBadge({ role }: { role: CustomRole }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-1.5 py-px text-[0.65rem] leading-4 font-semibold"
      style={{ color: role.color, borderColor: `${role.color}80`, backgroundColor: `${role.color}1f` }}
    >
      {role.name}
    </span>
  );
}
