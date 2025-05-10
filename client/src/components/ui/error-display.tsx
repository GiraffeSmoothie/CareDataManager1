import { AlertCircle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "./alert";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { cn } from "@/lib/utils";

interface ErrorDisplayProps {
  title?: string;
  message: string;
  variant?: "inline" | "card" | "alert";
  className?: string;
}

export function ErrorDisplay({
  title = "Error",
  message,
  variant = "inline",
  className,
}: ErrorDisplayProps) {
  if (variant === "card") {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    );
  }

  if (variant === "alert") {
    return (
      <Alert className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}