import type { NextConfig } from "next";
import path from "path";

// MDX support was only ever used by the blog, which this site no longer has.
// The @mdx-js/* and @next/mdx packages stay in package.json (harmless, and it
// makes re-adding a blog later a one-line config change).
const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx"],
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
