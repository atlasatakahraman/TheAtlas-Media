import type { NextConfig } from "next";

const is_prod = process.env.NODE_ENV === 'production';
const internal_host = process.env.TAURI_DEV_HOST || 'localhost';

const nextConfig: NextConfig = {
	/* config options here */

	output: "export",

	trailingSlash: true,

	experimental: {
		viewTransition: true,
	},

	images: {
		unoptimized: true,
	},

	assetPrefix: is_prod ? undefined : `http://${internal_host}:3000`,
};

export default nextConfig;
