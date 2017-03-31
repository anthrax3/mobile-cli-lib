import { DevicesService } from "../../../mobile/mobile-core/devices-service";
import { Yok } from "../../../yok";

import { EventEmitter } from "events";
import { assert, use } from "chai";
import * as util from "util";

let chaiAsPromised = require('chai-as-promised');
use(chaiAsPromised);

import { CommonLoggerStub, ErrorsStub } from "../stubs";
import { Messages } from "../../../messages/messages";
import * as constants from "../../../constants";
import { DevicePlatformsConstants } from "../../../mobile/device-platforms-constants";

class IOSDeviceDiscoveryStub extends EventEmitter {
	public async startLookingForDevices(): Promise<void> {
		return;
	}

	public async checkForDevices(): Promise<void> {
		return;
	}
}

class AndroidDeviceDiscoveryStub extends EventEmitter {
	public async startLookingForDevices(): Promise<void> {
		return;
	}

	public async checkForDevices(): Promise<void> {
		return;
	}
}

class IOSSimulatorDiscoveryStub extends EventEmitter {
	public async startLookingForDevices(): Promise<void> {
		return;
	}

	public async checkForDevices(): Promise<void> {
		return;
	}
}

function getErrorMessage(injector: IInjector, message: string, ...args: string[]): string {
	return util.format(injector.resolve("messages").Devices[message],
		..._.concat(args, injector.resolve("staticConfig").CLIENT_NAME.toLowerCase()));
}

let androidDeviceDiscovery: EventEmitter,
	iOSDeviceDiscovery: EventEmitter,
	iOSSimulatorDiscovery: EventEmitter,
	androidEmulatorDevice: any = { deviceInfo: { identifier: "androidEmulatorDevice", platform: "android" }, isEmulator: true },
	iOSSimulator = {
		deviceInfo: {
			identifier: "ios-simulator-device",
			platform: "ios"
		},
		applicationManager: {
			getInstalledApplications: () => Promise.resolve(["com.telerik.unitTest1", "com.telerik.unitTest2"]),
			canStartApplication: () => true,
			startApplication: (packageName: string, framework: string) => Promise.resolve(),
			tryStartApplication: (packageName: string, framework: string) => Promise.resolve(),
			reinstallApplication: (packageName: string, packageFile: string) => Promise.resolve(),
			isApplicationInstalled: (packageName: string) => Promise.resolve(_.includes(["com.telerik.unitTest1", "com.telerik.unitTest2"], packageName)),
			isLiveSyncSupported: (appIdentifier: string) => Promise.resolve(_.includes(["com.telerik.unitTest1", "com.telerik.unitTest2"], appIdentifier))
		},
		deploy: (packageFile: string, packageName: string) => Promise.resolve(),
		isEmulator: true
	};

class AndroidEmulatorServices {
	public isStartEmulatorCalled = false;
	public async startEmulator(): Promise<void> {
		this.isStartEmulatorCalled = true;
		androidDeviceDiscovery.emit("deviceFound", androidEmulatorDevice);
		return Promise.resolve();
	}
}

class IOSEmulatorServices {
	public isStartEmulatorCalled = false;
	public async startEmulator(): Promise<void> {
		if (!this.isStartEmulatorCalled) {
			this.isStartEmulatorCalled = true;
			iOSSimulatorDiscovery.emit("deviceFound", iOSSimulator);
		}
		return Promise.resolve();
	}
}

function createTestInjector(): IInjector {
	let testInjector = new Yok();
	testInjector.register("logger", CommonLoggerStub);
	testInjector.register("errors", ErrorsStub);
	testInjector.register("iOSDeviceDiscovery", IOSDeviceDiscoveryStub);
	testInjector.register("iOSSimulatorDiscovery", IOSSimulatorDiscoveryStub);
	testInjector.register("androidDeviceDiscovery", AndroidDeviceDiscoveryStub);
	testInjector.register("staticConfig", { CLIENT_NAME: "unit-tests" });
	testInjector.register("devicePlatformsConstants", DevicePlatformsConstants);
	testInjector.register("androidEmulatorServices", AndroidEmulatorServices);
	testInjector.register("iOSEmulatorServices", IOSEmulatorServices);
	testInjector.register("messages", Messages);
	testInjector.register("companionAppsService", {});
	testInjector.register("processService", {
		attachToProcessExitSignals: (context: any, callback: () => Promise<any>) => { /* no implementation required */ }
	});

	testInjector.register("mobileHelper", {
		platformNames: ["ios", "android"],
		validatePlatformName: (platform: string) => platform.toLowerCase(),
		getPlatformCapabilities: (platform: string) => { return { cableDeploy: true }; },
		isiOSPlatform: (platform: string) => !!(platform && platform.toLowerCase() === "ios"),
		isAndroidPlatform: (platform: string) => !!(platform && platform.toLowerCase() === "android")
	});

	testInjector.register("deviceLogProvider", {
		setLogLevel: (logLevel: string, deviceIdentifier: string) => { /* no implementation required */ }
	});

	testInjector.register("devicesService", DevicesService);

	testInjector.register("hostInfo", {
		isDarwin: false
	});

	testInjector.register("options", {
		emulator: false
	});

	testInjector.register("androidProcessService", { /* no implementation required */ });

	return testInjector;
}

function mockIsAppInstalled(devices: { applicationManager: { isApplicationInstalled(packageName: string): Promise<boolean> } }[], expectedResult: boolean[]): void {
	_.each(devices, (device, index) => device.applicationManager.isApplicationInstalled = (packageName: string) => Promise.resolve(expectedResult[index]));
}

async function throwErrorFunction(): Promise<void> {
	throw new Error("error");
}

const getPromisesResults = async (promises: Promise<any>[]): Promise<any[]> => {
	let results: any = [];
	for (let i = 0; i < promises.length; i++) {
		let currentResult: any = {};
		try {
			currentResult.result = await promises[i];
		} catch (err) {
			currentResult.error = err;
		}

		results.push(currentResult);
	}

	return results;
};

let intervalId = 1;
let nodeJsTimer = {
	ref: () => { /* no implementation required */ },
	unref: () => { return intervalId++; }
};

let originalSetInterval = setInterval;
function mockSetInterval(testCaseCallback?: Function): void {
	global.setInterval = (callback: (...args: any[]) => Promise<void>, ms: number, ...args: any[]): NodeJS.Timer => {
		const execution = async () => {
			if (testCaseCallback) {
				testCaseCallback();
			}

			await callback();

		};

		process.nextTick(() => execution());
		return nodeJsTimer;
	};
}

function resetDefaultSetInterval(): void {
	global.setInterval = originalSetInterval;
}

describe("devicesService", () => {
	let counter = 0,
		iOSDevice = {
			deviceInfo: {
				identifier: "ios-device",
				platform: "ios",
				status: constants.CONNECTED_STATUS
			},
			applicationManager: {
				getInstalledApplications: () => Promise.resolve(["com.telerik.unitTest1", "com.telerik.unitTest2"]),
				canStartApplication: () => true,
				startApplication: (packageName: string, framework: string) => Promise.resolve(),
				tryStartApplication: (packageName: string, framework: string) => Promise.resolve(),
				reinstallApplication: (packageName: string, packageFile: string) => Promise.resolve(),
				isApplicationInstalled: (packageName: string) => Promise.resolve(_.includes(["com.telerik.unitTest1", "com.telerik.unitTest2"], packageName)),
				isLiveSyncSupported: (appIdentifier: string) => Promise.resolve(_.includes(["com.telerik.unitTest1", "com.telerik.unitTest2"], appIdentifier)),
				checkForApplicationUpdates: (): Promise<void> => Promise.resolve(),
				getDebuggableApps: (): Promise<Mobile.IDeviceApplicationInformation[]> => Promise.resolve(null),
				getDebuggableAppViews: (appIdentifiers: string[]): Promise<IDictionary<Mobile.IDebugWebViewInfo[]>> => Promise.resolve(null)
			},
			deploy: (packageFile: string, packageName: string) => Promise.resolve()
		},
		androidDevice = {
			deviceInfo: {
				identifier: "android-device",
				platform: "android",
				status: constants.CONNECTED_STATUS
			},
			applicationManager: {
				getInstalledApplications: () => Promise.resolve(["com.telerik.unitTest1", "com.telerik.unitTest2", "com.telerik.unitTest3"]),
				canStartApplication: () => true,
				startApplication: (packageName: string, framework: string) => Promise.resolve(),
				tryStartApplication: (packageName: string, framework: string) => Promise.resolve(),
				reinstallApplication: (packageName: string, packageFile: string) => Promise.resolve(),
				isApplicationInstalled: (packageName: string) => Promise.resolve(_.includes(["com.telerik.unitTest1", "com.telerik.unitTest2", "com.telerik.unitTest3"], packageName)),
				isLiveSyncSupported: (appIdentifier: string) => Promise.resolve(_.includes(["com.telerik.unitTest1", "com.telerik.unitTest2", "com.telerik.unitTest3"], appIdentifier)),
				checkForApplicationUpdates: (): Promise<void> => Promise.resolve(),
				getDebuggableApps: (): Promise<Mobile.IDeviceApplicationInformation[]> => Promise.resolve(null),
				getDebuggableAppViews: (appIdentifiers: string[]): Promise<IDictionary<Mobile.IDebugWebViewInfo[]>> => Promise.resolve(null)
			},
			deploy: (packageFile: string, packageName: string) => Promise.resolve()
		},
		testInjector: IInjector,
		devicesService: Mobile.IDevicesService,
		androidEmulatorServices: any,
		logger: CommonLoggerStub,
		assertAndroidEmulatorIsStarted = async () => {
			assert.isFalse(androidEmulatorServices.isStartEmulatorCalled);
			await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true);
			assert.deepEqual(counter, 1, "The action must be executed on only one device.");
			assert.isTrue(androidEmulatorServices.isStartEmulatorCalled);
			androidDeviceDiscovery.emit("deviceLost", androidEmulatorDevice);
			androidEmulatorServices.isStartEmulatorCalled = false;
		};

	beforeEach(() => {
		testInjector = createTestInjector();
		devicesService = testInjector.resolve("devicesService");
		iOSDeviceDiscovery = testInjector.resolve("iOSDeviceDiscovery");
		iOSSimulatorDiscovery = testInjector.resolve("iOSSimulatorDiscovery");
		androidDeviceDiscovery = testInjector.resolve("androidDeviceDiscovery");
		androidEmulatorServices = testInjector.resolve("androidEmulatorServices");
		logger = testInjector.resolve("logger");
		counter = 0;
	});

	it("attaches to events when a new DevicesService is instantiated", () => {
		iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
		androidDeviceDiscovery.emit("deviceFound", androidDevice);
		let devices = devicesService.getDeviceInstances();
		assert.isTrue(devicesService.hasDevices, "After emitting two devices, hasDevices must be true");
		assert.deepEqual(devices[0], iOSDevice);
		assert.deepEqual(devices[1], androidDevice);
	});

	describe("hasDevices", () => {
		it("is true when device is found", () => {
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			assert.isTrue(devicesService.hasDevices, "After emitting, hasDevices must be true");
		});

		it("is false when device is found and lost after that", () => {
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			androidDeviceDiscovery.emit("deviceLost", androidDevice);
			assert.isFalse(devicesService.hasDevices, "After losing all devices, hasDevices must be false.");
		});

		it("is true when two devices are found and one of them is lost after that", () => {
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
			androidDeviceDiscovery.emit("deviceLost", androidDevice);
			assert.isTrue(devicesService.hasDevices, "After losing only one of two devices, hasDevices must be true.");
		});
	});

	describe("getDeviceInstances and getDevices", () => {
		it("returns one android device, when only one device is attached", () => {
			assert.deepEqual(devicesService.getDeviceInstances(), [], "Initially getDevicesInstances must return empty array.");
			assert.deepEqual(devicesService.getDevices(), [], "Initially getDevices must return empty array.");

			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			assert.deepEqual(devicesService.getDeviceInstances(), [androidDevice]);
			assert.deepEqual(devicesService.getDevices(), [androidDevice.deviceInfo]);
		});

		it("does not return any devices, when only one device is attached and it is removed after that", () => {
			assert.deepEqual(devicesService.getDeviceInstances(), [], "Initially getDevicesInstances must return empty array.");
			assert.deepEqual(devicesService.getDevices(), [], "Initially getDevices must return empty array.");

			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			assert.deepEqual(devicesService.getDeviceInstances(), [androidDevice]);
			assert.deepEqual(devicesService.getDevices(), [androidDevice.deviceInfo]);

			androidDeviceDiscovery.emit("deviceLost", androidDevice);
			assert.deepEqual(devicesService.getDeviceInstances(), [], "When all devices are lost, getDevicesInstances must return empty array.");
			assert.deepEqual(devicesService.getDevices(), [], "When all devices are lost, getDevices must return empty array.");
		});

		it("returns one android device, when two devices are attached and one of them is removed", () => {
			assert.deepEqual(devicesService.getDeviceInstances(), [], "Initially getDevicesInstances must return empty array.");
			assert.deepEqual(devicesService.getDevices(), [], "Initially getDevices must return empty array.");

			let tempDevice = { deviceInfo: { identifier: "temp-device" } };
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			androidDeviceDiscovery.emit("deviceFound", tempDevice);
			assert.deepEqual(devicesService.getDeviceInstances(), [androidDevice, tempDevice]);
			assert.deepEqual(devicesService.getDevices(), [androidDevice.deviceInfo, tempDevice.deviceInfo]);

			androidDeviceDiscovery.emit("deviceLost", tempDevice);
			assert.deepEqual(devicesService.getDeviceInstances(), [androidDevice]);
			assert.deepEqual(devicesService.getDevices(), [androidDevice.deviceInfo]);
		});
	});

	describe("isAppInstalledOnDevices", () => {
		beforeEach(() => {
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
		});

		it("returns true for each device on which the app is installed", async () => {
			let deviceIdentifiers = [androidDevice.deviceInfo.identifier, iOSDevice.deviceInfo.identifier],
				appId = "com.telerik.unitTest1";
			let results = await devicesService.isAppInstalledOnDevices(deviceIdentifiers, appId, "cordova");
			assert.isTrue(results.length > 0);

			for (let index = 0; index < results.length; index++) {
				let realResult = await results[index];
				assert.isTrue(realResult.isInstalled);
				assert.deepEqual(realResult.appIdentifier, appId);
				assert.deepEqual(realResult.deviceIdentifier, deviceIdentifiers[index]);
				assert.deepEqual(realResult.isLiveSyncSupported, true);
			}
		});

		it("returns false for each device on which the app is not installed", async () => {
			let results = devicesService.isAppInstalledOnDevices([androidDevice.deviceInfo.identifier, iOSDevice.deviceInfo.identifier], "com.telerik.unitTest3", "cordova");
			assert.isTrue(results.length > 0);
			const isInstalledOnDevices = (await Promise.all(results)).map(r => r.isInstalled);
			assert.deepEqual(isInstalledOnDevices, [true, false]);
		});

		it("throws error when invalid identifier is passed", async () => {
			let results = devicesService.isAppInstalledOnDevices(["invalidDeviceId", iOSDevice.deviceInfo.identifier], "com.telerik.unitTest1", "cordova");

			let expectedErrorMessage = getErrorMessage(testInjector, "NotFoundDeviceByIdentifierErrorMessageWithIdentifier", "invalidDeviceId");

			await assert.isRejected(Promise.all(results), expectedErrorMessage);

			_.each(await getPromisesResults(results), promiseResult => {
				let error = promiseResult.error;
				if (error) {
					assert.isTrue(error.message.indexOf("invalidDeviceId") !== -1, "The message must contain the id of the invalid device.");
				} else {
					assert.isTrue(promiseResult.result.isInstalled, "The app is installed on iOS Device, so we must return true.");
				}
			});
		});
	});

	describe("initialize and other methods behavior after initialze work correctly", () => {
		let tempDevice = {
			deviceInfo: {
				identifier: "temp-device",
				platform: "android"
			},
			applicationManager: {
				getInstalledApplications: () => Promise.resolve(["com.telerik.unitTest1", "com.telerik.unitTest2", "com.telerik.unitTest3"]),
				isApplicationInstalled: (packageName: string) => Promise.resolve(_.includes(["com.telerik.unitTest1", "com.telerik.unitTest2", "com.telerik.unitTest3"], packageName)),
				isLiveSyncSupported: (appIdentifier: string) => Promise.resolve(_.includes(["com.telerik.unitTest1", "com.telerik.unitTest2", "com.telerik.unitTest3"], appIdentifier))
			}
		};

		describe("when initialize is called with platform and deviceId and device's platform is the same as passed one", () => {

			let assertAllMethodsResults = async (deviceId: string) => {
				assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
				androidDeviceDiscovery.emit("deviceFound", androidDevice);
				await devicesService.initialize({ platform: "android", deviceId: deviceId });
				assert.deepEqual(devicesService.platform, "android");
				assert.deepEqual(devicesService.deviceCount, 1);
				androidDeviceDiscovery.emit("deviceFound", tempDevice);
				assert.isTrue(devicesService.hasDevices, "After emitting and initializing, hasDevices must be true");
				assert.deepEqual(devicesService.getDeviceInstances(), [androidDevice, tempDevice]);
				assert.deepEqual(devicesService.getDevices(), [androidDevice.deviceInfo, tempDevice.deviceInfo]);
				assert.deepEqual(devicesService.deviceCount, 1);
				await devicesService.execute(() => { counter++; return Promise.resolve(); });
				assert.deepEqual(counter, 1, "The action must be executed on only one device.");
				counter = 0;
				await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => false);
				assert.deepEqual(counter, 0, "The action must not be executed when canExecute returns false.");
				counter = 0;
				await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true);
				assert.deepEqual(counter, 1, "The action must be executed on only one device.");
				androidDeviceDiscovery.emit("deviceLost", androidDevice);
				androidDeviceDiscovery.emit("deviceLost", tempDevice);
				counter = 0;
				await assertAndroidEmulatorIsStarted();
				counter = 0;
				await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true, { allowNoDevices: true });
				assert.deepEqual(counter, 0, "The action must not be executed when there are no devices.");
				assert.isTrue(logger.output.indexOf(constants.ERROR_NO_DEVICES) !== -1);
			};

			it("when deviceId is deviceIdentifier", async () => {
				await assertAllMethodsResults(androidDevice.deviceInfo.identifier);
			});

			it("when deviceId is index", async () => {
				await assertAllMethodsResults("1");
			});

			it("fails when deviceId is invalid index (less than 0)", async () => {
				let expectedErrorMessage = getErrorMessage(testInjector, "NotFoundDeviceByIndexErrorMessage", "-2");
				await assert.isRejected(devicesService.initialize({ platform: "android", deviceId: "-1" }), expectedErrorMessage);
			});

			it("fails when deviceId is invalid index (more than currently connected devices)", async () => {
				let expectedErrorMessage = getErrorMessage(testInjector, "NotFoundDeviceByIndexErrorMessage", "99");
				await assert.isRejected(devicesService.initialize({ platform: "android", deviceId: "100" }), expectedErrorMessage);
			});

			it("does not fail when iOSDeviceDiscovery startLookingForDevices fails", async () => {
				(<any>iOSDeviceDiscovery).startLookingForDevices = (): Promise<void> => { throw new Error("my error"); };
				await assertAllMethodsResults("1");
				assert.isTrue(logger.traceOutput.indexOf("my error") !== -1);
			});

			it("does not fail when androidDeviceDiscovery startLookingForDevices fails", async () => {
				(<any>androidDeviceDiscovery).startLookingForDevices = (): Promise<void> => { throw new Error("my error"); };
				iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
				await devicesService.initialize({ platform: "ios", deviceId: iOSDevice.deviceInfo.identifier });
				assert.isTrue(logger.traceOutput.indexOf("my error") !== -1);
			});

			it("does not fail when iosSimulatorDiscovery startLookingForDevices fails", async () => {
				let hostInfo = testInjector.resolve("hostInfo");
				hostInfo.isDarwin = true;
				(<any>iOSSimulatorDiscovery).startLookingForDevices = (): Promise<void> => { throw new Error("my error"); };
				iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
				await devicesService.initialize({ platform: "ios", deviceId: iOSDevice.deviceInfo.identifier });
				assert.isTrue(logger.traceOutput.indexOf("my error") !== -1);
			});
		});

		it("when initialize is called with platform and deviceId and such device cannot be found", async () => {
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");

			let expectedErrorMessage = getErrorMessage(testInjector, "NotFoundDeviceByIdentifierErrorMessage");
			await assert.isRejected(devicesService.initialize({ platform: "android", deviceId: androidDevice.deviceInfo.identifier }), expectedErrorMessage);
		});

		it("when initialize is called with deviceId and invalid platform", async () => {
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
			iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			await assert.isRejected(devicesService.initialize({ platform: "invalidPlatform", deviceId: androidDevice.deviceInfo.identifier }), "Deploying to %s connected devices is not supported. Build the app using the `build` command and deploy the package manually.");
		});

		it("when initialize is called with platform and deviceId and device's platform is different", async () => {
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
			iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			await assert.isRejected(devicesService.initialize({ platform: "ios", deviceId: androidDevice.deviceInfo.identifier }), "Cannot resolve the specified connected device. The provided platform does not match the provided index or identifier.To list currently connected devices and verify that the specified pair of platform and index or identifier exists, run \'device\'.");
		});

		describe("when only deviceIdentifier is passed", () => {

			let assertAllMethodsResults = async (deviceId: string) => {
				assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
				androidDeviceDiscovery.emit("deviceFound", androidDevice);
				await devicesService.initialize({ deviceId: deviceId });
				assert.deepEqual(devicesService.platform, "android");
				assert.deepEqual(devicesService.deviceCount, 1);
				androidDeviceDiscovery.emit("deviceFound", tempDevice);
				iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
				assert.isTrue(devicesService.hasDevices, "After emitting and initializing, hasDevices must be true");
				assert.deepEqual(devicesService.getDeviceInstances(), [androidDevice, tempDevice, iOSDevice]);
				assert.deepEqual(devicesService.getDevices(), [androidDevice.deviceInfo, tempDevice.deviceInfo, iOSDevice.deviceInfo]);
				assert.deepEqual(devicesService.deviceCount, 1);
				counter = 0;
				await devicesService.execute(() => { counter++; return Promise.resolve(); });
				assert.deepEqual(counter, 1, "The action must be executed on only one device.");
				counter = 0;
				await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => false);
				assert.deepEqual(counter, 0, "The action must not be executed when canExecute returns false.");
				counter = 0;
				await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true);
				assert.deepEqual(counter, 1, "The action must be executed on only one device.");
				androidDeviceDiscovery.emit("deviceLost", androidDevice);
				androidDeviceDiscovery.emit("deviceLost", tempDevice);
				iOSDeviceDiscovery.emit("deviceLost", iOSDevice);
				counter = 0;
				await assertAndroidEmulatorIsStarted();
				counter = 0;
				await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true, { allowNoDevices: true });
				assert.deepEqual(counter, 0, "The action must not be executed when there are no devices.");
				assert.isTrue(logger.output.indexOf(constants.ERROR_NO_DEVICES) !== -1);
			};

			it("when deviceId is deviceIdentifier", async () => {
				await assertAllMethodsResults(androidDevice.deviceInfo.identifier);
			});

			it("when deviceId is index", async () => {
				await assertAllMethodsResults("1");
			});

			it("fails when deviceId is invalid index (less than 0)", async () => {
				let expectedErrorMessage = getErrorMessage(testInjector, "NotFoundDeviceByIndexErrorMessage", "-2");
				await assert.isRejected(devicesService.initialize({ deviceId: "-1" }), expectedErrorMessage);
			});

			it("fails when deviceId is invalid index (more than currently connected devices)", async () => {
				let expectedErrorMessage = getErrorMessage(testInjector, "NotFoundDeviceByIndexErrorMessage", "99");
				await assert.isRejected(devicesService.initialize({ deviceId: "100" }), expectedErrorMessage);
			});

			it("does not fail when iOSDeviceDiscovery startLookingForDevices fails", async () => {
				(<any>iOSDeviceDiscovery).startLookingForDevices = (): Promise<void> => { throw new Error("my error"); };
				await assertAllMethodsResults("1");
				assert.isTrue(logger.traceOutput.indexOf("my error") !== -1);
			});

			it("does not fail when androidDeviceDiscovery startLookingForDevices fails", async () => {
				(<any>androidDeviceDiscovery).startLookingForDevices = (): Promise<void> => { throw new Error("my error"); };
				iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
				await devicesService.initialize({ deviceId: iOSDevice.deviceInfo.identifier });
				assert.isTrue(logger.traceOutput.indexOf("my error") !== -1);
			});
		});

		describe("when only platform is passed", () => {
			it("execute fails when platform is iOS on non-Darwin platform and there are no devices attached when --emulator is passed", async () => {
				testInjector.resolve("hostInfo").isDarwin = false;
				await devicesService.initialize({ platform: "ios" });
				testInjector.resolve("options").emulator = true;
				await assert.isRejected(devicesService.execute(() => { counter++; return Promise.resolve(); }), "Cannot find connected devices. Reconnect any connected devices");
			});

			it("execute fails when platform is iOS on non-Darwin platform and there are no devices attached", async () => {
				testInjector.resolve("hostInfo").isDarwin = false;
				await devicesService.initialize({ platform: "ios" });
				assert.isFalse(devicesService.hasDevices, "MUST BE FALSE!!!");
				await assert.isRejected(devicesService.execute(() => { counter++; return Promise.resolve(); }), "Cannot find connected devices. Reconnect any connected devices");
			});

			it("executes action only on iOS Simulator when iOS device is found and --emulator is passed", async () => {
				testInjector.resolve("options").emulator = true;
				testInjector.resolve("hostInfo").isDarwin = true;
				iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
				await devicesService.initialize({ platform: "ios" });
				let deviceIdentifier: string;
				counter = 0;
				await devicesService.execute((d: Mobile.IDevice) => { deviceIdentifier = d.deviceInfo.identifier; counter++; return Promise.resolve(); });
				assert.deepEqual(counter, 1, "The action must be executed on only one device. ASAAS");
				assert.deepEqual(deviceIdentifier, iOSSimulator.deviceInfo.identifier);
				counter = 0;
				await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => false);
				assert.deepEqual(counter, 0, "The action must not be executed when canExecute returns false.");
				counter = 0;
				iOSDeviceDiscovery.emit("deviceLost", iOSDevice);
				deviceIdentifier = null;
				await devicesService.execute((d: Mobile.IDevice) => { deviceIdentifier = d.deviceInfo.identifier; counter++; return Promise.resolve(); });
				assert.deepEqual(counter, 1, "The action must be executed on only one device.");
				assert.deepEqual(deviceIdentifier, iOSSimulator.deviceInfo.identifier);
				counter = 0;
				deviceIdentifier = null;
				await devicesService.execute((d: Mobile.IDevice) => { deviceIdentifier = d.deviceInfo.identifier; counter++; return Promise.resolve(); }, () => false);
				assert.deepEqual(counter, 0, "The action must not be executed when canExecute returns false.");
				assert.deepEqual(deviceIdentifier, null);
			});

			it("all methods work as expected", async () => {
				assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
				androidDeviceDiscovery.emit("deviceFound", androidDevice);
				await devicesService.initialize({ platform: "android" });
				assert.deepEqual(devicesService.platform, "android");
				assert.deepEqual(devicesService.deviceCount, 1);
				androidDeviceDiscovery.emit("deviceFound", tempDevice);
				assert.isTrue(devicesService.hasDevices, "After emitting and initializing, hasDevices must be true");
				assert.deepEqual(devicesService.getDeviceInstances(), [androidDevice, tempDevice]);
				assert.deepEqual(devicesService.getDevices(), [androidDevice.deviceInfo, tempDevice.deviceInfo]);
				assert.deepEqual(devicesService.deviceCount, 2);
				counter = 0;
				await devicesService.execute(() => { counter++; return Promise.resolve(); });
				assert.deepEqual(counter, 2, "The action must be executed on two devices.");
				counter = 0;
				await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => false);
				assert.deepEqual(counter, 0, "The action must not be executed when canExecute returns false.");
				counter = 0;
				await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true);
				assert.deepEqual(counter, 2, "The action must be executed on two devices.");
				androidDeviceDiscovery.emit("deviceLost", androidDevice);
				counter = 0;
				await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true);
				assert.deepEqual(counter, 1, "The action must be executed on only one device.");
				androidDeviceDiscovery.emit("deviceLost", tempDevice);
				counter = 0;
				await assertAndroidEmulatorIsStarted();
				counter = 0;
				await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true, { allowNoDevices: true });
				assert.deepEqual(counter, 0, "The action must not be executed when there are no devices.");
				assert.isTrue(logger.output.indexOf(constants.ERROR_NO_DEVICES) !== -1);
				assert.isFalse(androidEmulatorServices.isStartEmulatorCalled);
			});
		});

		it("when only skipInferPlatform is passed (true)", async () => {
			mockSetInterval();
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
			await devicesService.initialize({ skipInferPlatform: true });
			assert.deepEqual(devicesService.platform, undefined);
			assert.deepEqual(devicesService.deviceCount, 2);
			androidDeviceDiscovery.emit("deviceFound", tempDevice);
			assert.isTrue(devicesService.hasDevices, "After emitting and initializing, hasDevices must be true");
			assert.deepEqual(devicesService.getDeviceInstances(), [androidDevice, iOSDevice, tempDevice]);
			assert.deepEqual(devicesService.getDevices(), [androidDevice.deviceInfo, iOSDevice.deviceInfo, tempDevice.deviceInfo]);
			assert.deepEqual(devicesService.deviceCount, 3);
			counter = 0;
			await devicesService.execute(() => { counter++; return Promise.resolve(); });
			assert.deepEqual(counter, 3, "The action must be executed on two devices.");
			counter = 0;
			await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => false);
			assert.deepEqual(counter, 0, "The action must not be executed when canExecute returns false.");
			counter = 0;
			await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true);
			assert.deepEqual(counter, 3, "The action must be executed on three devices.");
			androidDeviceDiscovery.emit("deviceLost", androidDevice);
			counter = 0;
			await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true);
			assert.deepEqual(counter, 2, "The action must be executed on two devices.");
			androidDeviceDiscovery.emit("deviceLost", tempDevice);
			iOSDeviceDiscovery.emit("deviceLost", iOSDevice);
			counter = 0;
			await assert.isRejected(devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true), "Unable to detect platform for which to start emulator.");
			counter = 0;
			devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true, { allowNoDevices: true });
			assert.deepEqual(counter, 0, "The action must not be executed when there are no devices.");
			assert.isTrue(logger.output.indexOf(constants.ERROR_NO_DEVICES) !== -1);
		});

		it("when parameters are not passed and devices with same platform are detected", async () => {
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			await devicesService.initialize();
			assert.deepEqual(devicesService.platform, "android");
			assert.deepEqual(devicesService.deviceCount, 1);
			androidDeviceDiscovery.emit("deviceFound", tempDevice);
			assert.isTrue(devicesService.hasDevices, "After emitting and initializing, hasDevices must be true");
			assert.deepEqual(devicesService.getDeviceInstances(), [androidDevice, tempDevice]);
			assert.deepEqual(devicesService.getDevices(), [androidDevice.deviceInfo, tempDevice.deviceInfo]);
			assert.deepEqual(devicesService.deviceCount, 2);
			counter = 0;
			await devicesService.execute(() => { counter++; return Promise.resolve(); });
			assert.deepEqual(counter, 2, "The action must be executed on two devices.");
			counter = 0;
			await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => false);
			assert.deepEqual(counter, 0, "The action must not be executed when canExecute returns false.");
			counter = 0;
			await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true);
			assert.deepEqual(counter, 2, "The action must be executed on two devices.");
			androidDeviceDiscovery.emit("deviceLost", androidDevice);
			counter = 0;
			await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true);
			assert.deepEqual(counter, 1, "The action must be executed on only one device.");
			androidDeviceDiscovery.emit("deviceLost", tempDevice);
			counter = 0;
			await assertAndroidEmulatorIsStarted();
			counter = 0;
			await devicesService.execute(() => { counter++; return Promise.resolve(); }, () => true, { allowNoDevices: true });
			assert.deepEqual(counter, 0, "The action must not be executed when there are no devices.");
			assert.isTrue(logger.output.indexOf(constants.ERROR_NO_DEVICES) !== -1);
		});

		it("when parameters are not passed and devices with different platforms are detected initialize should throw", async () => {
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
			await assert.isRejected(devicesService.initialize(), "Multiple device platforms detected (android and ios). Specify platform or device on command line.");
		});

		it("when parameters are not passed and devices with invalid platforms are detected initialize should work with correct devices only", async () => {
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			iOSDeviceDiscovery.emit("deviceFound", {
				deviceInfo: {
					identifier: "invalid-platform-device",
					platform: "invalid-platform"
				}
			});

			await devicesService.initialize();

			assert.isTrue(logger.output.indexOf("is not supported") !== -1);
		});

		it("when parameters are not passed and only devices with invalid platforms are detected, initialize should throw", async () => {
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
			iOSDeviceDiscovery.emit("deviceFound", {
				deviceInfo: {
					identifier: "invalid-platform-device",
					platform: "invalid-platform"
				}
			});
			await assert.isRejected(devicesService.initialize(), "{ formatStr: \'Cannot find connected devices. Reconnect any connected devices, verify that your system recognizes them, and run this command again.\',\n  suppressCommandHelp: true }");
		});

		it("caches execution result and does not execute next time when called", async () => {
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			await devicesService.initialize({ platform: "android" });
			assert.deepEqual(devicesService.platform, "android");
			assert.deepEqual(devicesService.deviceCount, 1);
			await devicesService.initialize({ platform: "ios" });
			assert.deepEqual(devicesService.platform, "android");
		});

		describe("when options.emulator is true on non-Darwin OS", () => {
			beforeEach(() => {
				let options = testInjector.resolve("options");
				options.emulator = true;
				let hostInfo = testInjector.resolve("hostInfo");
				hostInfo.isDarwin = false;
			});

			it("throws when iOS platform is specified and iOS device identifier is passed", async () => {
				iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
				await assert.isRejected(devicesService.initialize({ platform: "ios", deviceId: iOSDevice.deviceInfo.identifier }), "You can use iOS simulator only on OS X.");
			});

			it("throws when iOS device identifier is passed", async () => {
				iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
				await assert.isRejected(devicesService.initialize({ deviceId: iOSDevice.deviceInfo.identifier }), "You can use iOS simulator only on OS X.");
			});

			it("throws when iOS platform is specified", async () => {
				await assert.isRejected(devicesService.initialize({ platform: "ios" }), "You can use iOS simulator only on OS X.");
			});

			it("throws when paramaters are not passed, but iOS device is detected", async () => {
				iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
				await assert.isRejected(devicesService.initialize(), "You can use iOS simulator only on OS X.");
			});

			it("does not throw when only skipInferPlatform is passed", async () => {
				mockSetInterval();
				await devicesService.initialize({ skipInferPlatform: true });
			});

			it("does not throw when Android platform is specified and Android device identifier is passed", async () => {
				androidDeviceDiscovery.emit("deviceFound", androidDevice);
				await devicesService.initialize({ platform: "android", deviceId: androidDevice.deviceInfo.identifier });
			});
		});

		describe("does not fail on Darwin when trying to use iOS simulator", () => {
			beforeEach(() => {
				let options = testInjector.resolve("options");
				options.emulator = true;
				let hostInfo = testInjector.resolve("hostInfo");
				hostInfo.isDarwin = true;
			});

			it("when iOS platform is specified and iOS device identifier is passed", async () => {
				iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
				await devicesService.initialize({ platform: "ios", deviceId: iOSDevice.deviceInfo.identifier });
			});

			it("when iOS device identifier is passed", async () => {
				iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
				await devicesService.initialize({ deviceId: iOSDevice.deviceInfo.identifier });
			});

			it("when iOS platform is specified", async () => {
				await devicesService.initialize({ platform: "ios" });
			});

			it("when paramaters are not passed, but iOS device is detected", async () => {
				iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
				await devicesService.initialize();
			});

			it("when only skipInferPlatform is passed", async () => {
				await devicesService.initialize({ skipInferPlatform: true });
			});

			it("when iOS platform is specified and iOS simulator device identifier is passed", async () => {
				iOSDeviceDiscovery.emit("deviceFound", iOSSimulator);
				await devicesService.initialize({ platform: "ios", deviceId: iOSSimulator.deviceInfo.identifier });
			});

			it("when iOS simulator identifier is passed", async () => {
				iOSDeviceDiscovery.emit("deviceFound", iOSSimulator);
				await devicesService.initialize({ deviceId: iOSSimulator.deviceInfo.identifier });
			});

			it("when paramaters are not passed, but iOS simulator is detected", async () => {
				iOSDeviceDiscovery.emit("deviceFound", iOSSimulator);
				await devicesService.initialize();
			});
		});
	});

	describe("setLogLevel", () => {
		it("calls deviceLogProvider's setLogLevel with correct arguments", () => {
			let deviceLogProvider = testInjector.resolve("deviceLogProvider");
			let actualLogLevel: string = null,
				actualDeviceIdentifier: string = null;

			deviceLogProvider.setLogLevel = (logLevel: string, deviceIdentifier?: string) => {
				actualLogLevel = logLevel;
				actualDeviceIdentifier = deviceIdentifier;
			};

			let expectedLogLevel = "expectedLogLevel",
				expectedDeviceId = "expcetedDeviceId";

			devicesService.setLogLevel(expectedLogLevel, expectedDeviceId);
			assert.deepEqual(actualLogLevel, expectedLogLevel);
			assert.deepEqual(actualDeviceIdentifier, expectedDeviceId);

			devicesService.setLogLevel(expectedLogLevel);
			assert.deepEqual(actualLogLevel, expectedLogLevel);
			assert.deepEqual(actualDeviceIdentifier, undefined);
		});
	});

	describe("deployOnDevices", () => {
		beforeEach(() => {
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
		});

		it("returns undefined for each device on which the app is installed", async () => {
			let results = devicesService.deployOnDevices([androidDevice.deviceInfo.identifier, iOSDevice.deviceInfo.identifier], "path", "packageName", "cordova");
			assert.isTrue(results.length > 0);
			_.each(await Promise.all(results), deployOnDevicesResult => {
				let realResult = deployOnDevicesResult;
				assert.isTrue(realResult === undefined, "On success, undefined should be returned.");
			});
		});

		it("does not call startApplication when canStartApplication returns false", async () => {
			iOSDevice.applicationManager.canStartApplication = () => false;
			iOSDevice.applicationManager.startApplication = (): Promise<void> => {
				throw new Error("Start application must not be called for iOSDevice when canStartApplication returns false.");
			};

			let results = devicesService.deployOnDevices([androidDevice.deviceInfo.identifier, iOSDevice.deviceInfo.identifier], "path", "packageName", "cordova");
			assert.isTrue(results.length > 0);
			const deployOnDevicesResults = await Promise.all(results);
			assert.deepEqual(deployOnDevicesResults, [undefined, undefined]);
		});

		it("throws error when invalid identifier is passed", async () => {
			let results = devicesService.deployOnDevices(["invalidDeviceId", iOSDevice.deviceInfo.identifier], "path", "packageName", "cordova");
			let expectedErrorMessage = getErrorMessage(testInjector, "NotFoundDeviceByIdentifierErrorMessageWithIdentifier", "invalidDeviceId");
			await assert.isRejected(Promise.all(results), expectedErrorMessage);
			let realResults = await getPromisesResults(results);
			_.each(realResults, singlePromiseResult => {
				let error = singlePromiseResult.error;
				if (error) {
					assert.isTrue(error.message.indexOf("invalidDeviceId") !== -1, "The message must contain the id of the invalid device.");
				} else {
					assert.isTrue(singlePromiseResult.result === undefined, "On success, undefined should be returned.");
				}
			});
		});
	});

	describe("getDevicesForPlatform", () => {
		it("returns empty array when there are no devices", () => {
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
			assert.deepEqual(devicesService.getDevicesForPlatform("android"), []);
			assert.deepEqual(devicesService.getDevicesForPlatform("ios"), []);
			assert.deepEqual(devicesService.getDevicesForPlatform("invalid platform"), []);
		});

		it("returns correct results when devices with different platforms are detected", () => {
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
			let tempDeviceInstance = { deviceInfo: { identifier: "temp-device", platform: "android" } };
			androidDeviceDiscovery.emit("deviceFound", tempDeviceInstance);
			assert.deepEqual(devicesService.getDevicesForPlatform("android"), [androidDevice, tempDeviceInstance]);
			assert.deepEqual(devicesService.getDevicesForPlatform("ios"), [iOSDevice]);
			assert.deepEqual(devicesService.getDevicesForPlatform("invalid platform"), []);
		});

		it("returns correct results when devices with different platforms are detected, assert case insensitivity", () => {
			assert.isFalse(devicesService.hasDevices, "Initially devicesService hasDevices must be false.");
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
			let tempDeviceInstance = { deviceInfo: { identifier: "temp-device", platform: "AndroId" } };
			androidDeviceDiscovery.emit("deviceFound", tempDeviceInstance);
			assert.deepEqual(devicesService.getDevicesForPlatform("android"), [androidDevice, tempDeviceInstance]);
			assert.deepEqual(devicesService.getDevicesForPlatform("ios"), [iOSDevice]);
			assert.deepEqual(devicesService.getDevicesForPlatform("invalid platform"), []);

			assert.deepEqual(devicesService.getDevicesForPlatform("AnDroID"), [androidDevice, tempDeviceInstance]);
			assert.deepEqual(devicesService.getDevicesForPlatform("Ios"), [iOSDevice]);
			assert.deepEqual(devicesService.getDevicesForPlatform("inValid PlatForm"), []);

			assert.deepEqual(devicesService.getDevicesForPlatform("ANDROID"), [androidDevice, tempDeviceInstance]);
			assert.deepEqual(devicesService.getDevicesForPlatform("IOS"), [iOSDevice]);
			assert.deepEqual(devicesService.getDevicesForPlatform("INVALID PLATFORM"), []);
		});
	});

	describe("isAndroidDevice", () => {
		it("returns true when android device is passed", () => {
			assert.isTrue(devicesService.isAndroidDevice(<any>androidDevice));
		});

		it("returns true when android emulator is passed", () => {
			assert.isTrue(devicesService.isAndroidDevice(<any>{ deviceInfo: { platform: "android" }, isEmulator: true }));
		});

		it("returns true when android device is passed, assert case insensitivity", () => {
			assert.isTrue(devicesService.isAndroidDevice(<any>{ deviceInfo: { platform: "aNdRoId" } }));
			assert.isTrue(devicesService.isAndroidDevice(<any>{ deviceInfo: { platform: "ANDROID" } }));
		});

		it("returns false when iOS device is passed", () => {
			assert.isFalse(devicesService.isAndroidDevice(<any>iOSDevice));
			assert.isFalse(devicesService.isAndroidDevice(<any>iOSSimulator));
		});

		it("returns false when device with invalid platform is passed", () => {
			assert.isFalse(devicesService.isAndroidDevice(<any>{ deviceInfo: { platform: "invalid platform" } }));
		});
	});

	describe("isiOSDevice", () => {
		it("returns true when iOS device is passed", () => {
			assert.isTrue(devicesService.isiOSDevice(<any>iOSDevice));
		});

		it("returns true when iOS device is passed, assert case insensitivity", () => {
			assert.isTrue(devicesService.isiOSDevice(<any>{ deviceInfo: { platform: "iOs" } }));
			assert.isTrue(devicesService.isiOSDevice(<any>{ deviceInfo: { platform: "IOS" } }));
		});

		it("returns false when android device is passed", () => {
			assert.isFalse(devicesService.isiOSDevice(<any>androidDevice));
		});

		it("returns false when device with invalid platform is passed", () => {
			assert.isFalse(devicesService.isiOSDevice(<any>{ deviceInfo: { platform: "invalid platform" } }));
		});

		it("returns false when iOS emulator is passed", () => {
			assert.isFalse(devicesService.isiOSDevice(<any>iOSSimulator));
		});
	});

	describe("isiOSSimulator", () => {
		it("returns true when iOS simulator is passed", () => {
			assert.isTrue(devicesService.isiOSSimulator(<any>iOSSimulator));
		});

		it("returns true when iOS simulator is passed, assert case insensitivity", () => {
			assert.isTrue(devicesService.isiOSSimulator(<any>{ deviceInfo: { platform: "iOs" }, isEmulator: true }));
			assert.isTrue(devicesService.isiOSSimulator(<any>{ deviceInfo: { platform: "IOS" }, isEmulator: true }));
		});

		it("returns false when iOS device is passed", () => {
			assert.isFalse(devicesService.isiOSSimulator(<any>iOSDevice));
		});

		it("returns false when Androd device or Android Emulator is passed", () => {
			assert.isFalse(devicesService.isiOSSimulator(<any>androidDevice));
			assert.isFalse(devicesService.isiOSSimulator(<any>{ deviceInfo: { platform: "android" }, isEmulator: true }));
		});

		it("returns false when device with invalid platform is passed", () => {
			assert.isFalse(devicesService.isiOSSimulator(<any>{ deviceInfo: { platform: "invalid platform" } }));
		});
	});

	describe("getDeviceByDeviceOption", () => {
		it("returns undefined when devicesService is not initialized", () => {
			assert.deepEqual(devicesService.getDeviceByDeviceOption(), undefined);
		});

		it("returns undefined when devicesService is initialized with platform only", async () => {
			await devicesService.initialize({ platform: "android" });
			assert.deepEqual(devicesService.getDeviceByDeviceOption(), undefined);
		});

		it("returns undefined when devicesService is initialized with skipInferPlatform only", async () => {
			await devicesService.initialize({ skipInferPlatform: true });
			assert.deepEqual(devicesService.getDeviceByDeviceOption(), undefined);
		});

		it("returns deviceIdentifier when devicesService is initialized with deviceId only", async () => {
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			await devicesService.initialize({ deviceId: androidDevice.deviceInfo.identifier });
			assert.deepEqual(devicesService.getDeviceByDeviceOption(), androidDevice);
		});

		it("returns deviceIdentifier when devicesService is initialized with deviceId (passed as number)", async () => {
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			await devicesService.initialize({ deviceId: "1" });
			assert.deepEqual(devicesService.getDeviceByDeviceOption(), androidDevice);
		});

		it("returns deviceIdentifier when devicesService is initialized with deviceId and platform", async () => {
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			await devicesService.initialize({ deviceId: androidDevice.deviceInfo.identifier, platform: "android" });
			assert.deepEqual(devicesService.getDeviceByDeviceOption(), androidDevice);
		});

		it("returns deviceIdentifier when devicesService is initialized with deviceId (passed as number) and platform", async () => {
			androidDeviceDiscovery.emit("deviceFound", androidDevice);
			await devicesService.initialize({ deviceId: "1", platform: "android" });
			assert.deepEqual(devicesService.getDeviceByDeviceOption(), androidDevice);
		});
	});

	describe("isCompanionAppInstalledOnAllDevices", () => {
		let $companionAppsService: ICompanionAppsService;
		let deviceIdentifiers = [iOSDevice.deviceInfo.identifier, androidDevice.deviceInfo.identifier];

		beforeEach(() => {
			$companionAppsService = testInjector.resolve("companionAppsService");
			$companionAppsService.getCompanionAppIdentifier = (framework: string, platform: string): string => "companion-app";

			devicesService.getDeviceByIdentifier = (identifier: string) => {
				return <any>(identifier === androidDevice.deviceInfo.identifier ? androidDevice : iOSDevice);
			};
		});

		it("should return correct result for all of the devices passed as argument.", async () => {
			let expectedResult = [true, true];
			mockIsAppInstalled([iOSDevice, androidDevice], expectedResult);
			let isAppInstalledOnDevices = await Promise.all(devicesService.isCompanionAppInstalledOnDevices(deviceIdentifiers, constants.TARGET_FRAMEWORK_IDENTIFIERS.Cordova));
			let result = _.map(isAppInstalledOnDevices, (appInstalledInfo: IAppInstalledInfo) => appInstalledInfo.isInstalled);

			assert.deepEqual(result.length, deviceIdentifiers.length);
		});

		it("should return correct result when all of the devices have the companion app installed.", async () => {
			let expectedResult = [true, true];
			mockIsAppInstalled([iOSDevice, androidDevice], expectedResult);

			let isAppInstalledOnDevices = await Promise.all(devicesService.isCompanionAppInstalledOnDevices(deviceIdentifiers, constants.TARGET_FRAMEWORK_IDENTIFIERS.Cordova));
			let result = _.map(isAppInstalledOnDevices, (appInstalledInfo: IAppInstalledInfo) => appInstalledInfo.isInstalled);

			assert.deepEqual(result, expectedResult);
		});

		it("should return correct result when some of the devices have the companion app installed.", async () => {
			let expectedResult = [true, false];
			mockIsAppInstalled([iOSDevice, androidDevice], expectedResult);

			let isAppInstalledOnDevices = await Promise.all(devicesService.isCompanionAppInstalledOnDevices(deviceIdentifiers, constants.TARGET_FRAMEWORK_IDENTIFIERS.Cordova));
			let result = _.map(isAppInstalledOnDevices, (appInstalledInfo: IAppInstalledInfo) => appInstalledInfo.isInstalled);

			assert.deepEqual(result, expectedResult);
		});

		it("should return correct result when none of the devices have the companion app installed.", async () => {
			let expectedResult = [false, false];
			mockIsAppInstalled([iOSDevice, androidDevice], expectedResult);

			let isAppInstalledOnDevices = await Promise.all(devicesService.isCompanionAppInstalledOnDevices(deviceIdentifiers, constants.TARGET_FRAMEWORK_IDENTIFIERS.Cordova));
			let result = _.map(isAppInstalledOnDevices, (appInstalledInfo: IAppInstalledInfo) => appInstalledInfo.isInstalled);

			assert.deepEqual(result, expectedResult);
		});
	});

	describe("startDeviceDetectionInterval", () => {
		let setIntervalsCalledCount: number;

		beforeEach(() => {
			setIntervalsCalledCount = 0;
			mockSetInterval();
		});

		afterEach(async () => {
			resetDefaultSetInterval();
		});

		it("should start device detection interval.", async () => {
			let hasStartedDeviceDetectionInterval = false;

			mockSetInterval(() => {
				hasStartedDeviceDetectionInterval = true;
			});

			await devicesService.startDeviceDetectionInterval();

			assert.isTrue(hasStartedDeviceDetectionInterval);
		});

		it("should not start device detection interval if there is one running.", async () => {

			global.setInterval = (callback: (...args: any[]) => void, ms: number, ...args: any[]): NodeJS.Timer => {

				const execution = async () => {
					await callback();
				};

				process.nextTick(execution);

				return {
					ref: () => { /* no implementation required */ },
					unref: () => {
						setIntervalsCalledCount++;
						return intervalId++;
					}
				};
			};

			await devicesService.startDeviceDetectionInterval();
			await devicesService.startDeviceDetectionInterval();
			await devicesService.startDeviceDetectionInterval();

			assert.deepEqual(setIntervalsCalledCount, 1);
		});

		describe("ios devices check", () => {
			let $iOSDeviceDiscovery: Mobile.IDeviceDiscovery;

			beforeEach(() => {
				$iOSDeviceDiscovery = testInjector.resolve("iOSDeviceDiscovery");
			});

			it("should check for ios devices.", async () => {
				let hasCheckedForIosDevices = false;

				$iOSDeviceDiscovery.startLookingForDevices = async (): Promise<void> => {
					hasCheckedForIosDevices = true;
				};

				await devicesService.startDeviceDetectionInterval();

				assert.isTrue(hasCheckedForIosDevices);
			});

			it("should not throw if ios device check fails throws an exception.", async () => {
				$iOSDeviceDiscovery.checkForDevices = throwErrorFunction;

				await assert.isFulfilled(devicesService.startDeviceDetectionInterval());
			});
		});

		describe("android devices check", () => {
			let $androidDeviceDiscovery: Mobile.IAndroidDeviceDiscovery;

			beforeEach(() => {
				$androidDeviceDiscovery = testInjector.resolve("androidDeviceDiscovery");
			});

			it("should check for android devices.", async () => {
				let hasCheckedForAndroidDevices = false;

				$androidDeviceDiscovery.startLookingForDevices = async (): Promise<void> => {
					hasCheckedForAndroidDevices = true;
				};

				await devicesService.startDeviceDetectionInterval();

				assert.isTrue(hasCheckedForAndroidDevices);
			});

			it("should not throw if android device check fails throws an exception.", async () => {
				$androidDeviceDiscovery.startLookingForDevices = throwErrorFunction;

				await assert.isFulfilled(devicesService.startDeviceDetectionInterval());
			});
		});

		describe("ios simulator check", () => {
			let $iOSSimulatorDiscovery: Mobile.IDeviceDiscovery;
			let $hostInfo: IHostInfo;
			let hasCheckedForIosSimulator: boolean;

			beforeEach(() => {
				$iOSSimulatorDiscovery = testInjector.resolve("iOSSimulatorDiscovery");
				$iOSSimulatorDiscovery.checkForDevices = async (): Promise<void> => {
					hasCheckedForIosSimulator = true;
				};

				$hostInfo = testInjector.resolve("hostInfo");
				$hostInfo.isDarwin = true;
				hasCheckedForIosSimulator = false;
			});

			it("should check for ios simulator if the host is Darwin.", async () => {
				await devicesService.startDeviceDetectionInterval();

				assert.isTrue(hasCheckedForIosSimulator);
			});

			it("should not check for ios simulator if the host is not Darwin.", async () => {
				$hostInfo.isDarwin = false;

				await devicesService.startDeviceDetectionInterval();

				assert.isFalse(hasCheckedForIosSimulator);
			});

			it("should not throw if ios simulator check fails throws an exception.", async () => {
				$iOSSimulatorDiscovery.checkForDevices = throwErrorFunction;

				await assert.isFulfilled(devicesService.startDeviceDetectionInterval());
			});
		});

		// describe("check for application updates", () => {
		// 	let $iOSDeviceDiscovery: Mobile.IDeviceDiscovery;
		// 	let $androidDeviceDiscovery: Mobile.IAndroidDeviceDiscovery;
		// 	let hasCheckedForAndroidAppUpdates: boolean;
		// 	let hasCheckedForIosAppUpdates: boolean;

		// 	beforeEach(() => {
		// 		hasCheckedForAndroidAppUpdates = false;
		// 		hasCheckedForIosAppUpdates = false;
		// 		$iOSDeviceDiscovery = testInjector.resolve("iOSDeviceDiscovery");
		// 		$androidDeviceDiscovery = testInjector.resolve("androidDeviceDiscovery");

		// 		androidDevice.applicationManager.checkForApplicationUpdates = async (): Promise<void> => {
		// 			hasCheckedForAndroidAppUpdates = true;
		// 		};

		// 		iOSDevice.applicationManager.checkForApplicationUpdates = async (): Promise<void> => {
		// 			hasCheckedForIosAppUpdates = true;
		// 		};

		// 		$androidDeviceDiscovery.emit("deviceFound", androidDevice);
		// 		$iOSDeviceDiscovery.emit("deviceFound", iOSDevice);
		// 	});

		// 	it("should check for application updates for all connected devices.", async () => {
		// 		await devicesService.startDeviceDetectionInterval();

		// 		assert.isTrue(hasCheckedForAndroidAppUpdates);
		// 		assert.isTrue(hasCheckedForIosAppUpdates);
		// 	});

		// 	it("should check for application updates if the check on one device throws an exception.", async () => {
		// 		iOSDevice.applicationManager.checkForApplicationUpdates = throwErrorFunction;

		// 		await devicesService.startDeviceDetectionInterval();

		// 		assert.isTrue(hasCheckedForAndroidAppUpdates);
		// 	});

		// 	it("should check for application updates only on devices with status Connected", async () => {
		// 		androidDevice.deviceInfo.status = constants.UNREACHABLE_STATUS;
		// 		await devicesService.startDeviceDetectionInterval();

		// 		assert.isFalse(hasCheckedForAndroidAppUpdates);
		// 		assert.isTrue(hasCheckedForIosAppUpdates);
		// 	});

		// 	it("should not throw if all checks for application updates on all devices throw exceptions.", () => {
		// 		iOSDevice.applicationManager.checkForApplicationUpdates = throwErrorFunction;
		// 		androidDevice.applicationManager.checkForApplicationUpdates = throwErrorFunction;

		// 		let callback = () => {
		// 			devicesService.startDeviceDetectionInterval.call(devicesService);
		// 		};

		// 		assert.doesNotThrow(callback);
		// 	});
		// });
	});

	describe("detectCurrentlyAttachedDevices", () => {
		let $androidDeviceDiscovery: Mobile.IAndroidDeviceDiscovery;
		let $iOSDeviceDiscovery: Mobile.IDeviceDiscovery;
		let $iOSSimulatorDiscovery: Mobile.IDeviceDiscovery;
		let $hostInfo: IHostInfo;

		beforeEach(() => {
			$hostInfo = testInjector.resolve("hostInfo");
			$androidDeviceDiscovery = testInjector.resolve("androidDeviceDiscovery");
			$iOSDeviceDiscovery = testInjector.resolve("iOSDeviceDiscovery");
			$iOSSimulatorDiscovery = testInjector.resolve("iOSSimulatorDiscovery");
		});

		it("should start looking for android devices.", async () => {
			let hasStartedLookingForAndroidDevices = false;

			$androidDeviceDiscovery.startLookingForDevices = async (): Promise<void> => {
				hasStartedLookingForAndroidDevices = true;
			};

			await devicesService.detectCurrentlyAttachedDevices();

			assert.isTrue(hasStartedLookingForAndroidDevices);
		});

		it("should start looking for ios devices.", async () => {
			let hasStartedLookingForIosDevices = false;

			$iOSDeviceDiscovery.startLookingForDevices = async (): Promise<void> => {
				hasStartedLookingForIosDevices = true;
			};

			await devicesService.detectCurrentlyAttachedDevices();

			assert.isTrue(hasStartedLookingForIosDevices);
		});

		it("should start looking for ios simulator if the host is Darwin.", async () => {
			let hasStartedLookingForIosSimulator = false;
			$hostInfo.isDarwin = true;
			$iOSSimulatorDiscovery.startLookingForDevices = async (): Promise<void> => {
				hasStartedLookingForIosSimulator = true;
			};

			await devicesService.detectCurrentlyAttachedDevices();

			assert.isTrue(hasStartedLookingForIosSimulator);
		});

		it("should not start looking for ios simulator if the host is not Darwin.", async () => {
			let hasStartedLookingForIosSimulator = false;
			$hostInfo.isDarwin = false;
			$iOSSimulatorDiscovery.startLookingForDevices = async (): Promise<void> => {
				hasStartedLookingForIosSimulator = true;
			};

			await devicesService.detectCurrentlyAttachedDevices();

			assert.isFalse(hasStartedLookingForIosSimulator);
		});

		const assertNotThrowing = async (deviceDiscoveries: { deviceDiscoveriesThatWork: Mobile.IDeviceDiscovery[], deviceDiscoveriesThatThrow: Mobile.IDeviceDiscovery[] }) => {
			$hostInfo.isDarwin = true;

			const workingDeviceDiscoveriesCalled: boolean[] = [];

			_.each(deviceDiscoveries.deviceDiscoveriesThatWork, (deviceDiscovery) => {
				deviceDiscovery.startLookingForDevices = async (): Promise<void> => {
					workingDeviceDiscoveriesCalled.push(true);
				};
		});

			_.each(deviceDiscoveries.deviceDiscoveriesThatThrow, (deviceDiscovery) => {
				deviceDiscovery.startLookingForDevices = throwErrorFunction;
	});

			await devicesService.detectCurrentlyAttachedDevices();

			assert.deepEqual(workingDeviceDiscoveriesCalled.length, deviceDiscoveries.deviceDiscoveriesThatWork.length,
				"We should have called startLookingForDevices for each of the device discoveries that work.");
		};

		it("should not throw if all device discovery services throw exceptions.", async () => {
			const testData: any = { deviceDiscoveriesThatWork: [], deviceDiscoveriesThatThrow: [$iOSDeviceDiscovery, $androidDeviceDiscovery, $iOSSimulatorDiscovery] };
			await assertNotThrowing(testData);
		});

		it("should not throw if iOS device discovery throws an exception and should detect android devices and iOS Simulator.", async () => {
			const testData: any = { deviceDiscoveriesThatWork: [$iOSDeviceDiscovery], deviceDiscoveriesThatThrow: [$androidDeviceDiscovery, $iOSSimulatorDiscovery] };
			await assertNotThrowing(testData);
		});

		it("should not throw if Android device discovery throws an exception and should detect iOS devices and iOS Simulator.", async () => {
			const testData: any = { deviceDiscoveriesThatWork: [$androidDeviceDiscovery], deviceDiscoveriesThatThrow: [$iOSDeviceDiscovery, $iOSSimulatorDiscovery] };
			await assertNotThrowing(testData);
		});

		it("should not throw if iOS Simulator device discovery throws an exception and should detect iOS devices and Android devices.", async () => {
			const testData: any = { deviceDiscoveriesThatWork: [$iOSSimulatorDiscovery], deviceDiscoveriesThatThrow: [$iOSDeviceDiscovery, $androidDeviceDiscovery] };
			await assertNotThrowing(testData);
		});
	});

	it("should call mapAbstractToTcpPort of android process service with the same parameters.", async () => {
		let expectedDeviceIdentifier = "123456789";
		let expectedAppIdentifier = "com.telerik.myapp";
		let expectedFramework = constants.TARGET_FRAMEWORK_IDENTIFIERS.Cordova;
		let actualDeviceIdentifier: string;
		let actualAppIdentifier: string;
		let actualFramework: string;
		let $androidProcessService: Mobile.IAndroidProcessService = testInjector.resolve("androidProcessService");
		$androidProcessService.mapAbstractToTcpPort = async (deviceIdentifier: string, appIdentifier: string, framework: string): Promise<string> => {
			actualDeviceIdentifier = deviceIdentifier;
			actualAppIdentifier = appIdentifier;
			actualFramework = framework;
			return "";
		};

		await devicesService.mapAbstractToTcpPort(expectedDeviceIdentifier, expectedAppIdentifier, expectedFramework);

		assert.deepEqual(actualDeviceIdentifier, expectedDeviceIdentifier);
		assert.deepEqual(actualAppIdentifier, expectedAppIdentifier);
		assert.deepEqual(actualFramework, expectedFramework);
	});

	it("should get debuggable apps correctly for multiple devices.", async () => {
		let $iOSDeviceDiscovery: Mobile.IDeviceDiscovery = testInjector.resolve("iOSDeviceDiscovery");
		let $androidDeviceDiscovery: Mobile.IAndroidDeviceDiscovery = testInjector.resolve("androidDeviceDiscovery");

		$androidDeviceDiscovery.emit("deviceFound", androidDevice);
		$iOSDeviceDiscovery.emit("deviceFound", iOSDevice);

		let androidDebuggableApps = [{
			appIdentifier: "com.telerik.myapp",
			deviceIdentifier: androidDevice.deviceInfo.identifier,
			framework: constants.TARGET_FRAMEWORK_IDENTIFIERS.Cordova
		}, {
			appIdentifier: "com.telerik.myapp1",
			deviceIdentifier: androidDevice.deviceInfo.identifier,
			framework: constants.TARGET_FRAMEWORK_IDENTIFIERS.NativeScript
		}];

		let iosDebuggableApps = [{
			appIdentifier: "com.telerik.myapp2",
			deviceIdentifier: iOSDevice.deviceInfo.identifier,
			framework: constants.TARGET_FRAMEWORK_IDENTIFIERS.Cordova
		}, {
			appIdentifier: "com.telerik.myapp3",
			deviceIdentifier: iOSDevice.deviceInfo.identifier,
			framework: constants.TARGET_FRAMEWORK_IDENTIFIERS.NativeScript
		}];

		androidDevice.applicationManager.getDebuggableApps = async (): Promise<Mobile.IDeviceApplicationInformation[]> => {
			return androidDebuggableApps;
		};

		iOSDevice.applicationManager.getDebuggableApps = async (): Promise<Mobile.IDeviceApplicationInformation[]> => {
			return iosDebuggableApps;
		};

		const futures = devicesService.getDebuggableApps([androidDevice.deviceInfo.identifier, iOSDevice.deviceInfo.identifier]);
		const debuggableAppsResult = await Promise.all(futures);
		const debuggableApps = _.flatten<Mobile.IDeviceApplicationInformation>(debuggableAppsResult);

		assert.deepEqual(debuggableApps, _.concat(androidDebuggableApps, iosDebuggableApps));
	});

	describe("getDebuggableViews", () => {
		let $androidDeviceDiscovery: Mobile.IAndroidDeviceDiscovery;
		let debuggableViews: Mobile.IDebugWebViewInfo[] = [{
			description: "descrition",
			webSocketDebuggerUrl: "debugurl",
			url: "url",
			type: "type",
			title: "title",
			id: "id1",
			devtoolsFrontendUrl: "frontenturl"
		}, {
			description: "descrition1",
			webSocketDebuggerUrl: "debugurl1",
			url: "url1",
			type: "type1",
			title: "title1",
			id: "id2",
			devtoolsFrontendUrl: "frontenturl1"
		}];

		beforeEach(() => {
			$androidDeviceDiscovery = testInjector.resolve("androidDeviceDiscovery");

			$androidDeviceDiscovery.emit("deviceFound", androidDevice);
		});

		it("should get the correct debuggable views.", async () => {
			androidDevice.applicationManager.getDebuggableAppViews = async (appIdentifiers: string[]): Promise<IDictionary<Mobile.IDebugWebViewInfo[]>> => {
				let result: any = {};
				result[appIdentifiers[0]] = debuggableViews;
				return result;
			};

			let actualDebuggableViews = await devicesService.getDebuggableViews(androidDevice.deviceInfo.identifier, "com.telerik.myapp");

			assert.deepEqual(actualDebuggableViews, debuggableViews);
		});

		it("should return undefined if debuggable views are found for otheer app but not for the specified.", async () => {
			androidDevice.applicationManager.getDebuggableAppViews = async (appIdentifiers: string[]): Promise<IDictionary<Mobile.IDebugWebViewInfo[]>> => {
				let result: any = {};
				result["com.telerik.otherApp"] = debuggableViews;
				return result;
			};

			let actualDebuggableViews = await devicesService.getDebuggableViews(androidDevice.deviceInfo.identifier, "com.telerik.myapp");

			assert.deepEqual(actualDebuggableViews, undefined);
		});
	});
});
