import * as React from "react";
import { AlertCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import { cn } from "@/lib/utils";

interface ErrorProps {
  title?: string;
  message: string;
  variant?: "card" | "alert" | "inline";
  className?: string;
  fullPage?: boolean;
}

export function Error({
  title = "Error",
  message,
  variant = "alert",
  className,
  fullPage = false,
}: ErrorProps) {
  if (variant === "card") {
    const CardWrapper = ({ children }: { children: React.ReactNode }) =>
      fullPage ? (
        <div className="min-h-[60vh] w-full flex items-center justify-center">
          <div className="w-full max-w-md mx-4">{children}</div>
        </div>
      ) : (
        <>{children}</>
      );

    return (
      <CardWrapper>
        <Card className={cn("w-full", className)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              {title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{message}</p>
          </CardContent>
        </Card>
      </CardWrapper>
    );
  }

  if (variant === "alert") {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }

  // Inline variant
  return (
    <div className={cn("flex items-center gap-2 text-destructive text-sm", className)}>
      <AlertCircle className="h-4 w-4" />
      <span>{message}</span>
    </div>
  );
}