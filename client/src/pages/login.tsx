import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
// ErrorDisplay will be used when needed
// import { ErrorDisplay } from "@/components/ui/error-display";
import { 
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel
} from "@/components/ui/alert-dialog";
import { TokenStorage } from "@/lib/token-storage";

const loginSchema = z.object({
  username: z.string().min(1, { message: "Username is required" }),
  password: z.string().min(1, { message: "Password is required" }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [_, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });  async function onSubmit(data: LoginFormValues) {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
        // Remove credentials: "include" as we're using JWT tokens
      });

      if (!response.ok) {
        throw new Error("Invalid username or password");
      }

      // Process response and store JWT tokens
      const responseData = await response.json();
      
      if (responseData.success && responseData.tokens) {        // Store JWT tokens
        TokenStorage.storeTokens({
          accessToken: responseData.tokens.accessToken,
          refreshToken: responseData.tokens.refreshToken
        });
        
        // Invalidate queries to trigger refetch - this ensures segments are loaded immediately
        await queryClient.invalidateQueries({ queryKey: ["authStatus"] });
        await queryClient.invalidateQueries({ queryKey: ["segments"] });
        
        // Also refetch auth status to get the latest user data including company_id
        await queryClient.refetchQueries({ queryKey: ["authStatus"] });
        
        toast({
          title: "Success",
          description: "Successfully logged in",
          variant: "default",
        });
        
        // Check if there's a redirect path stored from a session timeout
        const redirectPath = sessionStorage.getItem('redirectAfterLogin');
        if (redirectPath) {
          sessionStorage.removeItem('redirectAfterLogin');
          setLocation(redirectPath);
        } else {
          setLocation("/homepage");
        }
      } else {
        throw new Error("Login failed: Invalid response from server");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to login",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full justify-center items-center p-4 md:p-6 lg:p-8 bg-gray-50">
      <Card className="w-full max-w-md p-6">
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to access your account
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter your username"
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <button 
                        type="button"
                        onClick={() => setForgotPasswordOpen(true)}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <div className="flex items-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span>Signing in...</span>
                  </div>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <AlertDialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Please contact your system administrator to reset your password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
