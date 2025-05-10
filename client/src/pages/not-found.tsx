
import { ErrorDisplay } from "@/components/ui/error-display";


export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">

      <ErrorDisplay
        variant="card"
        title="404 Page Not Found"
        message="Did you forget to add the page to the router?"
        className="max-w-md mx-4"

      />
    </div>
  );
}
