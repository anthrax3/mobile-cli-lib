import * as path from "path";
import * as shelljs from "shelljs";

export class IOSSimulatorFileSystem implements Mobile.IDeviceFileSystem {
	constructor(private iosSim: any,
		private $fs: IFileSystem,
		private $logger: ILogger) { }

	public async listFiles(devicePath: string): Promise<void> {
		return this.iosSim.listFiles(devicePath);
	}

	public async getFile(deviceFilePath: string, appIdentifier: string, outputFilePath?: string): Promise<void> {
		if (outputFilePath) {
			shelljs.cp("-f", deviceFilePath, outputFilePath);
		}
	}

	public async putFile(localFilePath: string, deviceFilePath: string, appIdentifier: string): Promise<void> {
		shelljs.cp("-f", localFilePath, deviceFilePath);
	}

	public async deleteFile(deviceFilePath: string, appIdentifier: string): Promise<void> {
		shelljs.rm("-rf", deviceFilePath);
	}

	public async transferFiles(deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[]): Promise<void> {
		await Promise.all(
			_.map(localToDevicePaths, localToDevicePathData => this.transferFile(localToDevicePathData.getLocalPath(), localToDevicePathData.getDevicePath())
			));
	}

	public async transferDirectory(deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[], projectFilesPath: string): Promise<void> {
		let destinationPath = await deviceAppData.getDeviceProjectRootPath();
		this.$logger.trace(`Transferring from ${projectFilesPath} to ${destinationPath}`);
		let sourcePath = path.join(projectFilesPath, "*");
		return shelljs.cp("-Rf", sourcePath, destinationPath);
	}

	public async transferFile(localFilePath: string, deviceFilePath: string): Promise<void> {
		this.$logger.trace(`Transferring from ${localFilePath} to ${deviceFilePath}`);
		return this.$fs.executeActionIfExists(async () => {
			if (this.$fs.getFsStats(localFilePath).isDirectory()) {
				this.$fs.ensureDirectoryExists(deviceFilePath);
			} else {
				this.$fs.ensureDirectoryExists(path.dirname(deviceFilePath));
				shelljs.cp("-f", localFilePath, deviceFilePath);
			}
		});
	}
}
