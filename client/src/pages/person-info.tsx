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
    .regex(/^\d{2}-\d{2}-\d{4}$/, "Date must be in DD-MM-YYYY format")
    .refine((date) => {
      // Parse DD-MM-YYYY format
      const [day, month, year] = date.split('-').map(Number);
      const parsedDate = new Date(year, month - 1, day);
      return !isNaN(parsedDate.getTime()) && parsedDate <= new Date();
    }, "Please enter a valid date that is not in the future"),
  email: z.string()
    .email({ message: "Please enter a valid email address" }),
  homePhone: z.string().optional()
    .refine(val => !val || /^\d{10}$/.test(val), {
      message: "Home phone must be 10 digits (no spaces or symbols)"
    }),
  homePhoneCountryCode: z.string().default("61"),
  mobilePhone: z.string()
    .refine(val => /^\d{10}$/.test(val), {
      message: "Mobile phone must be 10 digits (no spaces or symbols)"
    }),
  mobilePhoneCountryCode: z.string().default("61"),
  postCode: z.string().min(1, "Post Code is required")
    .refine(val => /^\d{4}$/.test(val), {
      message: "Post code must be a 4-digit number"
    }),
  nextOfKinPhone: z.string().min(1, "Next of Kin Phone is required")
    .refine(val => /^\d{10}$/.test(val), {
      message: "Next of kin phone must be 10 digits (no spaces or symbols)"
    }),
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
      hcpStartDate: "", // Added default value for hcpStartDate
      hcpLevel: "", // Added default value for hcpLevel
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
  });  const onSubmit = (data: PersonInfoFormValues) => {
    // Format phone numbers to ensure they match validation (10 digits only)
    const formatPhoneNumber = (phone: string): string => {
      if (!phone) return phone;
      // Remove any non-digit characters and ensure it's just 10 digits
      return phone.replace(/\D/g, '').substring(0, 10);
    };
    
    // Format postcode to ensure it's exactly 4 digits
    const formatPostcode = (postcode: string): string => {
      if (!postcode) return postcode;
      // Remove any non-digit characters and ensure it's just 4 digits
      return postcode.replace(/\D/g, '').substring(0, 4).padStart(4, '0');
    };
    
    // Format date to ISO format for storage
    const formatDateForStorage = (dateStr: string): string => {
      if (!dateStr) return dateStr;
      
      // Parse the DD-MM-YYYY format
      const [day, month, year] = dateStr.split('-').map(Number);
      
      // Create a date object (months are 0-indexed in JavaScript)
      const date = new Date(year, month - 1, day);
      
      // Return ISO format (YYYY-MM-DD)
      return date.toISOString();
    };
    
    // Format data before submission
    const formattedData = {
      ...data,
      // Format phone numbers
      mobilePhone: formatPhoneNumber(data.mobilePhone),
      homePhone: data.homePhone ? formatPhoneNumber(data.homePhone) : data.homePhone,
      nextOfKinPhone: data.nextOfKinPhone ? formatPhoneNumber(data.nextOfKinPhone) : '',
      
      // Format postcodes
      postCode: formatPostcode(data.postCode),
      mailingPostCode: data.mailingPostCode ? formatPostcode(data.mailingPostCode) : data.mailingPostCode,
      
      // Format dates for proper storage
      dateOfBirth: formatDateForStorage(data.dateOfBirth),
      hcpStartDate: formatDateForStorage(data.hcpStartDate)
    };
    
    mutation.mutate(formattedData);
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
                                >                                  {field.value ? (
                                    field.value
                                  ) : (
                                    <span>DD-MM-YYYY</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <div className="flex flex-col space-y-2 p-2">
                                <div className="flex justify-between items-center">
                                  <select 
                                    className="border rounded px-2 py-1 text-sm"
                                    value={field.value ? field.value.split('-')[2] : new Date().getFullYear()}
                                    onChange={(e) => {
                                      const selectedYear = e.target.value;
                                      if (field.value) {
                                        const [day, month, _] = field.value.split('-');
                                        field.onChange(`${day}-${month}-${selectedYear}`);
                                      } else {
                                        const today = new Date();
                                        const day = today.getDate().toString().padStart(2, '0');
                                        const month = (today.getMonth() + 1).toString().padStart(2, '0');
                                        field.onChange(`${day}-${month}-${selectedYear}`);
                                      }
                                    }}
                                  >
                                    {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map(year => (
                                      <option key={year} value={year}>{year}</option>
                                    ))}
                                  </select>
                                  <select 
                                    className="border rounded px-2 py-1 text-sm"
                                    value={field.value ? field.value.split('-')[1] : (new Date().getMonth() + 1).toString().padStart(2, '0')}
                                    onChange={(e) => {
                                      const selectedMonth = e.target.value;
                                      if (field.value) {
                                        const [day, _, year] = field.value.split('-');
                                        
                                        // Create a date object to validate the day in the new month
                                        const lastDayOfMonth = new Date(parseInt(year), parseInt(selectedMonth), 0).getDate();
                                        const validDay = Math.min(parseInt(day), lastDayOfMonth).toString().padStart(2, '0');
                                        
                                        field.onChange(`${validDay}-${selectedMonth}-${year}`);
                                      } else {
                                        const today = new Date();
                                        const day = today.getDate().toString().padStart(2, '0');
                                        field.onChange(`${day}-${selectedMonth}-${new Date().getFullYear()}`);
                                      }
                                    }}
                                  >
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                                      <option key={month} value={month.toString().padStart(2, '0')}>
                                        {new Date(2000, month - 1, 1).toLocaleString('default', { month: 'long' })}
                                      </option>
                                    ))}
                                  </select>
                                </div>                                  <Calendar
                                  mode="single"
                                  selected={field.value ? (() => {
                                    const [day, month, year] = field.value.split('-').map(Number);
                                    const date = new Date(year, month - 1, day);
                                    return date;
                                  })() : undefined}
                                  month={field.value ? (() => {
                                    const [_, month, year] = field.value.split('-').map(Number);
                                    return new Date(year, month - 1, 1);
                                  })() : undefined}
                                  onSelect={(date) => {
                                    if (date) {
                                      // Format as DD-MM-YYYY
                                      const day = date.getDate().toString().padStart(2, '0');
                                      const month = (date.getMonth() + 1).toString().padStart(2, '0');
                                      const year = date.getFullYear();
                                      field.onChange(`${day}-${month}-${year}`);
                                    }
                                  }} 
                                  disabled={(date) => date > new Date()}
                                  initialFocus
                                />
                              </div>
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground mt-1">
                            Format: DD-MM-YYYY (e.g., 01-01-2023)
                          </p>                        </FormItem>
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
                            <Input
                              placeholder="Home phone (10 digits)"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground mt-1">
                            If provided, must be 10 digits without spaces or symbols
                          </p>
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
                            <Input
                              placeholder="Mobile phone (10 digits)"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground mt-1">
                            Must be 10 digits without spaces or symbols
                          </p>
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
                    />                    <FormField
                      control={form.control}
                      name="postCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Post Code</FormLabel>
                          <FormControl>
                            <Input placeholder="4-digit postcode" {...field} />
                          </FormControl>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground mt-1">
                            Must be a 4-digit number
                          </p>
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
                    />                    <FormField
                      control={form.control}
                      name="mailingPostCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mailing Post Code</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="4-digit postcode"
                              disabled={useHomeAddress}
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground mt-1">
                            Must be a 4-digit number
                          </p>                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* HCP Information Section */}
                <div className="pt-4 border-t">
                  <h3 className="text-lg font-medium mb-4">HCP Information</h3>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="hcpLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>HCP Level</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter HCP level" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="hcpStartDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">                          <FormLabel>HCP Start Date</FormLabel>
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
                                    field.value
                                  ) : (
                                    <span>DD-MM-YYYY</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <div className="flex flex-col space-y-2 p-2">
                                <div className="flex justify-between items-center">
                                  <select 
                                    className="border rounded px-2 py-1 text-sm"
                                    value={field.value ? field.value.split('-')[2] : new Date().getFullYear()}
                                    onChange={(e) => {
                                      const selectedYear = e.target.value;
                                      if (field.value) {
                                        const [day, month, _] = field.value.split('-');
                                        field.onChange(`${day}-${month}-${selectedYear}`);
                                      } else {
                                        const today = new Date();
                                        const day = today.getDate().toString().padStart(2, '0');
                                        const month = (today.getMonth() + 1).toString().padStart(2, '0');
                                        field.onChange(`${day}-${month}-${selectedYear}`);
                                      }
                                    }}
                                  >
                                    {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map(year => (
                                      <option key={year} value={year}>{year}</option>
                                    ))}
                                  </select>
                                  <select 
                                    className="border rounded px-2 py-1 text-sm"
                                    value={field.value ? field.value.split('-')[1] : (new Date().getMonth() + 1).toString().padStart(2, '0')}
                                    onChange={(e) => {
                                      const selectedMonth = e.target.value;
                                      if (field.value) {
                                        const [day, _, year] = field.value.split('-');
                                        
                                        // Create a date object to validate the day in the new month
                                        const lastDayOfMonth = new Date(parseInt(year), parseInt(selectedMonth), 0).getDate();
                                        const validDay = Math.min(parseInt(day), lastDayOfMonth).toString().padStart(2, '0');
                                        
                                        field.onChange(`${validDay}-${selectedMonth}-${year}`);
                                      } else {
                                        const today = new Date();
                                        const day = today.getDate().toString().padStart(2, '0');
                                        field.onChange(`${day}-${selectedMonth}-${new Date().getFullYear()}`);
                                      }
                                    }}
                                  >
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                                      <option key={month} value={month.toString().padStart(2, '0')}>
                                        {new Date(2000, month - 1, 1).toLocaleString('default', { month: 'long' })}
                                      </option>
                                    ))}
                                  </select>
                                </div>                                <Calendar
                                  mode="single"
                                  selected={field.value ? (() => {
                                    const [day, month, year] = field.value.split('-').map(Number);
                                    const date = new Date(year, month - 1, day);
                                    return date;
                                  })() : undefined}
                                  month={field.value ? (() => {
                                    const [_, month, year] = field.value.split('-').map(Number);
                                    return new Date(year, month - 1, 1);
                                  })() : undefined}
                                  onSelect={(date) => {
                                    if (date) {
                                      // Format as DD-MM-YYYY
                                      const day = date.getDate().toString().padStart(2, '0');
                                      const month = (date.getMonth() + 1).toString().padStart(2, '0');
                                      const year = date.getFullYear();
                                      field.onChange(`${day}-${month}-${year}`);
                                    }
                                  }}
                                  initialFocus
                                />
                              </div>
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground mt-1">
                            Format: DD-MM-YYYY (e.g., 01-01-2023)
                          </p>
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