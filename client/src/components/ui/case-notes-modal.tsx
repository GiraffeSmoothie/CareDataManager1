import { useRef, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";
import { Textarea } from "./textarea";
import { Label } from "./label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { MemberService } from "@shared/schema";
import { ErrorDisplay } from "./error-display";

// Define a type for case notes
interface CaseNote {
  id: number;
  serviceId: number;
  noteText: string;
  createdAt: string;
  createdBy: number;
  createdByName?: string;
}

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
  const [currentUser, setCurrentUser] = useState<{ id: number; name?: string } | null>(null);
  const [caseNotes, setCaseNotes] = useState<CaseNote[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);

  // Fetch current user info when component mounts
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const response = await fetch('/api/auth/status', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.authenticated && data.user) {
            setCurrentUser(data.user);
          }
        }
      } catch (error) {
        console.error('Failed to fetch user info:', error);
      }
    };

    fetchCurrentUser();
  }, []);

  // Fetch case notes when the service changes or modal opens
  useEffect(() => {
    if (service?.id && isOpen) {
      fetchCaseNotes();
    }
  }, [service?.id, isOpen]);

  // Function to fetch existing case notes
  const fetchCaseNotes = async () => {
    if (!service?.id) return;

    setIsLoadingNotes(true);
    setError(null);

    try {
      const response = await fetch(`/api/service-case-notes/service/${service.id}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch case notes');
      }

      const data = await response.json();
      setCaseNotes(data);
    } catch (error) {
      console.error('Error fetching case notes:', error);
      setError('Failed to load existing case notes');
    } finally {
      setIsLoadingNotes(false);
    }
  };

  const handleSubmit = async () => {
    const notes = textareaRef.current?.value;
    if (!notes?.trim()) {
      setError("Please enter case notes");
      return;
    }

    // Check if user is logged in
    if (!currentUser?.id) {
      setError("You must be logged in to add case notes");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use the correct API endpoint for service case notes
      const response = await apiRequest("POST", "/api/service-case-notes", {
        serviceId: service.id,
        noteText: notes,
        createdBy: currentUser.id
      });

      if (!response.ok) {
        throw new Error("Failed to save case note");
      }

      toast({
        title: "Success",
        description: "Case note saved successfully",
      });
      
      // Reset the text area
      if (textareaRef.current) {
        textareaRef.current.value = '';
      }
      
      // Refresh the case notes list
      await fetchCaseNotes();
      
      if (onSaved) {
        onSaved();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save case note");
    } finally {
      setIsLoading(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {service ? `Case Notes - ${service.serviceCategory} (${service.serviceType})` : 'Service Case Notes'}
          </DialogTitle>
          <DialogDescription>
            View existing case notes and add new notes for this service.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <ErrorDisplay
            message={error}
            className="mb-4"
          />
        )}

        <div className="grid gap-4 py-4">
          {/* Display existing case notes */}
          <div className="space-y-2">
            <h3 className="font-medium">Existing Case Notes</h3>
            {isLoadingNotes ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
              </div>
            ) : caseNotes.length > 0 ? (
              <div className="space-y-4 max-h-[30vh] overflow-y-auto border rounded-md p-4">
                {caseNotes.map((note) => (
                  <div key={note.id} className="border-b pb-3 last:border-0">
                    <p className="whitespace-pre-wrap">{note.noteText}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Added on {formatDate(note.createdAt)}
                      {note.createdByName && ` by ${note.createdByName}`}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm italic">No case notes yet.</p>
            )}
          </div>

          {/* Add new case note */}
          <div className="space-y-2 pt-4 border-t">
            <Label htmlFor="case-notes">Add New Case Note</Label>
            <Textarea
              id="case-notes"
              ref={textareaRef}
              placeholder="Enter case notes here..."
              className="min-h-[120px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Note'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}