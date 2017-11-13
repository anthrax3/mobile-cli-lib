import { CommonLoggerStub, ErrorsStub } from "../stubs";
import { MicroTemplateService } from "../../../services/micro-templating-service";
import { HelpService } from "../../../services/html-help-service";
import { assert } from "chai";
import { EOL } from "os";
import { Yok } from '../../../yok';

interface ITestData {
	input: string;
	expectedOutput: string;
}

const createTestInjector = (opts?: { isProjectTypeResult: boolean; isPlatformResult: boolean }): IInjector => {
	const injector = new Yok();
	injector.register("staticConfig", {});
	injector.register("errors", ErrorsStub);
	injector.register("options", { help: true });

	injector.register("logger", CommonLoggerStub);

	opts = opts || { isPlatformResult: true, isProjectTypeResult: true };

	injector.register("dynamicHelpProvider", {
		getLocalVariables: () => ({})
	});

	injector.register("dynamicHelpService", {
		isProjectType: (...args: string[]): boolean => opts.isProjectTypeResult,
		isPlatform: (...args: string[]): boolean => { return opts.isPlatformResult; },
		getLocalVariables: (): IDictionary<any> => {
			const localVariables: IDictionary<any> = {};
			localVariables["myLocalVar"] = opts.isProjectTypeResult;
			localVariables["isLinux"] = opts.isPlatformResult;
			localVariables["isWindows"] = opts.isPlatformResult;
			localVariables["isMacOS"] = opts.isPlatformResult;
			return localVariables;
		}
	});
	injector.register("microTemplateService", MicroTemplateService);
	injector.register("helpService", HelpService);
	injector.register("opener", {
		open(target: string, appname?: string): void {/* mock */ }
	});
	injector.register("commandsServiceProvider", {
		getDynamicCommands: (): Promise<string[]> => {
			return Promise.resolve(<string[]>[]);
		}
	});

	injector.registerCommand("foo", {});

	return injector;
};

describe("helpService", () => {
	describe("showCommandLineHelp", () => {
		const testData: ITestData[] = [
			{
				input: "bla <span>test</span> bla",
				expectedOutput: "bla test bla"
			},
			{
				input: 'bla <span>span 1</span> bla <span>span 2</span> end',
				expectedOutput: "bla span 1 bla span 2 end"
			},
			{
				input: 'bla <span style="color:red">test</span> bla',
				expectedOutput: "bla test bla"
			},
			{
				input: 'bla <span style="color:red;font-size:15px">test</span> bla',
				expectedOutput: "bla test bla"
			},
			{
				input: `bla
<span style="color:red;font-size:15px">
test
</span>bla`,
				expectedOutput: "blatestbla"
			},
			{
				input: `bla
<span style="color:red;font-size:15px">
span 1
</span>bla
<span style="color:red;font-size:15px">
span 2
</span>
end`,
				expectedOutput: "blaspan 1blaspan 2end"
			},
			{
				input: `some text on upper line
and another one
bla
<span style="color:red;font-size:15px">
span 1
</span>bla
<span style="color:red;font-size:15px">
span 2
</span>
end`,
				expectedOutput: `some text on upper line
and another one
blaspan 1blaspan 2end`
			},
			{
				input: `some text on upper line
and another one
bla
<span style="color:red;font-size:15px">
span 1
</span>bla
<span style="color:red;font-size:15px">
span 2
</span>
end
some text on next line
and another one`,
				expectedOutput: `some text on upper line
and another one
blaspan 1blaspan 2end
some text on next line
and another one`
			}
		];

		describe("does not print <span> tags in terminal", () => {
			for (const testIndex in testData) {
				it(`test case ${testIndex}`, async () => {
					const testCase = testData[testIndex];
					const injector = createTestInjector();
					injector.register("module", {
						command: () => "woot"
					});

					injector.register("fs", {
						enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
						readText: () => testCase.input
					});

					const helpService = injector.resolve<IHelpService>("helpService");
					await helpService.showCommandLineHelp("foo");
					const actualOutput = injector.resolve("logger").output.trim();
					assert.equal(actualOutput, testCase.expectedOutput);
				});
			}
		});

		it("does not print <br> tags in terminal", async () => {
			const injector = createTestInjector();
			injector.register("module", {
				command: () => "woot"
			});

			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				readText: () => `some text<br>more text</br></ br>and more<br/>and again<br />and final line`
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");
			const actualOutput = injector.resolve("logger").output.trim();
			const expectedOutput = `some text${EOL}more text${EOL}${EOL}and more${EOL}and again${EOL}and final line`;
			assert.equal(actualOutput, expectedOutput);
		});

		it("processes substitution points", async () => {
			const injector = createTestInjector();
			injector.register("module", {
				command: () => "woot"
			});

			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				readText: () => "bla <%= #{module.command} %> bla"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");
			assert.isTrue(injector.resolve("logger").output.indexOf("bla woot bla") >= 0);
		});

		it("process correctly if construction with dynamicCall returning false", async () => {
			const injector = createTestInjector();
			injector.register("module", {
				command: () => false
			});

			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				readText: () => "bla <% if (#{module.command}) { %> secondBla <% } %>"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");
			const output = injector.resolve("logger").output;
			assert.isTrue(output.indexOf("bla") >= 0);
			assert.isTrue(output.indexOf("secondBla") < 0);
		});

		it("process correctly if construction with dynamicCall returning true", async () => {
			const injector = createTestInjector();
			injector.register("module", {
				command: () => true
			});

			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				readText: () => "bla <% if (#{module.command}) { %>secondBla<% } %>"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");

			const output = injector.resolve("logger").output;
			assert.isTrue(output.indexOf("bla") >= 0);
			assert.isTrue(output.indexOf("secondBla") > 0);
			assert.isTrue(output.indexOf("bla secondBla") >= 0);
		});

		it("process correctly if construction returning false", async () => {
			const injector = createTestInjector();

			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				readText: () => "bla <% if (false) { %> secondBla <% } %>"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");

			const output = injector.resolve("logger").output;
			assert.isTrue(output.indexOf("bla") >= 0);
			assert.isTrue(output.indexOf("secondBla") < 0);
			assert.isTrue(output.indexOf("bla secondBla") < 0);
		});

		it("process correctly if construction returning true", async () => {
			const injector = createTestInjector();
			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				readText: () => "bla <% if (true) { %>secondBla<% } %>"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");

			const output = injector.resolve("logger").output;
			assert.isTrue(output.indexOf("bla") >= 0);
			assert.isTrue(output.indexOf("secondBla") > 0);
			assert.isTrue(output.indexOf("bla secondBla") >= 0);
		});

		it("process correctly is* platform variables when they are true", async () => {
			const injector = createTestInjector();
			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				readText: () => "bla <% if (isLinux) { %>isLinux<% } %> <% if(isWindows) { %>isWindows<%}%> <%if(isMacOS) {%>isMacOS<%}%>"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");
			const output = injector.resolve("logger").output;
			assert.isTrue(output.indexOf("bla isLinux isWindows isMacOS") >= 0);
		});

		it("process correctly is* platform variables when they are false", async () => {
			const injector = createTestInjector({ isProjectTypeResult: false, isPlatformResult: false });
			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				readText: () => "bla <% if (isLinux) { %>isLinux<% } %> <% if(isWindows) { %>isWindows<%}%> <%if(isMacOS) {%>isMacOS<%}%>"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");

			const output = injector.resolve("logger").output;
			assert.isTrue(output.indexOf("bla isLinux isWindows isMacOS") < 0);
			assert.isTrue(output.indexOf("isLinux") < 0);
			assert.isTrue(output.indexOf("isWindows") < 0);
			assert.isTrue(output.indexOf("isMacOS") < 0);
			assert.isTrue(output.indexOf("bla") >= 0);
		});

		it("process correctly multiple if statements with local variables (all are true)", async () => {
			const injector = createTestInjector();
			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				// all variables must be true
				readText: () => "bla <% if (isLinux) { %><% if(myLocalVar) {%>isLinux and myLocalVar <% } %><% } %>end"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");

			const output = injector.resolve("logger").output;
			assert.isTrue(output.indexOf("bla isLinux and myLocalVar end") >= 0);
		});

		it("process correctly multiple if statements with local variables (all are false)", async () => {
			const injector = createTestInjector({ isProjectTypeResult: false, isPlatformResult: false });
			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				// all variables must be false
				readText: () => "bla <% if (isLinux) { %><% if(myLocalVar) {%>isLinux and myLocalVar <% } %><% } %>end"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");

			const output = injector.resolve("logger").output;
			assert.isTrue(output.indexOf("bla isLinux and myLocalVar end") < 0);
			assert.isTrue(output.indexOf("isLinux") < 0);
			assert.isTrue(output.indexOf("myLocalVar") < 0);
			assert.isTrue(output.indexOf("bla end") >= 0);
		});

		it("process correctly multiple if statements with local variables (isProjectType is false, isPlatform is true)", async () => {
			const injector = createTestInjector({ isProjectTypeResult: false, isPlatformResult: true });
			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				readText: () => "bla <% if (isLinux) { %>isLinux <% if(myLocalVar) {%>myLocalVar <% } %><% } %>end"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");
			const output = injector.resolve("logger").output;
			assert.isTrue(output.indexOf("bla isLinux end") >= 0);
		});

		it("process correctly multiple if statements with dynamicCalls (all are true)", async () => {
			const injector = createTestInjector();
			injector.register("module", {
				command1: () => true,
				command2: () => true
			});
			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				readText: () => "bla <% if (#{module.command1}) { %>command1<% if(#{module.command2}) {%> and command2 <% } %><% } %>end"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");
			const output = injector.resolve("logger").output;
			assert.isTrue(output.indexOf("bla command1 and command2 end") >= 0);
		});

		it("process correctly multiple if statements with dynamicCalls (all are false)", async () => {
			const injector = createTestInjector();
			injector.register("module", {
				command1: () => false,
				command2: () => false
			});
			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				readText: () => "bla <% if (#{module.command1}) { %>command1<% if(#{module.command2}) {%> and command2 <% } %><% } %>end"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");
			const output = injector.resolve("logger").output;
			assert.isTrue(output.indexOf("bla command1 and command2 end") < 0);
			assert.isTrue(output.indexOf("command1") < 0);
			assert.isTrue(output.indexOf("command2") < 0);
			assert.isTrue(output.indexOf("bla end") >= 0);
		});

		it("process correctly multiple if statements with dynamicCalls (different result)", async () => {
			const injector = createTestInjector();
			injector.register("module", {
				command1: () => true,
				command2: () => false,
				command3: () => false
			});
			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				readText: () => "bla <% if (#{module.command1}) { %>command1 <% if(#{module.command2}) {%> and command2 <% if(#{module.command3}) { %>and command3 <% } %> <% } %><% } %>end"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");
			const output = injector.resolve("logger").output;
			assert.isTrue(output.indexOf("bla command1 end") >= 0);
			assert.isTrue(output.indexOf("command2") < 0);
			assert.isTrue(output.indexOf("command3") < 0);
		});

		it("process correctly multiple dynamicCalls", async () => {
			const injector = createTestInjector();
			injector.register("module", {
				command1: () => "command1",
				command2: () => "command2",
				command3: () => "command3"
			});
			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				readText: () => "bla <%= #{module.command1}%> <%= #{module.command2} %> <%= #{module.command3} %> end"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");
			const output = injector.resolve("logger").output;
			assert.isTrue(output.indexOf("bla command1 command2 command3 end") >= 0);
		});

		it("process correctly dynamicCalls with parameters", async () => {
			const injector = createTestInjector();
			injector.register("module", {
				command1: (...args: string[]) => args.join(" ")
			});
			injector.register("fs", {
				enumerateFilesInDirectorySync: (path: string) => ["foo.md"],
				readText: () => "--[foo]-- bla <%= #{module.command1(param1, param2)}%> end--[/]--"
			});

			const helpService = injector.resolve<IHelpService>("helpService");
			await helpService.showCommandLineHelp("foo");
			const output = injector.resolve("logger").output;
			assert.isTrue(output.indexOf("bla param1 param2 end") >= 0);
		});
	});
});
