import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder, request, requestUrl } from 'obsidian';
import { createBasicAuthHeader } from 'utils';
import Multipart from 'multi-part-lite';

interface Flow2PluginSettings {
	apiBaseUrl: string;
	authUsername: string;
	authPassword: string;
}

const DEFAULT_SETTINGS: Flow2PluginSettings = {
	apiBaseUrl: 'https://flowtwo.io',
	authUsername: '',
	authPassword: '',
}

export default class Flow2Plugin extends Plugin {
	settings: Flow2PluginSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('paper-plane', 'Publish to Flow2', async () => {
			const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
			
			if (activeLeaf && activeLeaf.file) {
				const postId = await this.publishPost(activeLeaf);

				if (!postId) {
					return
				}

				await this.uploadMedia(activeLeaf.file, postId);
			}
		});

		this.addSettingTab(new Flow2SettingTab(this.app, this));
	}

	onunload() {}

	async publishPost(activeLeaf: MarkdownView): Promise<string|null> {
		try {

			const content = activeLeaf.editor.getValue();

			const newPostResponse = await requestUrl({
				url: `${this.settings.apiBaseUrl}/admin/api/post`,
				method: 'POST',
				headers: {
					'Authorization': createBasicAuthHeader(this.settings.authUsername, this.settings.authPassword),
					'Content-Type': 'text/plain',
				},
				body: content
			});

			const postId = newPostResponse.json?.id

			if (!postId) {
				throw new Error('No post ID returned: ' + newPostResponse.json)
			}

			console.log('Post created successfully with ID: %s', postId);
			new Notice('Post created successfully with ID: ' + postId);

			this.app.fileManager.processFrontMatter(activeLeaf.file!!, (frontmatter) => {
				frontmatter['id'] = postId;
			});

			return postId

		} catch (error) {
			console.error('Failed to publish post', error);
			new Notice('Failed to publish post');
			return null
		}
	}

	async uploadMedia(postFile: TFile, postId: string) {

		try {
			const mediaFolder = postFile
								.parent
								?.children
								.find((abstractFile: TAbstractFile) => {
									console.log(abstractFile.name);
									return abstractFile.name === 'media';
								}) as TFolder | null | undefined
			
			if (!mediaFolder) {
				console.log('couldnt file media folder');
				// Nothing to upload
				return;
			}

			const form = new Multipart();
			let fileCount = 0;
			for (const mediaFile of mediaFolder.children) {
				if (!(mediaFile instanceof TFile)) {
					continue;
				}
				const fileString = await this.app.vault.read(mediaFile);
				form.append("files", Buffer.from(fileString), { filename: mediaFile.name });
				fileCount++;
			}

			const body = (await form.buffer()).toString();

			const response = await requestUrl({
				url: `${this.settings.apiBaseUrl}/admin/post/${postId}/media?includesBanner=true`,
				method: 'POST',
				headers: {
					'Authorization': createBasicAuthHeader(this.settings.authUsername, this.settings.authPassword),
				},
				contentType: `multipart/form-data; boundary=${form.getBoundary()}`,
				body: body,
			});

			if (response.status < 300) {
				new Notice(fileCount + " media files uploaded successfully");
			} else {
				throw Error('Error response: ' + response.text);
			}

		} catch (error) {
			console.error('Failed to upload media files', error);
			new Notice('Failed to upload media files');
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class Flow2SettingTab extends PluginSettingTab {
	plugin: Flow2Plugin;

	constructor(app: App, plugin: Flow2Plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl('h2', {text: 'Flow2 Plugin Settings'});

		new Setting(containerEl)
			.setName('API Base URL')
			.setDesc('Base URL for the Flow2 API')
			.addText(text => text
				.setPlaceholder('Enter the API base URL')
				.setValue(this.plugin.settings.apiBaseUrl)
				.onChange(async (value) => {
					this.plugin.settings.apiBaseUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Authentication - Username')
			.setDesc('Username for API authentication')
			.addText(text => text
				.setPlaceholder('Username')
				.setValue(this.plugin.settings.authUsername)
				.onChange(async (value) => {
					this.plugin.settings.authUsername = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Authentication - Password')
			.setDesc('Password for API authentication')
			.addText(text => text
				.setPlaceholder('Password')
				.setValue(this.plugin.settings.authPassword)
				.onChange(async (value) => {
					this.plugin.settings.authPassword = value;
					await this.plugin.saveSettings();
				}));
	}
}