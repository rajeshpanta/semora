import type { NextConfig } from "next";
import path from "path";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],
  turbopack: {
    root: path.join(__dirname),
  },
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
