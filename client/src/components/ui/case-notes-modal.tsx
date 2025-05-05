import { useRef, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";
import { Textarea } from "./textarea";
import { Label } from "./label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { MemberService } from "@shared/schema";

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
  const [existingNote, setExistingNote] = useState<string>("");

  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Fetch existing case note when modal opens
  useEffect(() => {
    if (isOpen && service) {
      setIsLoading(true);
      apiRequest("GET", `/api/service-case-notes/${service.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.noteText) {
            setExistingNote(data.noteText);
            if (noteRef.current) {
              noteRef.current.value = data.noteText;
            }
          } else {
            setExistingNote("");
            if (noteRef.current) {
              noteRef.current.value = "";
            }
          }
        })
        .catch(() => {
          toast({
            title: "Error",
            description: "Failed to fetch case notes",
            variant: "destructive",
          });
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, service, toast]);

  const handleSave = async () => {
    if (!service || !noteRef.current) return;

    try {
      setIsLoading(true);
      const endpoint = existingNote 
        ? `/api/service-case-notes/${service.id}` 
        : "/api/service-case-notes";
      const method = existingNote ? "PUT" : "POST";
      
      const response = await apiRequest(method, endpoint, {
        serviceId: service.id,
        noteText: noteRef.current.value,
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
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save case note",
        variant: "destructive",
      });
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
            {service ? `Notes for ${service.serviceCategory} - ${service.serviceType} service provided on ${service.serviceDays.join(", ")} (${service.serviceHours} hrs)` : 'Case Note'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label htmlFor="case-note">Case Note</Label>
          <Textarea
            id="case-note"
            placeholder="Enter case notes here..."
            className="min-h-[200px]"
            ref={noteRef}
          />
          <DialogFooter>
            <Button
              onClick={handleSave}
              className="w-full"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Case Note
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}