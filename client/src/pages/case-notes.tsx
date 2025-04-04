import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { insertCaseNoteSchema, type PersonInfo, type CaseNote } from "@shared/schema";
import { format } from "date-fns";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Clock } from "lucide-react";
import DashboardLayout from "@/layouts/dashboard-layout";

// Extend the schema to provide validation
const caseNoteFormSchema = insertCaseNoteSchema.extend({
  memberId: z.number({
    required_error: "Please select a member",
  }),
  note: z.string().min(5, {
    message: "Note must be at least 5 characters",
  }),
});

type CaseNoteFormValues = z.infer<typeof caseNoteFormSchema>;

export default function CaseNotes() {
  const { toast } = useToast();
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);

  // Fetch all members
  const { data: members = [], isLoading: isLoadingMembers } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info"],
    queryFn: async () => {
      const res = await fetch("/api/person-info");
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
  });

  // Fetch case notes for the selected member
  const {
    data: caseNotes = [],
    isLoading: isLoadingNotes,
    refetch: refetchCaseNotes,
  } = useQuery<CaseNote[]>({
    queryKey: ["/api/case-notes/member", selectedMemberId],
    queryFn: async () => {
      if (!selectedMemberId) return [];
      const res = await fetch(`/api/case-notes/member/${selectedMemberId}`);
      if (!res.ok) throw new Error("Failed to fetch case notes");
      return res.json();
    },
    enabled: !!selectedMemberId,
  });

  // Form for adding a new case note
  const form = useForm<CaseNoteFormValues>({
    resolver: zodResolver(caseNoteFormSchema),
    defaultValues: {
      memberId: undefined,
      note: "",
    },
  });

  // When a member is selected, update the form and fetch their case notes
  useEffect(() => {
    if (selectedMemberId) {
      form.setValue("memberId", selectedMemberId);
    }
  }, [selectedMemberId, form]);

  // Add a new case note
  const addNoteMutation = useMutation({
    mutationFn: async (data: CaseNoteFormValues) => {
      const res = await apiRequest("POST", "/api/case-notes", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Case note added",
        description: "The case note has been added successfully.",
      });
      // Reset form and refresh case notes
      form.setValue("note", "");
      queryClient.invalidateQueries({ queryKey: ["/api/case-notes/member", selectedMemberId] });
      refetchCaseNotes();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add case note",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CaseNoteFormValues) => {
    addNoteMutation.mutate(data);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6">
        <h1 className="text-3xl font-bold mb-6">Member Case Notes</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Member Selection */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Select Member</CardTitle>
              <CardDescription>Choose a member to view or add case notes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Member</label>
                  <Select
                    value={selectedMemberId?.toString() || ""}
                    onValueChange={(value) => setSelectedMemberId(parseInt(value))}
                    disabled={isLoadingMembers}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a member" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((member: PersonInfo) => (
                        <SelectItem key={member.id} value={member.id.toString()}>
                          {member.firstName} {member.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Add New Case Note */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Add Case Note</CardTitle>
              <CardDescription>Add a new case note for the selected member</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="note"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Note</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter case note details here..."
                            className="min-h-[120px]"
                            disabled={!selectedMemberId || addNoteMutation.isPending}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={!selectedMemberId || addNoteMutation.isPending}
                    className="w-full"
                  >
                    {addNoteMutation.isPending ? "Adding..." : "Add Case Note"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Case Notes List */}
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle>Case Notes History</CardTitle>
              <CardDescription>View all case notes for the selected member</CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedMemberId ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No member selected</AlertTitle>
                  <AlertDescription>
                    Please select a member to view their case notes.
                  </AlertDescription>
                </Alert>
              ) : isLoadingNotes ? (
                <div className="text-center py-6">Loading case notes...</div>
              ) : caseNotes.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No case notes</AlertTitle>
                  <AlertDescription>
                    This member doesn't have any case notes yet.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {caseNotes.map((note: CaseNote) => (
                    <Card key={note.id} className="border border-border">
                      <CardHeader className="py-3">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-sm font-medium">
                            Case Note #{note.id}
                          </CardTitle>
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 mr-1" />
                            {note.createdAt ? format(new Date(note.createdAt), "PPp") : "N/A"}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="py-3">
                        <p className="whitespace-pre-wrap">{note.note}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <div className="text-sm text-muted-foreground">
                Total: {caseNotes.length} case notes
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}