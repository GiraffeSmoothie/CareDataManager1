import { Error } from "@/components/ui/error";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Error
        variant="card"
        fullPage
        title="404 Page Not Found"
        message="Did you forget to add the page to the router?"
      />
    </div>
  );
}
