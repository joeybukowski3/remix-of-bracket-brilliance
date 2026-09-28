import { useContext, useEffect } from "react";
import { SeoCollectorContext } from "@/lib/seo/seoCollector";

type Props = {
  id: string;
  data: Record<string, unknown> | Record<string, unknown>[];
};

export default function SeoJsonLd({ id, data }: Props) {
  // Build-time prerender only (see seoCollector.ts); a no-op in the browser.
  useContext(SeoCollectorContext)?.recordJsonLd({ id, data });

  useEffect(() => {
    const selector = `script[data-seo-jsonld="${id}"]`;
    let element = document.head.querySelector(selector) as HTMLScriptElement | null;

    if (!element) {
      element = document.createElement("script");
      element.type = "application/ld+json";
      element.setAttribute("data-seo-jsonld", id);
      document.head.appendChild(element);
    }

    element.textContent = JSON.stringify(data);

    return () => {
      if (element?.parentNode) {
        element.parentNode.removeChild(element);
      }
    };
  }, [data, id]);

  return null;
}
