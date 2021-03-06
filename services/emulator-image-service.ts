import { createTable } from "../helpers";
import { DeviceTypes } from "../constants";

//todo: plamen5kov: moved most of emulator-service here as a temporary solution untill after 3.0-RC
export class EmulatorImageService implements Mobile.IEmulatorImageService {

	constructor(
		private $mobileHelper: Mobile.IMobileHelper,
		private $childProcess: IChildProcess,
		private $devicesService: Mobile.IDevicesService,
		private $logger: ILogger,
		private $androidEmulatorServices: Mobile.IAndroidEmulatorServices) { }

	public async getEmulatorInfo(platform: string, idOrName: string): Promise<Mobile.IEmulatorInfo> {
		if (this.$mobileHelper.isAndroidPlatform(platform)) {
			const androidEmulators = this.getAndroidEmulators();
			const found = androidEmulators.filter((info: Mobile.IEmulatorInfo) => info.id === idOrName);
			if (found.length > 0) {
				return found[0];
			}

			await this.$devicesService.initialize({ platform: platform, deviceId: null, skipInferPlatform: true });
			let info: Mobile.IEmulatorInfo = null;
			const action = async (device: Mobile.IDevice) => {
				if (device.deviceInfo.identifier === idOrName) {
					info = {
						id: device.deviceInfo.identifier,
						name: device.deviceInfo.displayName,
						version: device.deviceInfo.version,
						platform: "Android",
						type: DeviceTypes.Emulator,
						isRunning: true
					};
				}
			};
			await this.$devicesService.execute(action, undefined, { allowNoDevices: true });
			return info;
		}

		if (this.$mobileHelper.isiOSPlatform(platform)) {
			const emulators = await this.getiOSEmulators();
			let sdk: string = null;
			const versionStart = idOrName.indexOf("(");
			if (versionStart > 0) {
				sdk = idOrName.substring(versionStart + 1, idOrName.indexOf(")", versionStart)).trim();
				idOrName = idOrName.substring(0, versionStart - 1).trim();
			}
			const found = emulators.filter((info: Mobile.IEmulatorInfo) => {
				const sdkMatch = sdk ? info.version === sdk : true;
				return sdkMatch && info.id === idOrName || info.name === idOrName;
			});
			return found.length > 0 ? found[0] : null;
		}

		return null;

	}

	public async listAvailableEmulators(platform: string): Promise<void> {
		let emulators: Mobile.IEmulatorInfo[] = [];
		if (!platform || this.$mobileHelper.isiOSPlatform(platform)) {
			const iosEmulators = await this.getiOSEmulators();
			if (iosEmulators) {
				emulators = emulators.concat(iosEmulators);
			}
		}

		if (!platform || this.$mobileHelper.isAndroidPlatform(platform)) {
			const androidEmulators = this.getAndroidEmulators();
			if (androidEmulators) {
				emulators = emulators.concat(androidEmulators);
			}
		}

		this.outputEmulators("\nAvailable emulators", emulators);
	}

	public async getiOSEmulators(): Promise<Mobile.IEmulatorInfo[]> {
		const output = await this.$childProcess.exec("xcrun simctl list --json");
		const list = JSON.parse(output);
		const emulators: Mobile.IEmulatorInfo[] = [];
		for (const osName in list["devices"]) {
			if (osName.indexOf("iOS") === -1) {
				continue;
			}
			const os = list["devices"][osName];
			const version = this.parseiOSVersion(osName);
			for (const device of os) {
				if (device["availability"] !== "(available)") {
					continue;
				}
				const emulatorInfo: Mobile.IEmulatorInfo = {
					id: device["udid"],
					name: device["name"],
					isRunning: device["state"] === "Booted",
					type: "simulator",
					version: version,
					platform: "iOS"
				};
				emulators.push(emulatorInfo);
			}
		}

		return emulators;
	}

	public getAndroidEmulators(): Mobile.IEmulatorInfo[] {
		const androidVirtualDevices: Mobile.IAvdInfo[] = this.$androidEmulatorServices.getAvds().map(avd => this.$androidEmulatorServices.getInfoFromAvd(avd));

		const emulators: Mobile.IEmulatorInfo[] = _.map(androidVirtualDevices, avd => {
			return { name: avd.device, version: avd.target, id: avd.name, platform: "Android", type: DeviceTypes.Emulator, isRunning: false };
		});

		return emulators;
	}

	private parseiOSVersion(osName: string): string {
		osName = osName.replace("com.apple.CoreSimulator.SimRuntime.iOS-", "");
		osName = osName.replace(/-/g, ".");
		osName = osName.replace("iOS", "");
		osName = osName.trim();
		return osName;
	}

	private outputEmulators(title: string, emulators: Mobile.IEmulatorInfo[]) {
		this.$logger.out(title);
		const table: any = createTable(["Device Name", "Platform", "Version", "Device Identifier"], []);
		for (const info of emulators) {
			table.push([info.name, info.platform, info.version, info.id]);
		}

		this.$logger.out(table.toString());
	}
}

$injector.register("emulatorImageService", EmulatorImageService);
