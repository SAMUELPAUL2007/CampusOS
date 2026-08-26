import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The root path has no landing page; send visitors to login.
      { source: "/", destination: "/login", permanent: false },
    ]
  },
}

export default nextConfig
