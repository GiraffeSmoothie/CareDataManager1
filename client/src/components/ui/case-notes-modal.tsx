import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";
import { Textarea } from "./textarea";
import { Label } from "./label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { MemberService } from "@shared/schema";
import { ErrorDisplay } from "./error-display";

export function CaseNotesModal({
  isOpen,
  onClose,
  service,
  onSaved
}: {
  isOpen: boolean;
  onClose: () => void;
  service: MemberService;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    const notes = textareaRef.current?.value;
    if (!notes?.trim()) {
      setError("Please enter case notes");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest("POST", `/api/service/${service.id}/case-notes`, {
        notes,
        serviceId: service.id
      });

      if (!response.ok) {
        throw new Error("Failed to save case note");
      }

      toast({
        title: "Success",
        description: "Case note saved successfully",
      });
      if (onSaved) {
        onSaved();
      }
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save case note");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {service ? `Case Notes - ${service.serviceCategory} (${service.serviceType})` : 'Service Case Notes'}
          </DialogTitle>
          <DialogDescription>
            Add case notes for this service. These notes will be saved to the client's record.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <ErrorDisplay
            message={error}
            className="mb-4"
          />
        )}

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="case-notes">Case Notes</Label>
            <Textarea
              id="case-notes"
              ref={textareaRef}
              placeholder="Enter case notes here..."
              className="min-h-[150px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Notes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}