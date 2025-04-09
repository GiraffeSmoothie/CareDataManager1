import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DashboardLayout from "@/layouts/dashboard-layout";
import { careCategories, getCareTypesByCategory } from "@/lib/data";

const masterDataSchema = z.object({
  careCategory: z.string({ required_error: "Please select a care category" }),
  careType: z.string({ required_error: "Please select a care type" }),
  serviceProvider: z.string().optional(),
  description: z.string().optional(),
  active: z.boolean().default(true),
});

type MasterDataFormValues = z.infer<typeof masterDataSchema>;

export default function MasterData() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Initialize form with default values
  const form = useForm<MasterDataFormValues>({
    resolver: zodResolver(masterDataSchema),
    defaultValues: {
      careCategory: "",
      careType: "",
      serviceProvider: "",
      description: "",
      active: true,
    },
  });

  // Get care types based on selected category
  const careTypes = selectedCategory ? getCareTypesByCategory(selectedCategory) : [];

  // Handle category change
  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    form.setValue("careType", "");
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: MasterDataFormValues) => {
      const response = await apiRequest("POST", "/api/master-data", data);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Data saved successfully",
        variant: "default",
      });
      // Reset form
      form.reset({
        careCategory: "",
        careType: "",
        serviceProvider: "",
        description: "",
        active: true,
      });
      setSelectedCategory(null);
      // Invalidate queries if needed
      queryClient.invalidateQueries({ queryKey: ["/api/master-data"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to save data: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: MasterDataFormValues) => {
    saveMutation.mutate(data);
  };

  const handleReset = () => {
    form.reset({
      careCategory: "",
      careType: "",
      serviceProvider: "",
      description: "",
      active: true,
    });
    setSelectedCategory(null);
  };

  return (
    <DashboardLayout>
      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">HCP Data Entry</h1>
        <p className="text-sm text-muted-foreground">Manage home care package categories, types, and providers in the system</p>
      </div>
      
      <Card className="bg-white shadow-sm border w-full">
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-6 max-w-md">
                {/* Care Category */}
                <div>
                  <h3 className="text-lg font-medium border-b pb-2 mb-3">Care Category</h3>
                  <FormField
                    control={form.control}
                    name="careCategory"
                    render={({ field }) => (
                      <FormItem>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            handleCategoryChange(value);
                          }}
                          value={field.value}
                          disabled={saveMutation.isPending}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {careCategories.map((category) => (
                              <SelectItem key={category.value} value={category.value}>
                                {category.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Care Type */}
                <div>
                  <h3 className="text-lg font-medium border-b pb-2 mb-3">Care Type</h3>
                  <FormField
                    control={form.control}
                    name="careType"
                    render={({ field }) => (
                      <FormItem>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!selectedCategory || saveMutation.isPending}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={selectedCategory ? "Select a care type" : "Select a category first"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {careTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Care Provider */}
                <div>
                  <h3 className="text-lg font-medium border-b pb-2 mb-3">Care Provider</h3>
                  <FormField
                    control={form.control}
                    name="serviceProvider"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <input
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Enter care provider name"
                            {...field}
                            disabled={saveMutation.isPending}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Description and Active status below the grid */}
              <div className="pt-4 border-t mt-6">
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Enter a description" 
                          className="min-h-[80px]" 
                          {...field}
                          disabled={saveMutation.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="mt-4">
                  <FormField
                    control={form.control}
                    name="active"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={saveMutation.isPending}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Active</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button type="button" variant="outline" onClick={handleReset} disabled={saveMutation.isPending}>
                  Reset
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
