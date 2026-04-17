import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { usePageSeo } from "@/hooks/usePageSeo";

const NotFound = () => {
  const location = useLocation();

  usePageSeo({
    title: "Page Not Found",
    description: "The requested page could not be found on Joe Knows Ball.",
    path: location.pathname,
    noindex: true,
  });

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <Link to="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
