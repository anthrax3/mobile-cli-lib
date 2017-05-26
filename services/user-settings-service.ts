import * as path from "path";

export class UserSettingsServiceBase implements IUserSettingsService {
	private userSettingsFilePath: string = null;
	protected userSettingsData: any = null;

	constructor(userSettingsFilePath: string,
		protected $fs: IFileSystem) {
		this.userSettingsFilePath = userSettingsFilePath;
	}

	public async getSettingValue<T>(settingName: string): Promise<T> {
		await this.loadUserSettingsFile();
		return this.userSettingsData ? this.userSettingsData[settingName] : null;
	}

	public async saveSetting<T>(key: string, value: T): Promise<void> {
		let settingObject: any = {};
		settingObject[key] = value;

		return this.saveSettings(settingObject);
	}

	public async removeSetting(key: string): Promise<void> {
		await this.loadUserSettingsFile();

		delete this.userSettingsData[key];
		await this.saveSettings();
	}

	public async saveSettings(data?: any): Promise<void> {
		await this.loadUserSettingsFile();
		this.userSettingsData = this.userSettingsData || {};

		_(data)
			.keys()
			.each(propertyName => {
				this.userSettingsData[propertyName] = data[propertyName];
			});

		this.$fs.writeJson(this.userSettingsFilePath, this.userSettingsData);
	}

	// TODO: Remove Promise, reason: writeFile - blocked as other implementation of the interface has async operation.
	public async loadUserSettingsFile(): Promise<void> {
		if (!this.userSettingsData) {
			if (!this.$fs.exists(this.userSettingsFilePath)) {
				let unexistingDirs = this.getUnexistingDirectories(this.userSettingsFilePath);

				this.$fs.writeFile(this.userSettingsFilePath, null);

				// when running under 'sudo' we create the <path to home dir>/.local/share/.nativescript-cli dir with root as owner
				// and other Applications cannot access this directory anymore. (bower/heroku/etc)
				if (process.env.SUDO_USER) {
					for (let dir of unexistingDirs) {
						await this.$fs.setCurrentUserAsOwner(dir, process.env.SUDO_USER);
					}
				}
			}

			this.userSettingsData = this.$fs.readJson(this.userSettingsFilePath);
		}
	}

	private getUnexistingDirectories(filePath: string): Array<string> {
		let unexistingDirs: Array<string> = [];
		let currentDir = path.join(filePath, "..");
		while (true) {
			// this directory won't be created.
			if (this.$fs.exists(currentDir)) {
				break;
			}
			unexistingDirs.push(currentDir);
			currentDir = path.join(currentDir, "..");
		}
		return unexistingDirs;
	}
}
