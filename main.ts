import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder } from 'obsidian';
import { createBasicAuthHeader, getMimeType } from 'utils';
import axios from 'axios';

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

        this.addRibbonIcon('waves', 'Publish to Flow2', async () => {
            await this.publishAndUploadMedia();
        });

        this.addCommand({
            id: 'publish-to-flow2',
            name: 'Publish to Flow2',
            callback: async () => {
                await this.publishAndUploadMedia();
            },
        });

        this.registerEvent(
        this.app.workspace.on('file-menu', (menu, file) => {
            menu
            .addItem((item) => {
                item
                    .setTitle('Publish to Flow2')
                    .setIcon('waves')
                    .onClick(async () => {
                        await this.publishAndUploadMedia();
                    });
            })
            .addItem((item) => {
                item
                    .setTitle('Pull From Flow2')
                    .setIcon('waves')
                    .onClick(async () => {
                        await this.searchAndPullFromFlow2();
                    });
            });
        })
        );
      
        this.registerEvent(
        this.app.workspace.on("editor-menu", (menu, editor, view) => {
            menu
            .addItem((item) => {
                item
                    .setTitle('Publish to Flow2')
                    .setIcon('waves')
                    .onClick(async () => {
                        await this.publishAndUploadMedia();
                    });
            })
            .addItem((item) => {
                item
                    .setTitle('Pull From Flow2')
                    .setIcon('waves')
                    .onClick(async () => {
                        await this.searchAndPullFromFlow2();
                    });
            });
        })
        );

        this.addSettingTab(new Flow2SettingTab(this.app, this));
    }

    onunload() {}


    async searchAndPullFromFlow2() {
        const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
            
        if (activeLeaf && activeLeaf.file) {
            const fileName = activeLeaf.file.basename
            const existingPostContent = await this.searchForPostByTitle(fileName);
            
            if (existingPostContent) {
                new Notice("Post found - pulling content")
                await activeLeaf.editor.setValue(existingPostContent)
                new Notice("File updated with Post content")
            } else {
                new Notice("No post found")
            }
        }
    }

    async searchForPostByTitle(fileName: string): Promise<string | null> {
        const response = await axios.get(`${this.settings.apiBaseUrl}/admin/api/post/search`, {
            params: {
                title: fileName
            },
            headers: {
                'Authorization': createBasicAuthHeader(this.settings.authUsername, this.settings.authPassword),
                'Content-Type': 'text/plain',
            }
        });

        if (response.status != 200) {
            return null
        } else {
            return response.data
        }
    }

    async publishAndUploadMedia() {
        const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
            
        if (activeLeaf && activeLeaf.file) {
            const postId = await this.publishPost(activeLeaf);

            if (!postId) {
                return
            }

            await this.uploadMedia(activeLeaf.file, postId);
        }
    }

    async publishPost(activeLeaf: MarkdownView): Promise<string|null> {
        try {

            const content = activeLeaf.editor.getValue();
            const response = await axios.post(`${this.settings.apiBaseUrl}/admin/api/post`, content, {
                headers: {
                    'Authorization': createBasicAuthHeader(this.settings.authUsername, this.settings.authPassword),
                    'Content-Type': 'text/plain',
                }
            });

            const postId = response.data?.id;

            if (!postId) {
                throw new Error('No post ID returned: ' + JSON.stringify(response.data));
            }

            console.log('Post created successfully with ID: %s', postId);
            new Notice('Post created successfully with ID: ' + postId);

            this.app.fileManager.processFrontMatter(activeLeaf.file!!, (frontmatter) => {
                frontmatter['id'] = postId;
            });

            return postId;

        } catch (error) {
            console.error('Failed to publish post', error);
            new Notice('Failed to publish post');
            return null;
        }
    }

    async uploadMedia(postFile: TFile, postId: string) {

        try {
            const mediaFolder = postFile.parent?.children
                                .find((abstractFile: TAbstractFile) => {return abstractFile.name === 'media'}) as TFolder | null | undefined;
            
            if (!mediaFolder) {
                console.log('couldnt find media folder');
                // Nothing to upload
                return;
            }

            const formData = new FormData();
            let fileCount = 0;
            for (const mediaFile of mediaFolder.children) {
                if (!(mediaFile instanceof TFile)) {
                    continue;
                }
                const fileBuffer = await this.app.vault.readBinary(mediaFile);
                const mimeType = getMimeType(mediaFile.name);
                formData.append('files', new Blob([fileBuffer]), mediaFile.name);
                fileCount++;
            }

            const response = await axios.post(`${this.settings.apiBaseUrl}/admin/post/${postId}/media?includesBanner=true`, formData, {
                headers: {
                    'Authorization': createBasicAuthHeader(this.settings.authUsername, this.settings.authPassword),
                    'Content-Type': 'multipart/form-data',
                }
            });

            if (response.status < 300) {
                new Notice(`${fileCount} media files uploaded successfully`);
            } else {
                throw new Error('Error response: ' + response.statusText);
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
