import { useEffect } from "react";

type Props = {
  id: string;
  data: Record<string, unknown> | Record<string, unknown>[];
};

export default function SeoJsonLd({ id, data }: Props) {
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
