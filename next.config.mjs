/** @type {import('next').NextConfig} */
const nextConfig = {
  // No `typescript.ignoreBuildErrors` here: `npm run typecheck` is clean, so
  // the flag was hiding nothing and the only thing it could still do was let
  // the next type error through to production.
  images: {
    unoptimized: true,
  },
}

export default nextConfig
