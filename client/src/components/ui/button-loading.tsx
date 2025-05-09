import { Loader2 } from "lucide-react";

interface ButtonLoadingProps {
  text?: string;
}

export function ButtonLoading({ text = "Loading..." }: ButtonLoadingProps) {
  return (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {text}
    </>
  );
}