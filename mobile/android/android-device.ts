///<reference path="../../../.d.ts"/>
"use strict"
import MobileHelper = require("./../mobile-helper");
import util = require("util");
import Future = require("fibers/future");
import path = require("path");
import temp = require("temp");
import byline = require("byline");
import helpers = require("../../helpers");
import os = require("os");
import hostInfo = require("../../host-info");

interface IAndroidDeviceDetails {
	model: string;
	name: string
	release: string;
	brand: string;
}

export class AndroidDevice implements Mobile.IDevice {
	private static REFRESH_WEB_VIEW_INTENT_NAME = "com.telerik.RefreshWebView";
	private static CHANGE_LIVESYNC_URL_INTENT_NAME = "com.telerik.ChangeLiveSyncUrl";
	private static LIVESYNC_BROADCAST_NAME = "com.telerik.LiveSync";

	private static DEVICE_TMP_DIR = "/data/local/tmp";
	private static ION_VER_NEW_SYNC_PROTOCOL = "2.5";
	private static SYNC_ROOT = "12590FAA-5EDD-4B12-856D-F52A0A1599F2";
	private static COMMANDS_FILE = "telerik.livesync.commands";

	private model: string;
	private name: string;
	private version: string;
	private vendor: string;
	private _installedApplications: string[];

	constructor(private identifier: string, private adb: string,
		private $logger: ILogger,
		private $fs: IFileSystem,
		private $childProcess: IChildProcess,
		private $errors: IErrors,
		private $propertiesParser: IPropertiesParser,
		private $staticConfig: IStaticConfig) {
		var details: IAndroidDeviceDetails = this.getDeviceDetails().wait();
		this.model = details.model;
		this.name = details.name;
		this.version = details.release;
		this.vendor = details.brand;
	}

	private getDeviceDetails(): IFuture<IAndroidDeviceDetails> {
		return (() => {
			var requestDeviceDetailsCommand = this.composeCommand("shell cat /system/build.prop");
			var details: string = this.$childProcess.exec(requestDeviceDetailsCommand).wait();

			var parsedDetails: any = {};
			details.split(/\r?\n|\r/).forEach((value) => {
				//sample line is "ro.build.version.release=4.4"
				var match = /(?:ro\.build\.version|ro\.product)\.(.+)=(.+)/.exec(value)
				if (match) {
					parsedDetails[match[1]] = match[2];
				}
			});

			return parsedDetails;
		}).future<IAndroidDeviceDetails>()();
	}

	public getPlatform(): string {
		return MobileHelper.DevicePlatforms[MobileHelper.DevicePlatforms.Android];
	}

	public getIdentifier(): string {
		return this.identifier;
	}

	public getDisplayName(): string {
		return this.name;
	}

	public getModel(): string {
		return this.model;
	}

	public getVersion(): string {
		return this.version;
	}

	public getVendor(): string {
		return this.vendor;
	}

	public getInstalledApplications(): IFuture<string[]> {
		return (() => {
			if (!this._installedApplications) {
				var listPackagesCommand = this.composeCommand("shell pm list packages")
				var result = this.$childProcess.exec(listPackagesCommand).wait();
				this._installedApplications = _.map(result.split(os.EOL), (packageString: string) => {
					var match = packageString.match(/package:(.+)/);
					return match ? match[1] : null;
				}).filter(parsedPackage => parsedPackage != null);
			}

			return this._installedApplications
		}).future<string[]>()();
	}

	private composeCommand(...args: string[]) {
		var command = util.format.apply(null, args);
		var result = util.format("\"%s\" -s %s", this.adb, this.identifier);
		if (command && !command.isEmpty()) {
			result += util.format(" %s", command);
		}

		return result;
	}

	private startPackageOnDevice(packageName: string): IFuture<void> {
		return (() => {
			var startPackageCommand = this.composeCommand("shell am start -a android.intent.action.MAIN -n %s/%s", packageName, this.$staticConfig.START_PACKAGE_ACTIVITY_NAME);
			var result = this.$childProcess.exec(startPackageCommand).wait();
			return result[0];
		}).future<void>()();
	}

	public deploy(packageFile: string, packageName: string): IFuture<void> {
		return (() => {
			var uninstallCommand = this.composeCommand("shell pm uninstall \"%s\"", packageName)
			this.$childProcess.exec(uninstallCommand).wait();

			var installCommand = this.composeCommand("install -r \"%s\"", packageFile);
			this.$childProcess.exec(installCommand).wait();

			this.startPackageOnDevice(packageName).wait();
			this.$logger.info("Successfully deployed on device with identifier '%s'", this.getIdentifier());
		}).future<void>()();
	}

	private _tmpRoot: IStringDictionary = Object.create(null);
	private prepareTmpDir(appIdentifier: Mobile.IAppIdentifier): IFuture<string> {
		return (() => {
			if (!this._tmpRoot[appIdentifier.appIdentifier]) {
				var tmpRoot = this.buildDevicePath(AndroidDevice.DEVICE_TMP_DIR, AndroidDevice.SYNC_ROOT, appIdentifier.appIdentifier);
				var filesInTmp = this.buildDevicePath(tmpRoot, "*");

				var command = this.composeCommand('shell mkdir -p "%s"', tmpRoot);
				this.$childProcess.exec(command).wait();
				command = this.composeCommand('shell rm -rf "%s"', filesInTmp);
				this.$childProcess.exec(command).wait();
				this._tmpRoot[appIdentifier.appIdentifier] = tmpRoot;
			}
			return this._tmpRoot[appIdentifier.appIdentifier];
		}).future<string>()();
	}

	private pushFilesOnDevice(localToDevicePaths: Mobile.ILocalToDevicePathData[], appIdentifier: Mobile.IAppIdentifier): IFuture<void> {
		return (() => {
			// On Samsung Android 4.3 and Nexus KitKat & L devices, one cannot adb push to /data/data/appId/ directly
			// Instead, we push to /data/local/tmp, where we have the required permissions and them mv to the final destination
			var tmpRoot = this.prepareTmpDir(appIdentifier).wait();

			localToDevicePaths.forEach((localToDevicePathData) => {
				var tmpPath = this.buildDevicePath(tmpRoot, helpers.fromWindowsRelativePathToUnix(localToDevicePathData.getRelativeToProjectBasePath()));
				this.pushFileOnDevice(localToDevicePathData.getLocalPath(), tmpPath).wait();
			});

			// move the files from the tmp dir into their proper path.
			// Due to limitation of android toolset, we use a more involved shell script
			// the following line finds all files and subfolders in the tmp dir,
			// removes the corresponding entries in the data dir and then moves the /tmp files in their proper place on /data
			// we set IFS so that for will properly iterate over files with spaces in their names
			// we use for `ls`, because android toolbox lacks find
			var adbCommand = util.format('IFS=$\'\\n\'; for i in $(ls -a %s); do rm -rf %s/$i && mv %s/$i %s; done; unset IFS',
				tmpRoot, appIdentifier.deviceProjectPath, tmpRoot, appIdentifier.deviceProjectPath);
			this.$childProcess.execFile(this.adb, [
				"-s", this.identifier,
				"shell",
				adbCommand
			]).wait();
		}).future<void>()();
	}

	private pushFileOnDevice(localPath: string, devicePath: string): IFuture<void> {
		return (() => {
			var rmCommand = this.composeCommand('shell rm -r "%s"', devicePath);
			this.$childProcess.exec(rmCommand).wait();

			if (this.$fs.exists(localPath).wait()) {
				var isDirectory = this.$fs.getFsStats(localPath).wait().isDirectory();

				var mkdirCommand = this.composeCommand('shell mkdir -p "%s"', isDirectory ? devicePath : path.dirname(devicePath));
				this.$childProcess.exec(mkdirCommand).wait();

				var pushFileCommand = this.composeCommand('push "%s" "%s"', isDirectory ? path.join(localPath, ".") : localPath, devicePath);
				this.$childProcess.exec(pushFileCommand).wait();
			}
		}).future<void>()();
	}

	public sendBroadcastToDevice(action: string, extras: IStringDictionary = {}): IFuture<number> {
		return (() => {
			var broadcastCommand = this.composeCommand("shell am broadcast -a \"%s\"", action);

			Object.keys(extras).forEach((key) => {
				broadcastCommand += util.format(" -e \"%s\" \"%s\"", key, extras[key]);
			});

			var result = this.$childProcess.exec(broadcastCommand).wait();
			var match = result.match(/Broadcast completed: result=(\d+)/);
			if (match) {
				return +match[1];
			} else {
				this.$errors.fail("Unable to broadcast to android device:\n%s", result);
			}
		}).future<number>()();
	}

	private getLiveSyncUrl(projectType: number): string {
		var projectTypes = $injector.resolve("$projectTypes");
		switch (projectType) {
			case projectTypes.Cordova: return "icenium://";
			case projectTypes.NativeScript: return "nativescript://";
			default: throw new Error("Unsupported project type");
		}
	}

	public sync(localToDevicePaths: Mobile.ILocalToDevicePathData[], appIdentifier: Mobile.IAppIdentifier, projectType: number, options: Mobile.ISyncOptions = {}): IFuture<void> {
		return (() => {
			if (appIdentifier.isLiveSyncSupported(this).wait()) {
				var ionVer = this.getIonVersion(appIdentifier).wait();
				if (this.isNewProtocol(ionVer, AndroidDevice.ION_VER_NEW_SYNC_PROTOCOL)) {
					this.syncNewProtocol(localToDevicePaths, appIdentifier, projectType, options).wait();
				} else {
					this.syncOldProtocol(localToDevicePaths, appIdentifier, projectType, options).wait();
				}
				this.$logger.info("Successfully synced device with identifier '%s'", this.getIdentifier());
			} else {
				this.$errors.fail({formatStr: appIdentifier.getliveSyncNotSupportedError(this), suppressCommandHelp: true });
			}
		}).future<void>()();
	}

	private syncOldProtocol(localToDevicePaths: Mobile.ILocalToDevicePathData[], appIdentifier: Mobile.IAppIdentifier, projectType: number, options: Mobile.ISyncOptions = {}): IFuture<void> {
		return (() => {
			this.pushFilesOnDevice(localToDevicePaths, appIdentifier).wait();
			if (!options.skipRefresh) {
				var changeLiveSyncUrlExtras: IStringDictionary = {
					"liveSyncUrl": this.getLiveSyncUrl(projectType),
					"app-id": appIdentifier.appIdentifier
				};
				this.sendBroadcastToDevice(AndroidDevice.CHANGE_LIVESYNC_URL_INTENT_NAME, changeLiveSyncUrlExtras).wait();
				this.sendBroadcastToDevice(AndroidDevice.REFRESH_WEB_VIEW_INTENT_NAME, { "app-id": appIdentifier.appIdentifier }).wait();
			}
		}).future<void>()();
	}

	private getTempDir(): string {
		temp.track();
		return temp.mkdirSync("ab-");
	}

	private syncNewProtocol(localToDevicePaths: Mobile.ILocalToDevicePathData[], appIdentifier: Mobile.IAppIdentifier, projectType: number, options: Mobile.ISyncOptions = {}): IFuture<void> {
		return (() => {
			this.pushFilesOnDevice(localToDevicePaths, appIdentifier).wait();
			// create the commands file
			var hostTmpDir = this.getTempDir();
			var commandsFileHostPath = path.join(hostTmpDir, AndroidDevice.COMMANDS_FILE);
			var commandsFile = <WritableStream>this.$fs.createWriteStream(commandsFileHostPath);
			var fileWritten = this.$fs.futureFromEvent(commandsFile, 'finish');
			commandsFile.write("DeployProject " + this.getLiveSyncUrl(projectType) + '\r');
			commandsFile.write("ReloadStartView" + '\r');
			commandsFile.end();
			fileWritten.wait();
			// copy it to the device
			var commandsFileDevicePath = this.buildDevicePath(this.prepareTmpDir(appIdentifier).wait(), AndroidDevice.COMMANDS_FILE);
			this.pushFileOnDevice(commandsFileHostPath, commandsFileDevicePath).wait();
			// send the refresh notification
			this.sendBroadcastToDevice(AndroidDevice.LIVESYNC_BROADCAST_NAME, { "app-id": appIdentifier.appIdentifier }).wait();
		}).future<void>()();
	}

	private getIonVersion(appIdentifier: Mobile.IAppIdentifier): IFuture<string> {
		return (() => {
			var output = (<string>this.$childProcess.execFile(this.adb, [
				"-s", this.getIdentifier(),
				"shell", "dumpsys", "package", appIdentifier.appIdentifier
			]).wait());
			return this.$propertiesParser.parse(output)["versionName"];
		}).future<string>()();
	}

	private isNewProtocol(currentIonVersion: string, newProtocolversion: string): boolean {
		return helpers.versionCompare(currentIonVersion, newProtocolversion) >= 0;
	}

	private buildDevicePath(...args: string[]): string {
		return args.join("/");
	}

	openDeviceLogStream() {
		var adbLogcat = this.$childProcess.spawn(this.adb, ["-s", this.getIdentifier(), "logcat"]);
		var lineStream = byline(adbLogcat.stdout);

		adbLogcat.stderr.on("data", (data: NodeBuffer) => {
			this.$logger.trace("ADB logcat stderr: " + data.toString());
		});

		adbLogcat.on("close", (code: number) => {
			if (code !== 0) {
				this.$logger.trace("ADB process exited with code " + code.toString());
			}
		});

		lineStream.on('data', (line: NodeBuffer) => {
			var lineText = line.toString();
			var log = this.getConsoleLogFromLine(lineText);
			if (log) {
				if (log.tag) {
					this.$logger.out("%s: %s", log.tag, log.message);
				} else {
					this.$logger.out(log.message);
				}
			}
		});
	}

	private getConsoleLogFromLine(lineText: String): any {
		var acceptedTags = ["chromium", "Web Console"];

		//sample line is "I/Web Console(    4438): Received Event: deviceready at file:///storage/emulated/0/Icenium/com.telerik.TestApp/js/index.js:48"
		var match = lineText.match(/.\/(.+?)\(\s*(\d+?)\): (.*)/);
		if (match) {
			if (acceptedTags.indexOf(match[1]) !== -1) {
				return { tag: match[1], message: match[3] };
			}
		}
		else if (_.any(acceptedTags, (tag: string) => { return lineText.indexOf(tag) !== -1; })) {
			return { message: match[3] };
		}

		return null;
	}
}