import assert from 'node:assert';
import { describe, test } from 'node:test';
import { type App, PluginSettingTab } from 'obsidian';
import KanbanBasesViewPlugin from '../src/main.ts';
import { DEFAULT_SETTINGS, normalizeSettings, type KanbanPluginSettings } from '../src/settings.ts';
import { createDivWithMethods, setupTestEnvironment } from './helpers.ts';

setupTestEnvironment();

// ---------------------------------------------------------------------------
// VAL-SETTINGS-005: Default settings are applied for missing data
// VAL-SETTINGS-006: Malformed settings data is safe
// ---------------------------------------------------------------------------

describe('Settings Defaults and Normalization', () => {
	test('default settings have expected values', () => {
		assert.strictEqual(DEFAULT_SETTINGS.textPreviewEnabled, true);
		assert.strictEqual(DEFAULT_SETTINGS.defaultTextPreviewLength, 20);
	});

	test('normalizeSettings applies defaults for null data', () => {
		const result = normalizeSettings(null);
		assert.deepStrictEqual(result, DEFAULT_SETTINGS);
	});

	test('normalizeSettings applies defaults for undefined data', () => {
		const result = normalizeSettings(undefined);
		assert.deepStrictEqual(result, DEFAULT_SETTINGS);
	});

	test('normalizeSettings applies defaults for empty object', () => {
		const result = normalizeSettings({});
		assert.deepStrictEqual(result, DEFAULT_SETTINGS);
	});

	test('normalizeSettings preserves valid settings', () => {
		const input = { textPreviewEnabled: false, defaultTextPreviewLength: 50 };
		const result = normalizeSettings(input);
		assert.strictEqual(result.textPreviewEnabled, false);
		assert.strictEqual(result.defaultTextPreviewLength, 50);
	});

	test('normalizeSettings normalizes invalid boolean to default', () => {
		const result = normalizeSettings({ textPreviewEnabled: 'yes', defaultTextPreviewLength: 50 } as unknown as Record<
			string,
			unknown
		>);
		assert.strictEqual(result.textPreviewEnabled, true);
		assert.strictEqual(result.defaultTextPreviewLength, 50);
	});

	test('normalizeSettings normalizes negative length to default', () => {
		const result = normalizeSettings({ textPreviewEnabled: true, defaultTextPreviewLength: -5 });
		assert.strictEqual(result.defaultTextPreviewLength, 20);
	});

	test('normalizeSettings normalizes above-range length to default', () => {
		const result = normalizeSettings({ textPreviewEnabled: true, defaultTextPreviewLength: 500 });
		assert.strictEqual(result.defaultTextPreviewLength, 20);
	});

	test('normalizeSettings normalizes NaN to default', () => {
		const result = normalizeSettings({ textPreviewEnabled: true, defaultTextPreviewLength: Number.NaN });
		assert.strictEqual(result.defaultTextPreviewLength, 20);
	});

	test('normalizeSettings normalizes Infinity to default', () => {
		const result = normalizeSettings({ textPreviewEnabled: true, defaultTextPreviewLength: Infinity });
		assert.strictEqual(result.defaultTextPreviewLength, 20);
	});

	test('normalizeSettings normalizes non-numeric string to default', () => {
		const result = normalizeSettings({ textPreviewEnabled: true, defaultTextPreviewLength: 'abc' } as unknown as Record<
			string,
			unknown
		>);
		assert.strictEqual(result.defaultTextPreviewLength, 20);
	});

	test('normalizeSettings accepts length of 0', () => {
		const result = normalizeSettings({ textPreviewEnabled: true, defaultTextPreviewLength: 0 });
		assert.strictEqual(result.defaultTextPreviewLength, 0);
	});

	test('normalizeSettings accepts length of 200', () => {
		const result = normalizeSettings({ textPreviewEnabled: true, defaultTextPreviewLength: 200 });
		assert.strictEqual(result.defaultTextPreviewLength, 200);
	});
});

// ---------------------------------------------------------------------------
// VAL-SETTINGS-001: Settings tab registration
// ---------------------------------------------------------------------------

describe('Settings Tab Registration', () => {
	async function createPlugin(storedData: unknown = null): Promise<KanbanBasesViewPlugin> {
		const plugin = new KanbanBasesViewPlugin({} as App, {} as any);
		plugin.loadData = async () => storedData;
		plugin.registerBasesView = () => true as any;
		plugin.registerHoverLinkSource = () => {};
		await plugin.onload();
		return plugin;
	}

	test('plugin onload registers a settings tab', async () => {
		const plugin = await createPlugin();
		assert.strictEqual((plugin as any).addSettingTabCalls.length, 1, 'addSettingTab should be called once during onload');
	});

	test('registered tab is a PluginSettingTab subclass', async () => {
		const plugin = await createPlugin();
		const tab = (plugin as any).addSettingTabCalls[0];
		assert.ok(tab instanceof PluginSettingTab, 'Registered tab should extend PluginSettingTab');
	});
});

// ---------------------------------------------------------------------------
// VAL-SETTINGS-002: Settings tab renders text preview controls
// ---------------------------------------------------------------------------

describe('Settings Tab UI Rendering', () => {
	async function createPlugin(storedData: unknown = null): Promise<KanbanBasesViewPlugin> {
		const plugin = new KanbanBasesViewPlugin({} as App, {} as any);
		plugin.loadData = async () => storedData;
		plugin.registerBasesView = () => true as any;
		plugin.registerHoverLinkSource = () => {};
		await plugin.onload();
		return plugin;
	}

	test('settings tab renders a toggle control', async () => {
		const plugin = await createPlugin();
		const tab = (plugin as any).addSettingTabCalls[0];
		tab.display();

		const toggle = tab.containerEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
		assert.ok(toggle, 'Toggle control should exist');
	});

	test('settings tab renders a text input control', async () => {
		const plugin = await createPlugin();
		const tab = (plugin as any).addSettingTabCalls[0];
		tab.display();

		const inputs = tab.containerEl.querySelectorAll('input[type="text"]');
		assert.ok(inputs.length > 0, 'Text input control should exist');
	});

	test('toggle is initialized from current settings (enabled)', async () => {
		const plugin = await createPlugin({ textPreviewEnabled: true });
		const tab = (plugin as any).addSettingTabCalls[0];
		tab.display();

		const toggle = tab.containerEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
		assert.strictEqual(toggle?.checked, true);
	});

	test('toggle is initialized from current settings (disabled)', async () => {
		const plugin = await createPlugin({ textPreviewEnabled: false });
		const tab = (plugin as any).addSettingTabCalls[0];
		tab.display();

		const toggle = tab.containerEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
		assert.strictEqual(toggle?.checked, false);
	});

	test('length input is initialized from current settings', async () => {
		const plugin = await createPlugin({ defaultTextPreviewLength: 50 });
		const tab = (plugin as any).addSettingTabCalls[0];
		tab.display();

		const input = tab.containerEl.querySelector('input[type="text"]') as HTMLInputElement;
		assert.strictEqual(input?.value, '50');
	});
});

// ---------------------------------------------------------------------------
// VAL-SETTINGS-003: Text preview toggle persists changes
// VAL-SETTINGS-004: Default preview length persists changes
// ---------------------------------------------------------------------------

describe('Settings Persistence', () => {
	async function createPlugin(storedData: unknown = null): Promise<{
		plugin: KanbanBasesViewPlugin;
		saveDataCalls: unknown[];
	}> {
		const plugin = new KanbanBasesViewPlugin({} as App, {} as any);
		plugin.loadData = async () => storedData;
		plugin.registerBasesView = () => true as any;
		plugin.registerHoverLinkSource = () => {};

		const saveDataCalls: unknown[] = [];
		plugin.saveData = async (data: unknown) => {
			saveDataCalls.push(data);
		};

		await plugin.onload();
		return { plugin, saveDataCalls };
	}

	test('toggling text preview off updates in-memory settings and calls saveData', async () => {
		const { plugin, saveDataCalls } = await createPlugin();
		const tab = (plugin as any).addSettingTabCalls[0];
		tab.display();

		const toggle = tab.containerEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
		toggle.checked = false;
		toggle.dispatchEvent(new (window as any).Event('change'));

		assert.strictEqual(plugin.settings.textPreviewEnabled, false);
		assert.strictEqual(saveDataCalls.length, 1);
		assert.strictEqual((saveDataCalls[0] as KanbanPluginSettings).textPreviewEnabled, false);
	});

	test('toggling text preview on updates in-memory settings and calls saveData', async () => {
		const { plugin, saveDataCalls } = await createPlugin({ textPreviewEnabled: false });
		const tab = (plugin as any).addSettingTabCalls[0];
		tab.display();

		const toggle = tab.containerEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
		toggle.checked = true;
		toggle.dispatchEvent(new (window as any).Event('change'));

		assert.strictEqual(plugin.settings.textPreviewEnabled, true);
		assert.strictEqual(saveDataCalls.length, 1);
		assert.strictEqual((saveDataCalls[0] as KanbanPluginSettings).textPreviewEnabled, true);
	});

	test('changing preview length updates in-memory settings and calls saveData', async () => {
		const { plugin, saveDataCalls } = await createPlugin();
		const tab = (plugin as any).addSettingTabCalls[0];
		tab.display();

		const input = tab.containerEl.querySelector('input[type="text"]') as HTMLInputElement;
		input.value = '75';
		input.dispatchEvent(new (window as any).Event('change'));

		assert.strictEqual(plugin.settings.defaultTextPreviewLength, 75);
		assert.strictEqual(saveDataCalls.length, 1);
		assert.strictEqual((saveDataCalls[0] as KanbanPluginSettings).defaultTextPreviewLength, 75);
	});
});

// ---------------------------------------------------------------------------
// VAL-SETTINGS-009: Preview length control enforces supported range
// ---------------------------------------------------------------------------

describe('Settings Range Handling', () => {
	async function createPlugin(storedData: unknown = null): Promise<{
		plugin: KanbanBasesViewPlugin;
		saveDataCalls: unknown[];
	}> {
		const plugin = new KanbanBasesViewPlugin({} as App, {} as any);
		plugin.loadData = async () => storedData;
		plugin.registerBasesView = () => true as any;
		plugin.registerHoverLinkSource = () => {};

		const saveDataCalls: unknown[] = [];
		plugin.saveData = async (data: unknown) => {
			saveDataCalls.push(data);
		};

		await plugin.onload();
		return { plugin, saveDataCalls };
	}

	test('negative UI value is clamped to 0', async () => {
		const { plugin, saveDataCalls } = await createPlugin();
		const tab = (plugin as any).addSettingTabCalls[0];
		tab.display();

		const input = tab.containerEl.querySelector('input[type="text"]') as HTMLInputElement;
		input.value = '-10';
		input.dispatchEvent(new (window as any).Event('change'));

		assert.strictEqual(plugin.settings.defaultTextPreviewLength, 0);
		assert.strictEqual(saveDataCalls.length, 1);
		assert.strictEqual((saveDataCalls[0] as KanbanPluginSettings).defaultTextPreviewLength, 0);
	});

	test('above-range UI value is clamped to 200', async () => {
		const { plugin, saveDataCalls } = await createPlugin();
		const tab = (plugin as any).addSettingTabCalls[0];
		tab.display();

		const input = tab.containerEl.querySelector('input[type="text"]') as HTMLInputElement;
		input.value = '500';
		input.dispatchEvent(new (window as any).Event('change'));

		assert.strictEqual(plugin.settings.defaultTextPreviewLength, 200);
		assert.strictEqual(saveDataCalls.length, 1);
		assert.strictEqual((saveDataCalls[0] as KanbanPluginSettings).defaultTextPreviewLength, 200);
	});

	test('NaN UI value falls back to default', async () => {
		const { plugin, saveDataCalls } = await createPlugin();
		const tab = (plugin as any).addSettingTabCalls[0];
		tab.display();

		const input = tab.containerEl.querySelector('input[type="text"]') as HTMLInputElement;
		input.value = 'not-a-number';
		input.dispatchEvent(new (window as any).Event('change'));

		assert.strictEqual(plugin.settings.defaultTextPreviewLength, DEFAULT_SETTINGS.defaultTextPreviewLength);
		assert.strictEqual(saveDataCalls.length, 1);
		assert.strictEqual(
			(saveDataCalls[0] as KanbanPluginSettings).defaultTextPreviewLength,
			DEFAULT_SETTINGS.defaultTextPreviewLength,
		);
	});

	test('decimal UI value is rounded', async () => {
		const { plugin, saveDataCalls } = await createPlugin();
		const tab = (plugin as any).addSettingTabCalls[0];
		tab.display();

		const input = tab.containerEl.querySelector('input[type="text"]') as HTMLInputElement;
		input.value = '45.7';
		input.dispatchEvent(new (window as any).Event('change'));

		assert.strictEqual(plugin.settings.defaultTextPreviewLength, 46);
		assert.strictEqual(saveDataCalls.length, 1);
		assert.strictEqual((saveDataCalls[0] as KanbanPluginSettings).defaultTextPreviewLength, 46);
	});
});

// ---------------------------------------------------------------------------
// VAL-SETTINGS-008: Legacy plugin data remains compatible
// ---------------------------------------------------------------------------

describe('Legacy Data Compatibility', () => {
	test('legacy columnOrders still parses when settings fields are absent', async () => {
		const stored = {
			columnOrders: { 'note.status': ['Done', 'Doing', 'To Do'] },
			columnColors: { 'note.status': { 'To Do': 'red' } },
		};

		const plugin = new KanbanBasesViewPlugin({} as App, {} as any);
		plugin.loadData = async () => stored;
		plugin.registerBasesView = () => true as any;
		plugin.registerHoverLinkSource = () => {};
		await plugin.onload();

		assert.deepStrictEqual(plugin.settings, DEFAULT_SETTINGS, 'Settings should normalize to defaults');
	});

	test('legacy columnOrders still parses when settings fields are present alongside', async () => {
		const stored = {
			columnOrders: { 'note.status': ['Done', 'Doing', 'To Do'] },
			columnColors: { 'note.status': { 'To Do': 'red' } },
			textPreviewEnabled: false,
			defaultTextPreviewLength: 10,
		};

		const plugin = new KanbanBasesViewPlugin({} as App, {} as any);
		plugin.loadData = async () => stored;
		plugin.registerBasesView = () => true as any;
		plugin.registerHoverLinkSource = () => {};
		await plugin.onload();

		assert.strictEqual(plugin.settings.textPreviewEnabled, false);
		assert.strictEqual(plugin.settings.defaultTextPreviewLength, 10);
	});

	test('saveSettings preserves legacy column data instead of clobbering plugin.data.json', async () => {
		const stored = {
			columnOrders: { 'note.status': ['Done', 'Doing', 'To Do'] },
			columnColors: { 'note.status': { 'To Do': 'red' } },
		};

		const plugin = new KanbanBasesViewPlugin({} as App, {} as any);
		plugin.loadData = async () => stored;
		plugin.registerBasesView = () => true as any;
		plugin.registerHoverLinkSource = () => {};

		const saved: unknown[] = [];
		plugin.saveData = async (data: unknown) => {
			saved.push(data);
		};

		await plugin.onload();
		plugin.settings.defaultTextPreviewLength = 42;
		await plugin.saveSettings();

		assert.strictEqual(saved.length, 1, 'saveSettings should persist once');
		const written = saved[0] as Record<string, unknown>;
		assert.deepStrictEqual(written.columnOrders, stored.columnOrders, 'Legacy columnOrders must survive a settings save');
		assert.deepStrictEqual(written.columnColors, stored.columnColors, 'Legacy columnColors must survive a settings save');
		assert.strictEqual(written.defaultTextPreviewLength, 42, 'New setting value should be written');
	});
});
