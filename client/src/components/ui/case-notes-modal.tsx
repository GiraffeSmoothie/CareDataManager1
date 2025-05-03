import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "./form";
import { Button } from "./button";
import { Textarea } from "./textarea";
import MemberService from "@/pages/member-assignment";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

const caseNoteSchema = z.object({
  noteText: z.string().min(1, "Case note is required"),
});

type CaseNoteFormValues = z.infer<typeof caseNoteSchema>;

interface CaseNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: MemberService | null;
  onSave: () => void;
}

export function CaseNotesDialog({ open, onOpenChange, service, onSave }: CaseNotesDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [existingNote, setExistingNote] = useState<string>("");

  const form = useForm<CaseNoteFormValues>({
    resolver: zodResolver(caseNoteSchema),
    defaultValues: {
      noteText: "",
    },
  });

  // Fetch existing case note when dialog opens
  useEffect(() => {
    if (open && service) {
      setIsLoading(true);
      apiRequest("GET", `/api/service-case-notes/${service.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.noteText) {
            setExistingNote(data.noteText);
            form.reset({ noteText: data.noteText });
          } else {
            setExistingNote("");
            form.reset({ noteText: "" });
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
  }, [open, service, form, toast]);

  const onSubmit = async (data: CaseNoteFormValues) => {
    if (!service) return;

    try {
      setIsLoading(true);
      const endpoint = existingNote 
        ? `/api/service-case-notes/${service.id}` 
        : "/api/service-case-notes";
      const method = existingNote ? "PUT" : "POST";
      
      const response = await apiRequest(method, endpoint, {
        serviceId: service.id,
        noteText: data.noteText,
      });

      if (!response.ok) {
        throw new Error("Failed to save case note");
      }

      toast({
        title: "Success",
        description: "Case note saved successfully",
      });
      onSave();
      onOpenChange(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {service ? `Case Notes - ${service.serviceCategory} (${service.serviceType})` : 'Service Case Notes'}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="noteText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {service ? `Notes for ${service.serviceCategory} - ${service.serviceType} service provided on ${service.serviceDays.join(", ")} (${service.serviceHours} hrs)` : 'Case Note'}
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter case notes here..."
                      className="min-h-[200px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Case Note
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}