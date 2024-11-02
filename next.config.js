const { version } = require("./package.json");

/** @type {import('next').NextConfig} */
const nextConfig = {
	env: {
		version,
	},
	reactStrictMode: true,
	poweredByHeader: false,
	experimental: {
		serverComponentsExternalPackages: ["@node-rs/argon2", "jsx-email"],
	},
	images: {
		remotePatterns: [
			{ hostname: "localhost" },
			{ hostname: "images.unsplash.com" },
			{ hostname: "placehold.co" },
			{ hostname: "cdn.myanimelist.net" },
		],
	},
};

module.exports = nextConfig;
