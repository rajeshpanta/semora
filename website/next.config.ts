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
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
