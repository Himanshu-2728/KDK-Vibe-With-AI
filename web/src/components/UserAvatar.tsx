import type { User } from "../lib/types";

export function UserAvatar({
  user,
  size = 34,
}: {
  user: Pick<User, "displayName" | "email">;
  size?: number;
}) {
  const name = user.displayName || user.email;
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-grid",
        placeItems: "center",
        background: "linear-gradient(135deg, var(--brand), #0ea5e9)",
        color: "#fff",
        fontSize: Math.max(10, size * 0.4),
        fontWeight: 800,
        flexShrink: 0,
      }}
      title={name}
    >
      {initials}
    </span>
  );
}