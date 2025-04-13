import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import DashboardLayout from "@/layouts/dashboard-layout";
import { serviceCategories, getServiceTypesByCategory } from "@/lib/data";
import { MasterData as MasterDataType } from "@shared/schema";

const masterDataSchema = z.object({
  careCategory: z.string({ required_error: "Please select a care category" }),
  careType: z.string({ required_error: "Please select a care type" }),
  serviceProvider: z.string().optional(),
  active: z.boolean().default(true),
});

type MasterDataFormValues = z.infer<typeof masterDataSchema>;

export default function MasterData() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("add");
  
  // Fetch all master data for the View tab
  const { data: masterDataList = [], isLoading } = useQuery<MasterDataType[]>({
    queryKey: ["/api/master-data"],
    enabled: activeTab === "view", // Only fetch when View tab is active
  });
  
  // Initialize form with default values
  const form = useForm<MasterDataFormValues>({
    resolver: zodResolver(masterDataSchema),
    defaultValues: {
      careCategory: "",
      careType: "",
      serviceProvider: "",
      active: true,
    },
  });

  // Get care types based on selected category
  const serviceTypes = selectedCategory ? getServiceTypesByCategory(selectedCategory) : [];

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
      active: true,
    });
    setSelectedCategory(null);
  };

  // Function to handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  // Render form for the Add tab
  const renderAddForm = () => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4 w-full">
          {/* Care Category */}
          <div className="flex items-center gap-4">
            <div className="w-1/4">
              <h3 className="text-base font-medium">Care Category:</h3>
            </div>
            <div className="flex-1">
              <FormField
                control={form.control}
                name="careCategory"
                render={({ field }) => (
                  <FormItem className="w-full">
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
                        {serviceCategories.map((category) => (
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
          </div>

          {/* Care Type */}
          <div className="flex items-center gap-4">
            <div className="w-1/4">
              <h3 className="text-base font-medium">Care Type:</h3>
            </div>
            <div className="flex-1">
              <FormField
                control={form.control}
                name="careType"
                render={({ field }) => (
                  <FormItem className="w-full">
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
                        {serviceTypes.map((type) => (
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
          </div>

          {/* Care Provider */}
          <div className="flex items-center gap-4">
            <div className="w-1/4">
              <h3 className="text-base font-medium">Care Provider:</h3>
            </div>
            <div className="flex-1">
              <FormField
                control={form.control}
                name="serviceProvider"
                render={({ field }) => (
                  <FormItem className="w-full">
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
        </div>

        {/* Active Status */}
        <div className="pt-4 border-t mt-6">
          <div className="flex items-center gap-4 mt-4">
            <div className="w-1/4">
              <h3 className="text-base font-medium">Status:</h3>
            </div>
            <div className="flex-1">
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={saveMutation.isPending}
                      />
                    </FormControl>
                    <div className="space-y-0 leading-none">
                      <span>Active</span>
                    </div>
                  </FormItem>
                )}
              />
            </div>
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
  );

  // Render table for the View tab
  const renderViewTable = () => (
    <div className="space-y-4">
      {isLoading ? (
        <div className="text-center py-4">Loading data...</div>
      ) : masterDataList.length === 0 ? (
        <div className="text-center py-4">No HCP data found. Add some data using the Add tab.</div>
      ) : (
        <div className="border rounded-md">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Care Category</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Care Type</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Care Provider</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {masterDataList.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.careCategory}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.careType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.serviceProvider || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">HCP Data Entry</h1>
        <p className="text-sm text-muted-foreground">Manage home care package categories, types, and providers in the system</p>
      </div>
      
      <Tabs defaultValue="add" value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="add">Add</TabsTrigger>
          <TabsTrigger value="view">View</TabsTrigger>
        </TabsList>
        
        <Card className="bg-white shadow-sm border w-full">
          <CardContent className="p-6">
            <TabsContent value="add">
              {renderAddForm()}
            </TabsContent>
            
            <TabsContent value="view">
              {renderViewTable()}
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </DashboardLayout>
  );
}
