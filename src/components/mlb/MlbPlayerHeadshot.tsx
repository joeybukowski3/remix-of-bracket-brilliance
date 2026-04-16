export default function MlbPlayerHeadshot({
  playerId,
  name,
  size = 40,
}: {
  playerId?: number | null;
  name: string;
  size?: number;
}) {
  const espnUrl = playerId
    ? `https://a.espncdn.com/combiner/i?img=/i/headshots/mlb/players/full/${playerId}.png&w=200&h=145`
    : null;

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {espnUrl ? (
        <img
          src={espnUrl}
          alt={name}
          className="rounded-full object-cover object-top ring-2 ring-border"
          style={{ width: size, height: size }}
          loading="lazy"
          onError={(event) => {
            const target = event.currentTarget;
            target.style.display = "none";
            const fallback = target.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
      ) : null}
      <div
        className="items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground ring-2 ring-border"
        style={{ width: size, height: size, display: espnUrl ? "none" : "flex" }}
      >
        {initials}
      </div>
    </div>
  );
}
