import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type LogoProps = {
  size?: number;
  width?: number;
  className?: string;
  clickable?: boolean;
};

export default function Logo({ size = 36, width, className, clickable = false }: LogoProps) {
  const image = (
    <img
      src="/assets/logo.svg"
      alt="JoeKnowsBall"
      style={width ? { width: `${width}px` } : { height: `${size}px` }}
      className={cn("block w-auto max-w-none object-contain", className)}
    />
  );

  if (!clickable) return image;

  return (
    <Link
      to="/"
      aria-label="JoeKnowsBall home"
      className="inline-flex items-center transition duration-200 hover:scale-[1.01] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {image}
    </Link>
  );
}
