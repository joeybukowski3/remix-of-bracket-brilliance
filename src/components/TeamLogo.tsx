import { cn } from "@/lib/utils";

export default function TeamLogo({
  name,
  logo,
  className,
}: {
  name: string;
  logo?: string | null;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  if (logo && logo !== "/placeholder.svg") {
    return <img src={logo} alt={name} className={cn("shrink-0 object-contain", className)} loading="lazy" />;
  }

  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground", className)}>
      {initials}
    </div>
  );
}
