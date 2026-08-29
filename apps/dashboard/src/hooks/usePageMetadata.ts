import { useEffect } from 'react';

interface PageMetadataOptions {
  title?: string;
  description?: string;
  url?: string;
  type?: string;
  image?: string;
}

export function usePageMetadata({
  title,
  description,
  url,
  type = 'website',
  image = '/favicon.svg',
}: PageMetadataOptions) {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const originalTitle = document.title;
    if (title) {
      document.title = title;
    }

    const setMetaTag = (attr: 'name' | 'property', key: string, content: string) => {
      let element = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, key);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    if (title) {
      setMetaTag('property', 'og:title', title);
      setMetaTag('name', 'twitter:title', title);
    }

    if (description) {
      setMetaTag('name', 'description', description);
      setMetaTag('property', 'og:description', description);
      setMetaTag('name', 'twitter:description', description);
    }

    const targetUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
    if (targetUrl) {
      setMetaTag('property', 'og:url', targetUrl);
    }

    setMetaTag('property', 'og:type', type);
    setMetaTag('property', 'og:image', image);
    setMetaTag('name', 'twitter:image', image);

    return () => {
      document.title = originalTitle;
    };
  }, [title, description, url, type, image]);
}
