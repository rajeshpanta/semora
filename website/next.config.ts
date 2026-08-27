import type { NextConfig } from "next";
import path from "path";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    // The app has two root layouts — (en) and (es) — so a fully-unmatched URL
    // has no layout to compose a 404 from and rendered Next's bare default
    // shell. global-not-found is the documented convention for exactly this
    // multiple-root-layout case.
    globalNotFound: true,
  },
  async redirects() {
    return [
      // The English weighted-GPA explainer targeted "how to calculate weighted
      // gpa", a head term owned by Calculator.net and CollegeBoard. Search
      // Console measured it at position 72.9 with 121 impressions and zero
      // clicks, while /gpa-calculator — the interactive tool that actually
      // answers the query — was not indexed at all. This consolidates the two
      // onto the page that does the job. Redirects run before filesystem
      // routes, so the old MDX route is unreachable and has been removed.
      {
        source: '/blog/weighted-gpa-calculator',
        destination: '/gpa-calculator',
        permanent: true,
      },
      // The Spanish translation ranked better (position 13 vs 73) but earned
      // the same zero clicks, and a Spanish page only reaches the sitemap
      // through its English pair — so keeping it alive after the English post
      // went away would have quietly dropped it out of the sitemap anyway.
      // It consolidates onto the Spanish tool page for the same reason.
      {
        source: '/es/blog/calcular-gpa-ponderado',
        destination: '/es/calculadora-gpa',
        permanent: true,
      },
    ];
  },
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
