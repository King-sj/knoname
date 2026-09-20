import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
	appId: "com.libnoname.noname",
	appName: "noname",
	webDir: "../../dist",
	plugins: {
		App: {},
		SystemBars: {
			hidden: true,
		},
	},
};

export default config;
