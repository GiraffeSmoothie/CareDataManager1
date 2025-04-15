import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Search, Plus } from "lucide-react";
import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  serviceCategory: z.string({ required_error: "Please select a service category" }),
  serviceType: z.string({ required_error: "Please select a service type" }),
  serviceProvider: z.string().optional(),  
  active: z.boolean().default(true),
});

type MasterDataFormValues = z.infer<typeof masterDataSchema>;

export default function MasterData() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingData, setEditingData] = useState<MasterDataType | null>(null);
  const [activeTab, setActiveTab] = useState("view");

  // Fetch all master data for the View tab
  const { data: masterDataList = [], isLoading } = useQuery<MasterDataType[]>({
    queryKey: ["/api/master-data"],
    enabled: activeTab === "view", // Only fetch when View tab is active
  });

  // Initialize form with default values
  const form = useForm<MasterDataFormValues>({
    resolver: zodResolver(masterDataSchema),
    defaultValues: {
      serviceCategory: "",
      serviceType: "",
      serviceProvider: "",      
      active: true,
    },
  });

  // Get care types based on selected category
  const serviceTypes = selectedCategory ? getServiceTypesByCategory(selectedCategory) : [];

  // Handle category change
  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    form.setValue("serviceType", "");
  };

  // Save mutation
  // Local storage handling
  useEffect(() => {
    try {
      if (masterDataList && masterDataList.length > 0) {
        const uniqueCategories = Array.from(new Set(masterDataList.map(item => item.serviceCategory))).filter(Boolean);
        const uniqueTypes = Array.from(new Set(masterDataList.map(item => item.serviceType))).filter(Boolean);
        const uniqueProviders = Array.from(new Set(masterDataList.map(item => item.serviceProvider))).filter(Boolean);
        
        localStorage.setItem('serviceCategories', JSON.stringify(uniqueCategories));
        localStorage.setItem('serviceTypes', JSON.stringify(uniqueTypes));
        localStorage.setItem('serviceProviders', JSON.stringify(uniqueProviders));
        localStorage.setItem('masterData', JSON.stringify(masterDataList));
      }
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [masterDataList]);

  const saveMutation = useMutation({
    mutationFn: async (data: MasterDataFormValues) => {
      const response = await apiRequest("POST", "/api/master-data", data);
      // Save to local storage
      const savedMasterData = JSON.parse(localStorage.getItem('masterData') || '[]');
      savedMasterData.push(data);
      localStorage.setItem('masterData', JSON.stringify(savedMasterData));
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
        serviceCategory: "",
        serviceType: "",
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
      serviceCategory: "",
      serviceType: "",
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
              <h3 className="text-base font-medium">Service Category:</h3>
            </div>
            <div className="flex-1">
              <FormField
                control={form.control}
                name="serviceCategory"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormControl>
                      <div className="flex gap-2">
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            setSelectedCategory(value);
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Array.from(new Set([
                              ...masterDataList.map(item => item.serviceCategory),
                              ...JSON.parse(localStorage.getItem('serviceCategories') || '[]')
                            ]))
                              .filter(Boolean)
                              .map((category) => (
                                <SelectItem key={category} value={category}>
                                  {category}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormControl>
                          <Input
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(value);
                              setSelectedCategory(value);
                            }}
                            placeholder="Or enter custom category"
                            className="flex-1"
                          />
                        </FormControl>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Care Type */}
          <div className="flex items-center gap-4">
            <div className="w-1/4">
              <h3 className="text-base font-medium">Service Type:</h3>
            </div>
            <div className="flex-1">
              <FormField
                control={form.control}
                name="serviceType"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormControl>
                      <div className="flex gap-2">
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Array.from(new Set([
                              ...masterDataList.map(item => item.serviceType),
                              ...JSON.parse(localStorage.getItem('serviceTypes') || '[]')
                            ]))
                              .filter(Boolean)
                              .map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormControl>
                          <Input
                            onChange={(e) => field.onChange(e.target.value)}
                            placeholder="Or enter custom type"
                            className="flex-1"
                          />
                        </FormControl>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Service Provider */}
          <div className="flex items-center gap-4">
            <div className="w-1/4">
              <h3 className="text-base font-medium">Service Provider:</h3>
            </div>
            <div className="flex-1">
              <FormField
                control={form.control}
                name="serviceProvider"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormControl>
                      <div className="flex gap-2">
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Select provider" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Array.from(new Set([
                              ...masterDataList.map(item => item.serviceProvider),
                              ...JSON.parse(localStorage.getItem('serviceProviders') || '[]')
                            ]))
                              .filter(Boolean)
                              .map((provider) => (
                                <SelectItem key={provider} value={provider}>
                                  {provider}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormControl>
                          <Input
                            onChange={(e) => field.onChange(e.target.value)}
                            placeholder="Or enter custom provider"
                            className="flex-1"
                          />
                        </FormControl>
                      </div>
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
            {saveMutation.isPending ? "Adding..." : "Add"}
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
        <div className="text-center py-4">No Services master data found. Add some data using the Add tab.</div>
      ) : (
        <div className="border rounded-md">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service Category</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service Type</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service Provider</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {[
                ...masterDataList,
                ...JSON.parse(localStorage.getItem('masterData') || '[]')
              ].map((item, index) => (
                <tr key={item.id || `local-${index}`}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.serviceCategory}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.serviceType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.serviceProvider || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setActiveTab("add");
                        form.reset({
                          serviceCategory: item.serviceCategory,
                          serviceType: item.serviceType,
                          serviceProvider: item.serviceProvider || "",
                          active: item.active
                        });
                      }}
                    >
                      Edit
                    </Button>
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
      <div className="container py-6">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Services Master Data</CardTitle>
              <div className="flex gap-2">
                <div className="relative flex items-center">
                  <Search className="absolute left-3 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search services..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button onClick={() => {
                  setEditingData(null);
                  setShowDialog(true);
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service Category</TableHead>
                  <TableHead>Service Type</TableHead>
                  <TableHead>Service Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {masterDataList
                  .filter(item => 
                    searchTerm === "" || 
                    item.serviceCategory.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    item.serviceType.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    item.serviceProvider?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.serviceCategory}</TableCell>
                      <TableCell>{item.serviceType}</TableCell>
                      <TableCell>{item.serviceProvider || '-'}</TableCell>
                      <TableCell>
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {item.active ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingData(item);
                            setShowDialog(true);
                          }}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingData ? 'Edit Service' : 'Add New Service'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="serviceCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Category</FormLabel>
                        <Input {...field} placeholder="Enter service category" />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="serviceType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Type</FormLabel>
                        <Input {...field} placeholder="Enter service type" />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="serviceProvider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Provider</FormLabel>
                        <Input {...field} placeholder="Enter service provider" />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="active"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Active</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" className="w-full">
                  {editingData ? 'Update' : 'Add'} Service
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        <TabsList className="mb-4">
          <TabsTrigger value="view">View</TabsTrigger>
          <TabsTrigger value="add">Add</TabsTrigger>
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
      </div>
    </DashboardLayout>
  );
}