import { type App, PluginSettingTab, Setting } from 'obsidian';
import type KanbanBasesViewPlugin from './main.ts';

export interface KanbanPluginSettings {
	textPreviewEnabled: boolean;
	defaultTextPreviewLength: number;
}

export const DEFAULT_SETTINGS: KanbanPluginSettings = {
	textPreviewEnabled: true,
	defaultTextPreviewLength: 20,
};

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeSettings(raw: unknown): KanbanPluginSettings {
	const settings: KanbanPluginSettings = { ...DEFAULT_SETTINGS };

	if (!isUnknownRecord(raw)) {
		return settings;
	}

	if (typeof raw.textPreviewEnabled === 'boolean') {
		settings.textPreviewEnabled = raw.textPreviewEnabled;
	}

	const rawLength = raw.defaultTextPreviewLength;
	const parsedLength = typeof rawLength === 'number' ? rawLength : Number(rawLength);
	if (Number.isFinite(parsedLength) && parsedLength >= 0 && parsedLength <= 200) {
		settings.defaultTextPreviewLength = Math.round(parsedLength);
	}

	return settings;
}

export class KanbanSettingTab extends PluginSettingTab {
	plugin: KanbanBasesViewPlugin;

	constructor(app: App, plugin: KanbanBasesViewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Enable card text previews')
			.setDesc("Show a preview of each card's note body under the card title.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.textPreviewEnabled).onChange(async (value) => {
					this.plugin.settings.textPreviewEnabled = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Default preview length')
			.setDesc('Number of characters to show in the preview (0 to disable, max 200).')
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.defaultTextPreviewLength))
					.setPlaceholder('20')
					.onChange(async (value) => {
						const num = Number(value);
						let clamped = Number.isFinite(num) ? num : DEFAULT_SETTINGS.defaultTextPreviewLength;
						clamped = Math.max(0, Math.min(200, Math.round(clamped)));
						this.plugin.settings.defaultTextPreviewLength = clamped;
						await this.plugin.saveSettings();
					}),
			);
	}
}
