import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  className,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-3.5 h-10 text-sm font-medium transition-opacity duration-150 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]",
        variant === "primary" && "bg-accent text-accent-fg hover:opacity-90",
        variant === "secondary" && "bg-raised text-fg border border-border hover:bg-surface",
        variant === "ghost" && "text-muted hover:text-fg hover:bg-raised",
        variant === "danger" && "bg-deny/15 text-deny border border-deny/30 hover:bg-deny/25",
        className,
      )}
      {...props}
    />
  );
}
