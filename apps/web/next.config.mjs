/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@stampdraft/engine", "@stampdraft/schema", "@stampdraft/store"],
  experimental: {
    // Native/WASM DB drivers must not be bundled.
    serverComponentsExternalPackages: ["@electric-sql/pglite", "pg"],
  },
};

export default nextConfig;
