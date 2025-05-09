import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingProps {
  className?: string;
  size?: "sm" | "default" | "lg";
  text?: string;
  center?: boolean;
}

export function Loading({ className, size = "default", text, center = true }: LoadingProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    default: "h-8 w-8",
    lg: "h-12 w-12"
  };

  return (
    <div className={cn(
      "flex items-center gap-2",
      center && "justify-center",
      center && "min-h-[60vh]",
      className
    )}>
      <Loader2 className={cn(sizeClasses[size], "animate-spin text-primary")} />
      {text && <span className="text-muted-foreground">{text}</span>}
    </div>
  );
}

export function ButtonLoading({ className, size = "sm", text }: Omit<LoadingProps, "center">) {
  const sizeClasses = {
    sm: "h-4 w-4",
    default: "h-5 w-5",
    lg: "h-6 w-6"
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Loader2 className={cn(sizeClasses[size], "animate-spin")} />
      {text}
    </div>
  );
}