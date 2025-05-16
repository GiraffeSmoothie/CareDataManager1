import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { insertPersonInfoSchema } from "@shared/schema";
import { apiRequest } from "../lib/queryClient";
import DashboardLayout from "@/layouts/app-layout";
import { useToast } from "../hooks/use-toast";
import { Loader2, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { PhoneInput } from "../components/ui/phone-input";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../components/ui/form";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { 
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle 
} from "../components/ui/card";
import { Calendar } from "../components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import { Checkbox } from "../components/ui/checkbox";
import { cn } from "../lib/utils";

// Extend the schema with validation
const personInfoSchema = insertPersonInfoSchema.extend({
  dateOfBirth: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .refine((date) => {
      const parsedDate = new Date(date);
      return !isNaN(parsedDate.getTime()) && parsedDate <= new Date();
    }, "Please enter a valid date that is not in the future"),
  email: z.string()
    .email({ message: "Please enter a valid email address" }),
  homePhone: z.string().optional(),
  homePhoneCountryCode: z.string().default("61"),
  mobilePhone: z.string()
    .min(8, { message: "Phone number must be at least 8 digits" }),
  mobilePhoneCountryCode: z.string().default("61"),
  hcpStartDate: z.string().min(1, "HCP Start Date is required")
});

type PersonInfoFormValues = z.infer<typeof personInfoSchema>;

export default function PersonInfo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [useHomeAddress, setUseHomeAddress] = useState(true);
  
  const form = useForm<PersonInfoFormValues>({
    resolver: zodResolver(personInfoSchema),
    defaultValues: {
      title: "",
      firstName: "",
      middleName: "",
      lastName: "",
      dateOfBirth: "",
      email: "",
      homePhone: "",
      homePhoneCountryCode: "61",
      mobilePhone: "",
      mobilePhoneCountryCode: "61",
      addressLine1: "",
      addressLine2: "",
      addressLine3: "",
      postCode: "",
      mailingAddressLine1: "",
      mailingAddressLine2: "",
      mailingAddressLine3: "",
      mailingPostCode: "",
      useHomeAddress: true,
    },
  });

  // When useHomeAddress changes, update mailing address fields
  useEffect(() => {
    if (useHomeAddress) {
      const homeAddress = {
        mailingAddressLine1: form.getValues("addressLine1"),
        mailingAddressLine2: form.getValues("addressLine2"),
        mailingAddressLine3: form.getValues("addressLine3"),
        mailingPostCode: form.getValues("postCode"),
        useHomeAddress: true
      };
      
      Object.entries(homeAddress).forEach(([key, value]) => {
        form.setValue(key as any, value);
      });
    }
  }, [useHomeAddress, form]);

  // Watch for changes on home address fields and update mailing address if useHomeAddress is true
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (useHomeAddress && 
         (name === "addressLine1" || name === "addressLine2" || 
          name === "addressLine3" || name === "postCode")) {
        
        const mailingField = name.replace("address", "mailingAddress").replace("postCode", "mailingPostCode");
        form.setValue(mailingField as any, value[name as keyof typeof value] || "");
      }
    });
    
    return () => subscription.unsubscribe();
  }, [form, useHomeAddress]);

  const mutation = useMutation({
    mutationFn: async (data: PersonInfoFormValues) => {
      const response = await apiRequest("POST", "/api/person-info", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/person-info"] });
      toast({
        title: "Success",
        description: "New client added successfully",
      });
      form.reset();
      setUseHomeAddress(true);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add new client",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PersonInfoFormValues) => {
    mutation.mutate(data);
  };

  return (
    <DashboardLayout>
      <div className="container py-10">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Add New Client</CardTitle>
            <CardDescription>
              Enter the personal details of the new client.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Personal Details Section */}
                <div>
                  <h3 className="text-lg font-medium mb-4">Personal Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input placeholder="Mr/Mrs/Ms/Dr" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input placeholder="First name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Last name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="mt-4">
                    <FormField
                      control={form.control}
                      name="middleName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Middle Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Middle name (optional)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="mt-4">
                    <FormField
                      control={form.control}
                      name="dateOfBirth"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Date of Birth</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? (
                                    format(new Date(field.value), "PPP")
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value ? new Date(field.value) : undefined}
                                onSelect={(date) => {
                                  if (date) {
                                    field.onChange(date.toISOString().split('T')[0]);
                                  }
                                }}
                                disabled={(date) => date > new Date()}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="mt-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="Email address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Contact Information Section */}
                <div className="pt-4 border-t">
                  <h3 className="text-lg font-medium mb-4">Contact Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="homePhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Home Phone</FormLabel>
                          <FormControl>
                            <PhoneInput
                              placeholder="Home phone (optional)"
                              value={field.value}
                              defaultCountry={form.getValues("homePhoneCountryCode")}
                              onCountryChange={(country) => {
                                form.setValue("homePhoneCountryCode", country);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="mobilePhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mobile Phone</FormLabel>
                          <FormControl>
                            <PhoneInput
                              placeholder="Mobile phone"
                              value={field.value}
                              defaultCountry={form.getValues("mobilePhoneCountryCode")}
                              onCountryChange={(country) => {
                                form.setValue("mobilePhoneCountryCode", country);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Home Address Section */}
                <div className="pt-4 border-t">
                  <h3 className="text-lg font-medium mb-4">Home Address</h3>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="addressLine1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 1</FormLabel>
                          <FormControl>
                            <Input placeholder="Street address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="addressLine2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 2</FormLabel>
                          <FormControl>
                            <Input placeholder="Apartment, suite, unit, etc. (optional)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="addressLine3"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 3</FormLabel>
                          <FormControl>
                            <Input placeholder="City, town, etc. (optional)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="postCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Post Code</FormLabel>
                          <FormControl>
                            <Input placeholder="Post code" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Mailing Address Section */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium">Mailing Address</h3>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="useHomeAddress" 
                        checked={useHomeAddress}
                        onCheckedChange={(checked) => {
                          setUseHomeAddress(!!checked);
                          form.setValue("useHomeAddress", !!checked);
                        }}
                      />
                      <label
                        htmlFor="useHomeAddress"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Same as home address
                      </label>
                    </div>
                  </div>

                  <div className={cn("space-y-4", useHomeAddress && "opacity-50")}>
                    <FormField
                      control={form.control}
                      name="mailingAddressLine1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 1</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Street address" 
                              {...field} 
                              disabled={useHomeAddress}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="mailingAddressLine2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 2</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Apartment, suite, unit, etc. (optional)" 
                              {...field}
                              disabled={useHomeAddress}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="mailingAddressLine3"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 3</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="City, town, etc. (optional)" 
                              {...field}
                              disabled={useHomeAddress}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="mailingPostCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Post Code</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Post code" 
                              {...field}
                              disabled={useHomeAddress}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? (
                    <div className="flex items-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Processing...</span>
                    </div>
                  ) : "Add Client"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}