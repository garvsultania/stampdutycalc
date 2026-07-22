/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@stampdraft/engine", "@stampdraft/schema", "@stampdraft/store"],
  experimental: {
    // Native/WASM DB drivers must not be bundled.
    serverComponentsExternalPackages: ["@electric-sql/pglite", "pg"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
