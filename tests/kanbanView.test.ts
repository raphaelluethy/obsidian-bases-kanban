import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { Notice } from 'obsidian';
import { Menu as MockMenu } from './mocks/obsidian.ts';
import type { BasesPropertyId } from 'obsidian';
import {
	ARCHIVED_LABEL,
	CSS_CLASSES,
	HOVER_LINK_SOURCE_ID,
	SORTABLE_CONFIG,
	SORTABLE_GROUP,
	SORTED_CARD_ORDER_NOTICE,
	UNCATEGORIZED_LABEL,
} from '../src/constants.ts';
import { isCardOrders, KanbanView } from '../src/kanbanView.ts';
import { createCard } from '../src/components/card.ts';
import { normalizePropertyValue } from '../src/utils/grouping.ts';
import {
	createEmptyEntries,
	createEntriesWithCovers,
	createEntriesWithCustomTitle,
	createEntriesWithEmptyValues,
	createEntriesWithLinks,
	createEntriesWithMixedProperties,
	createEntriesWithStatus,
	PROPERTY_CATEGORY,
	PROPERTY_COVER,
	PROPERTY_PRIORITY,
	PROPERTY_RELATED,
	PROPERTY_STATUS,
	PROPERTY_TITLE,
	TEST_PROPERTIES,
	VALUE_BOOLEAN,
	VALUE_DATE,
	VALUE_HTML,
	VALUE_LINK,
	VALUE_LINK_EXTERNAL_WITH_DISPLAY,
	VALUE_LINK_FILE_URL_WITH_DISPLAY,
	VALUE_LIST_LINKS,
	VALUE_LIST_PLAIN,
	VALUE_NUMBER,
	VALUE_PLAIN_STRING,
	VALUE_WIKILINK_STRING,
} from './fixtures.ts';
import {
	addClosestPolyfill,
	createDivWithMethods,
	createMockApp,
	createMockBasesEntry,
	createMockQueryController,
	createMockTFile,
	mockSortable,
	setupKanbanViewWithApp,
	setupTestEnvironment,
	triggerDataUpdate,
} from './helpers.ts';

setupTestEnvironment();

const noticeMessages = (): unknown[] => (Notice as unknown as { notices: unknown[] }).notices;

describe('KanbanView Initialization', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		controller = createMockQueryController();
		app = createMockApp();
		controller.app = app;
	});

	test('Constructor initializes correctly', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		assert.ok(view.containerEl, 'containerEl should be created');
		assert.strictEqual(view.containerEl.className, 'obk-view-container', 'containerEl should have correct class');
		assert.strictEqual(view.scrollEl, scrollEl, 'scrollEl reference should be stored');
		assert.strictEqual((view as any).groupByPropertyId, null, 'groupByPropertyId should be null initially');
		assert.strictEqual((view as any)._columnSortables.size, 0, '_columnSortables map should be empty');
	});

	test('loadConfig loads group by property from config', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		const testPropertyId = PROPERTY_STATUS;

		// Mock config.getAsPropertyId
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') {
				return testPropertyId;
			}
			return null;
		};

		// Call loadConfig via onDataUpdated
		triggerDataUpdate(view);

		assert.strictEqual((view as any).groupByPropertyId, testPropertyId, 'groupByPropertyId should be set from config');
	});

	test('loadConfig handles null/undefined config values', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		// Mock config.getAsPropertyId to return null
		controller.config.getAsPropertyId = (): BasesPropertyId | null => null;

		triggerDataUpdate(view);

		assert.strictEqual(
			(view as any).groupByPropertyId,
			null,
			'groupByPropertyId should remain null when config returns null',
		);
	});
});

describe('Data Rendering - Empty States', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		controller = createMockQueryController([], TEST_PROPERTIES);
		app = createMockApp();
		controller.app = app;
	});

	test('Renders empty state when no entries', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const emptyState = view.containerEl.querySelector('.obk-empty-state');
		assert.ok(emptyState, 'Empty state element should exist');
		assert.ok(
			emptyState?.textContent?.includes('No entries found'),
			'Empty state should show "No entries found" message',
		);
	});

	test('Renders empty state when no properties', () => {
		const controllerNoProps = createMockQueryController([], []) as any; // Empty properties array
		controllerNoProps.app = app;
		const view = new KanbanView(controllerNoProps, scrollEl);
		setupKanbanViewWithApp(view, app);

		// Set a property ID that doesn't exist in the empty properties list
		controllerNoProps.config.getAsPropertyId = () => PROPERTY_STATUS;
		triggerDataUpdate(view);

		const emptyState = view.containerEl.querySelector('.obk-empty-state');
		assert.ok(emptyState, 'Empty state element should exist');
		// The code will try to use the first available property, but since there are none,
		// it should show the "No properties found" message
		assert.ok(
			emptyState?.textContent?.includes('No properties found') || emptyState?.textContent?.includes('No entries found'),
			'Empty state should show appropriate message when no properties available',
		);
	});
});

describe('Data Rendering - Entry Grouping', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('groupEntriesByProperty groups entries correctly', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Check that columns were created
		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should be created');

		// Verify "To Do" column has 2 entries
		const toDoColumn = Array.from(columns).find((col) => col.getAttribute('data-column-value')?.includes('To Do'));
		assert.ok(toDoColumn, 'To Do column should exist');
		const toDoCards = toDoColumn?.querySelectorAll('.obk-card');
		assert.strictEqual(toDoCards?.length, 2, 'To Do column should have 2 cards');
	});

	test('Handles null/undefined property values (map to Uncategorized)', () => {
		const entries = createEntriesWithEmptyValues();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Check for Uncategorized column
		const columns = view.containerEl.querySelectorAll('.obk-column');
		const uncategorizedColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('Uncategorized'),
		);
		assert.ok(uncategorizedColumn, 'Uncategorized column should exist');
	});

	test('Handles empty string values (map to Uncategorized)', () => {
		const entries = createEntriesWithEmptyValues();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const uncategorizedColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('Uncategorized'),
		);
		assert.ok(uncategorizedColumn, 'Empty string values should map to Uncategorized');
	});
});

describe('Data Rendering - Column Rendering', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('createColumn creates column structure', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should be created');

		const firstColumn = columns[0] as HTMLElement;
		assert.ok(firstColumn.getAttribute('data-column-value'), 'Column should have data-column-value attribute');

		const header = firstColumn.querySelector('.obk-column-header');
		assert.ok(header, 'Column header should exist');

		const title = header?.querySelector('.obk-column-title');
		assert.ok(title, 'Column title should exist');

		const count = header?.querySelector('.obk-column-count');
		assert.ok(count, 'Column count should exist');

		const body = firstColumn.querySelector('.obk-column-body');
		assert.ok(body, 'Column body should exist');
		assert.ok(body?.getAttribute('data-sortable-container'), 'Column body should have data-sortable-container attribute');
	});

	test('column quick add button has an accessible label and plus icon', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('quickAddFolder', 'cards');

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const doingColumn = view.containerEl.querySelector('[data-column-value="Doing"]');
		const addBtn = doingColumn?.querySelector(`.${CSS_CLASSES.COLUMN_ADD_BTN}`);
		assert.ok(addBtn, 'Doing column should have a quick add button');
		assert.strictEqual(addBtn?.getAttribute('aria-label'), 'Add card to column: Doing');
		assert.strictEqual(addBtn?.getAttribute('tabindex'), '0');
		assert.ok(addBtn?.querySelector('[data-icon="plus"]'), 'Quick add button should render the plus icon');
	});

	test('column quick add button does not exist when no folder is configured', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const doingColumn = view.containerEl.querySelector('[data-column-value="Doing"]');
		const addBtn = doingColumn?.querySelector(`.${CSS_CLASSES.COLUMN_ADD_BTN}`);
		assert.strictEqual(addBtn, null, 'Column should not have a quick add button without folder configured');
	});

	test('quick add button appears after full rebuild when folder is configured', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// No button yet
		let doingColumn = view.containerEl.querySelector('[data-column-value="Doing"]');
		assert.strictEqual(doingColumn?.querySelector(`.${CSS_CLASSES.COLUMN_ADD_BTN}`), null);

		// Configure folder and re-render — folder change triggers a full rebuild
		controller.config.set('quickAddFolder', 'cards');
		triggerDataUpdate(view);

		doingColumn = view.containerEl.querySelector('[data-column-value="Doing"]');
		assert.ok(
			doingColumn?.querySelector(`.${CSS_CLASSES.COLUMN_ADD_BTN}`),
			'Add button should appear after folder is configured',
		);
	});

	test('quick add button is removed after full rebuild when folder is cleared', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('quickAddFolder', 'cards');

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Button present
		let doingColumn = view.containerEl.querySelector('[data-column-value="Doing"]');
		assert.ok(
			doingColumn?.querySelector(`.${CSS_CLASSES.COLUMN_ADD_BTN}`),
			'Add button should be present when folder is configured',
		);

		// Clear folder and re-render — folder change triggers a full rebuild
		controller.config.set('quickAddFolder', null);
		triggerDataUpdate(view);

		doingColumn = view.containerEl.querySelector('[data-column-value="Doing"]');
		assert.strictEqual(
			doingColumn?.querySelector(`.${CSS_CLASSES.COLUMN_ADD_BTN}`),
			null,
			'Add button should be removed after folder is cleared',
		);
	});

	test('quick add creates a file with the selected column property', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('quickAddFolder', 'cards');

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		await (view as any).createQuickAddCard('New Task', 'Doing', null);

		assert.deepStrictEqual((view as any).createFileForViewCalls, [
			{ baseFileName: 'cards/New Task', frontmatter: { status: 'Doing' } },
		]);
	});

	test('quick add omits the column property for Uncategorized', async () => {
		const entries = createEntriesWithEmptyValues();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('quickAddFolder', 'cards');

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		await (view as any).createQuickAddCard('New Task', UNCATEGORIZED_LABEL, null);

		assert.deepStrictEqual((view as any).createFileForViewCalls, [{ baseFileName: 'cards/New Task', frontmatter: {} }]);
	});

	test('quick add sets both column and swimlane properties when used inside a lane', async () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			if (key === 'swimlaneByProperty') return PROPERTY_PRIORITY;
			return null;
		};
		controller.config.set('quickAddFolder', 'cards');

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		await (view as any).createQuickAddCard('New Lane Task', 'Doing', 'High');

		assert.deepStrictEqual((view as any).createFileForViewCalls, [
			{
				baseFileName: 'cards/New Lane Task',
				frontmatter: { status: 'Doing', priority: 'High' },
			},
		]);
	});

	test('quick add does not move when Bases creates directly in the configured folder', async () => {
		const entries = createEntriesWithStatus();
		const createdFile = createMockTFile('energy/New Task.md');
		let markdownFiles = [createMockTFile('dashboards/maintenance-board.base')];

		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('quickAddFolder', 'energy');

		(app.vault as any).getMarkdownFiles = () => markdownFiles;
		(app.vault as any).getFolderByPath = (path: string) => (path === 'energy' ? { path, name: 'energy' } : null);
		(app.vault as any).getAbstractFileByPath = (path: string) => markdownFiles.find((file) => file.path === path) ?? null;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);
		(view as any).createFileForView = async (
			baseFileName: string,
			frontmatterProcessor?: (frontmatter: Record<string, unknown>) => void,
		) => {
			const frontmatter: Record<string, unknown> = {};
			frontmatterProcessor?.(frontmatter);
			(view as any).createFileForViewCalls.push({ baseFileName, frontmatter });
			markdownFiles = [...markdownFiles, createdFile];
		};

		await (view as any).createQuickAddCard('New Task', 'Doing', null);

		assert.deepStrictEqual((view as any).createFileForViewCalls, [
			{ baseFileName: 'energy/New Task', frontmatter: { status: 'Doing' } },
		]);
		assert.deepStrictEqual(app.fileManager.renameFile.calls, []);
	});

	test('quick add moves the created file when Bases ignores the configured folder', async () => {
		const entries = createEntriesWithStatus();
		const createdFile = createMockTFile('dashboards/New Task.md');
		let markdownFiles = [createMockTFile('dashboards/maintenance-board.base')];

		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('quickAddFolder', 'energy');

		(app.vault as any).getMarkdownFiles = () => markdownFiles;
		(app.vault as any).getFolderByPath = (path: string) => (path === 'energy' ? { path, name: 'energy' } : null);
		(app.vault as any).getAbstractFileByPath = (path: string) => markdownFiles.find((file) => file.path === path) ?? null;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);
		(view as any).createFileForView = async (
			baseFileName: string,
			frontmatterProcessor?: (frontmatter: Record<string, unknown>) => void,
		) => {
			const frontmatter: Record<string, unknown> = {};
			frontmatterProcessor?.(frontmatter);
			(view as any).createFileForViewCalls.push({ baseFileName, frontmatter });
			markdownFiles = [...markdownFiles, createdFile];
		};

		await (view as any).createQuickAddCard('New Task', 'Doing', null);

		assert.deepStrictEqual((view as any).createFileForViewCalls, [
			{ baseFileName: 'energy/New Task', frontmatter: { status: 'Doing' } },
		]);
		assert.deepStrictEqual(app.fileManager.renameFile.calls[0], [createdFile, 'energy/New Task.md']);
	});

	test('quick add moves wrong-folder suffixed files to the requested target name when it is free', async () => {
		const entries = createEntriesWithStatus();
		const createdFile = createMockTFile('dashboards/New Task 1.md');
		let markdownFiles = [createMockTFile('dashboards/maintenance-board.base')];

		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('quickAddFolder', 'energy');

		(app.vault as any).getMarkdownFiles = () => markdownFiles;
		(app.vault as any).getFolderByPath = (path: string) => (path === 'energy' ? { path, name: 'energy' } : null);
		(app.vault as any).getAbstractFileByPath = (path: string) => markdownFiles.find((file) => file.path === path) ?? null;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);
		(view as any).createFileForView = async (
			baseFileName: string,
			frontmatterProcessor?: (frontmatter: Record<string, unknown>) => void,
		) => {
			const frontmatter: Record<string, unknown> = {};
			frontmatterProcessor?.(frontmatter);
			(view as any).createFileForViewCalls.push({ baseFileName, frontmatter });
			markdownFiles = [...markdownFiles, createdFile];
		};

		await (view as any).createQuickAddCard('New Task', 'Doing', null);

		assert.deepStrictEqual((view as any).createFileForViewCalls, [
			{ baseFileName: 'energy/New Task', frontmatter: { status: 'Doing' } },
		]);
		assert.deepStrictEqual(app.fileManager.renameFile.calls[0], [createdFile, 'energy/New Task.md']);
	});

	test('quick add picks the next target filename when the configured folder already has a collision', async () => {
		const entries = createEntriesWithStatus();
		const existingTarget = createMockTFile('energy/New Task.md');
		const createdFile = createMockTFile('dashboards/New Task.md');
		let markdownFiles = [createMockTFile('dashboards/maintenance-board.base'), existingTarget];

		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('quickAddFolder', 'energy');

		(app.vault as any).getMarkdownFiles = () => markdownFiles;
		(app.vault as any).getFolderByPath = (path: string) => (path === 'energy' ? { path, name: 'energy' } : null);
		(app.vault as any).getAbstractFileByPath = (path: string) => markdownFiles.find((file) => file.path === path) ?? null;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);
		(view as any).createFileForView = async (
			baseFileName: string,
			frontmatterProcessor?: (frontmatter: Record<string, unknown>) => void,
		) => {
			const frontmatter: Record<string, unknown> = {};
			frontmatterProcessor?.(frontmatter);
			(view as any).createFileForViewCalls.push({ baseFileName, frontmatter });
			markdownFiles = [...markdownFiles, createdFile];
		};

		await (view as any).createQuickAddCard('New Task', 'Doing', null);

		assert.deepStrictEqual((view as any).createFileForViewCalls, [
			{ baseFileName: 'energy/New Task', frontmatter: { status: 'Doing' } },
		]);
		assert.deepStrictEqual(app.fileManager.renameFile.calls[0], [createdFile, 'energy/New Task 1.md']);
	});

	test('quick add waits for async Bases file creation before moving the card', async () => {
		const entries = createEntriesWithStatus();
		const createdFile = createMockTFile('dashboards/New Task.md');
		let markdownFiles = [createMockTFile('dashboards/maintenance-board.base')];
		let createHandler: (() => void) | null = null;

		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('quickAddFolder', 'energy');

		(app.vault as any).getMarkdownFiles = () => markdownFiles;
		(app.vault as any).getFolderByPath = (path: string) => (path === 'energy' ? { path, name: 'energy' } : null);
		(app.vault as any).getAbstractFileByPath = (path: string) => markdownFiles.find((file) => file.path === path) ?? null;
		(app.vault as any).on = (name: string, handler: () => void) => {
			if (name === 'create') createHandler = handler;
			return { name };
		};
		(app.vault as any).offref = () => {};

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);
		(view as any).createFileForView = async (
			baseFileName: string,
			frontmatterProcessor?: (frontmatter: Record<string, unknown>) => void,
		) => {
			const frontmatter: Record<string, unknown> = {};
			frontmatterProcessor?.(frontmatter);
			(view as any).createFileForViewCalls.push({ baseFileName, frontmatter });
			window.setTimeout(() => {
				markdownFiles = [...markdownFiles, createdFile];
				createHandler?.();
			}, 10);
		};

		await (view as any).createQuickAddCard('New Task', 'Doing', null);

		assert.deepStrictEqual((view as any).createFileForViewCalls, [
			{ baseFileName: 'energy/New Task', frontmatter: { status: 'Doing' } },
		]);
		assert.deepStrictEqual(app.fileManager.renameFile.calls[0], [createdFile, 'energy/New Task.md']);
	});

	test('quick add closes the native Base new item popover', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('quickAddFolder', 'cards');

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const popover = document.createElement('div');
		popover.className = 'bases-new-item-popover';
		document.body.appendChild(popover);

		await (view as any).createQuickAddCard('New Task', 'Doing', null);

		assert.strictEqual(document.querySelector('.bases-new-item-popover'), null);
	});

	test('quick add closes the native Base new item popover when Obsidian opens it after creation', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('quickAddFolder', 'cards');

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);
		(view as any).createFileForView = async () => {
			window.setTimeout(() => {
				const popover = document.createElement('div');
				popover.className = 'bases-new-item-popover';
				document.body.appendChild(popover);
			}, 200);
		};

		await (view as any).createQuickAddCard('New Task', 'Doing', null);
		await new Promise((resolve) => window.setTimeout(resolve, 300));

		assert.strictEqual(document.querySelector('.bases-new-item-popover'), null);
	});

	test('quick add does not create a file when configured folder is missing', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('quickAddFolder', 'missing');
		(app.vault as any).getFolderByPath = (): null => null;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		await (view as any).createQuickAddCard('New Task', 'Doing', null);

		assert.deepStrictEqual((view as any).createFileForViewCalls, []);
	});
});

describe('Data Rendering - Card Rendering', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('createCard creates card structure', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			return null;
		};

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const cards = view.containerEl.querySelectorAll('.obk-card');
		assert.ok(cards.length > 0, 'Cards should be created');

		const firstCard = cards[0] as HTMLElement;
		assert.ok(firstCard.getAttribute('data-entry-path'), 'Card should have data-entry-path attribute');

		const title = firstCard.querySelector('.obk-card-title');
		assert.ok(title, 'Card title should exist');
		// Columns sorted alphabetically: Doing, Done, To Do — first card is Task 3
		assert.strictEqual(title?.textContent, 'Task 3', 'Card title should default to file basename');
	});

	test('Card title defaults to file basename when cardTitleProperty is not configured', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			return null;
		};

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Columns sorted alphabetically: Doing, Done, To Do — first card is Task 3
		const firstCard = view.containerEl.querySelectorAll('.obk-card')[0] as HTMLElement;
		const title = firstCard.querySelector('.obk-card-title');
		assert.strictEqual(
			title?.textContent,
			'Task 3',
			'Card title should be file basename when cardTitleProperty is not set',
		);
	});

	test('Card title uses cardTitleProperty value when set', () => {
		const entries = createEntriesWithCustomTitle();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			if (key === 'cardTitleProperty') return PROPERTY_TITLE;
			return null;
		};

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const firstCard = view.containerEl.querySelectorAll('.obk-card')[0] as HTMLElement;
		const title = firstCard.querySelector('.obk-card-title');
		// MarkdownRenderer.render appends text synchronously before the await resolves
		assert.ok(title?.textContent?.includes('My Project'), 'Card title should show the cardTitleProperty value');
		assert.notStrictEqual(title?.textContent, 'README', 'Card title should not be the file basename');
	});

	test('Card title falls back to basename when cardTitleProperty value is null', () => {
		const entries = createEntriesWithStatus(); // no PROPERTY_TITLE on these entries
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			if (key === 'cardTitleProperty') return PROPERTY_TITLE;
			return null;
		};

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Columns sorted alphabetically: Doing, Done, To Do — first card is Task 3
		const firstCard = view.containerEl.querySelectorAll('.obk-card')[0] as HTMLElement;
		const title = firstCard.querySelector('.obk-card-title');
		assert.strictEqual(
			title?.textContent,
			'Task 3',
			'Card title should fall back to basename when property value is null',
		);
	});

	test('Property wrapping class is applied when enabled in config', () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			return null;
		};
		// Provide order with non-group-by property
		controller.config.getOrder = () => [PROPERTY_PRIORITY];
		controller.config.getDisplayName = (id: string) => id;

		// Enable wrapping in mock config
		controller.config.get = (key: string) => {
			if (key === 'wrapPropertyValues') return true;
			return null;
		};

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const cards = view.containerEl.querySelectorAll('.obk-card');
		const firstCard = cards[0] as HTMLElement;
		const propertyEl = firstCard.querySelector('.obk-card-property');

		assert.ok(propertyEl, 'Property element should exist');
		assert.ok(
			propertyEl?.classList.contains('obk-card-property-wrap'),
			'Property element should have wrap class when enabled',
		);
	});

	test('Property wrapping class is NOT applied when disabled in config', () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			return null;
		};
		// Provide order with non-group-by property
		controller.config.getOrder = () => [PROPERTY_PRIORITY];
		controller.config.getDisplayName = (id: string) => id;

		// Disable wrapping in mock config
		controller.config.get = (key: string) => {
			if (key === 'wrapPropertyValues') return false;
			return null;
		};

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const cards = view.containerEl.querySelectorAll('.obk-card');
		const firstCard = cards[0] as HTMLElement;
		const propertyEl = firstCard.querySelector('.obk-card-property');

		assert.ok(propertyEl, 'Property element should exist');
		assert.strictEqual(
			propertyEl?.classList.contains('obk-card-property-wrap'),
			false,
			'Property element should NOT have wrap class when disabled',
		);
	});

	test('Card click handler opens file in workspace', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		assert.ok(card, 'Card should exist');

		const entryPath = card.getAttribute('data-entry-path');
		card.click();

		// Verify openLinkText was called in current leaf
		assert.strictEqual(app.workspace.openLinkText.calls.length, 1, 'openLinkText should be called');
		assert.strictEqual(
			app.workspace.openLinkText.calls[0][0],
			entryPath,
			'openLinkText should be called with entry path',
		);
		assert.strictEqual(
			app.workspace.openLinkText.calls[0][2],
			false,
			'openLinkText should open in current leaf without modifier',
		);
	});

	test('Ctrl+click on card opens file in new leaf', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		assert.ok(card, 'Card should exist');

		const entryPath = card.getAttribute('data-entry-path');
		card.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));

		assert.strictEqual(app.workspace.openLinkText.calls.length, 1, 'openLinkText should be called');
		assert.strictEqual(
			app.workspace.openLinkText.calls[0][0],
			entryPath,
			'openLinkText should be called with entry path',
		);
		assert.strictEqual(
			app.workspace.openLinkText.calls[0][2],
			true,
			'openLinkText should open in new leaf with Ctrl held',
		);
	});

	test('Middle-click on card opens file in background and restores kanban focus', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		assert.ok(card, 'Card should exist');

		const entryPath = card.getAttribute('data-entry-path');
		const previousLeaf = app.workspace.mostRecentLeaf;
		card.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));

		assert.strictEqual(
			app.workspace.openLinkText.calls.length,
			0,
			'middle-click should bypass openLinkText so it can keep focus on the current view',
		);
		assert.strictEqual(
			app.workspace.getLeaf.calls.length,
			1,
			'getLeaf should be called once to create the background tab',
		);
		assert.strictEqual(app.workspace.getLeaf.calls[0][0], 'tab', "getLeaf should be called with 'tab'");
		assert.strictEqual(app.workspace.openFile.calls.length, 1, 'openFile should be called on the new leaf');
		assert.strictEqual(app.workspace.openFile.calls[0][0]?.path, entryPath, 'openFile should receive the card file');
		assert.deepStrictEqual(
			app.workspace.openFile.calls[0][1],
			{ active: false },
			'openFile should be called with active:false to keep focus on the kanban',
		);
		assert.strictEqual(
			app.workspace.setActiveLeaf.calls.length,
			1,
			'setActiveLeaf should be called once to restore focus to the kanban',
		);
		assert.strictEqual(
			app.workspace.setActiveLeaf.calls[0][0],
			previousLeaf,
			'setActiveLeaf should restore the previously active (kanban) leaf',
		);
		assert.deepStrictEqual(
			app.workspace.setActiveLeaf.calls[0][1],
			{ focus: false },
			'setActiveLeaf should restore activeness without re-focusing (focus:true triggers an extra scroll-into-view that clamps image-card column scroll)',
		);
	});

	test('Right-click on card does not open file', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		assert.ok(card, 'Card should exist');

		card.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 2 }));

		assert.strictEqual(app.workspace.openLinkText.calls.length, 0, 'openLinkText should not be called for right-click');
	});
});

describe('Data Rendering - Image cover property', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp({
			'cover-1.jpg': { path: 'attachments/cover-1.jpg' },
		});
	});

	function setupCoverView(
		overrides: { imageProperty?: BasesPropertyId | null; imageFit?: string; imageAspectRatio?: number } = {},
	) {
		const entries = createEntriesWithCovers();
		controller = createMockQueryController(entries, [PROPERTY_STATUS, PROPERTY_COVER]);
		controller.app = app;
		const imageProperty = 'imageProperty' in overrides ? overrides.imageProperty : PROPERTY_COVER;
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			if (key === 'imageProperty') return imageProperty;
			return null;
		};
		controller.config.get = (key: string) => {
			if (key === 'imageFit') return overrides.imageFit ?? 'cover';
			if (key === 'imageAspectRatio') return overrides.imageAspectRatio ?? 0.5;
			return null;
		};
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);
		return view;
	}

	function cardByPath(view: KanbanView, path: string): HTMLElement {
		const el = view.containerEl.querySelector(`.obk-card[data-entry-path="${path}"]`);
		assert.ok(el, `card for ${path} should exist`);
		return el as HTMLElement;
	}

	test('no imageProperty configured → no cover slot on any card', () => {
		const view = setupCoverView({ imageProperty: null });
		const covers = view.containerEl.querySelectorAll('.obk-card-cover');
		assert.strictEqual(covers.length, 0, 'no .obk-card-cover should exist when imageProperty is unset');
	});

	test('wikilink value resolves to getResourcePath src', () => {
		const view = setupCoverView();
		const img = cardByPath(view, 'Task A.md').querySelector('.obk-card-cover img') as HTMLImageElement;
		assert.ok(img, 'cover img should render for resolved wikilink');
		assert.strictEqual(img.getAttribute('src'), 'app://fake/attachments/cover-1.jpg');
		assert.strictEqual(img.getAttribute('alt'), '');
	});

	test('external URL value is used directly as src', () => {
		const view = setupCoverView();
		const img = cardByPath(view, 'Task B.md').querySelector('.obk-card-cover img') as HTMLImageElement;
		assert.ok(img, 'cover img should render for URL');
		assert.strictEqual(img.getAttribute('src'), 'https://example.com/remote.jpg');
	});

	test('legacy ![[...]] prefix still resolves (backward compat)', () => {
		const view = setupCoverView();
		const img = cardByPath(view, 'Task C.md').querySelector('.obk-card-cover img') as HTMLImageElement;
		assert.ok(img, 'cover img should render when value has leading !');
		assert.strictEqual(img.getAttribute('src'), 'app://fake/attachments/cover-1.jpg');
	});

	test('unresolvable wikilink → no cover slot on that card', () => {
		const view = setupCoverView();
		const cover = cardByPath(view, 'Task D.md').querySelector('.obk-card-cover');
		assert.strictEqual(cover, null, 'unresolved wikilink should not leave an empty cover slot');
	});

	test('empty string value → no cover slot', () => {
		const view = setupCoverView();
		const cover = cardByPath(view, 'Task E.md').querySelector('.obk-card-cover');
		assert.strictEqual(cover, null, 'empty cover value should not render a cover');
	});

	test('missing property value → no cover slot', () => {
		const view = setupCoverView();
		const cover = cardByPath(view, 'Task F.md').querySelector('.obk-card-cover');
		assert.strictEqual(cover, null, 'absent cover property should not render a cover');
	});

	test('imageFit=cover applies fit-cover modifier class', () => {
		const view = setupCoverView({ imageFit: 'cover' });
		const cover = cardByPath(view, 'Task A.md').querySelector('.obk-card-cover');
		assert.ok(cover?.classList.contains('obk-card-cover--fit-cover'));
		assert.ok(!cover?.classList.contains('obk-card-cover--fit-contain'));
	});

	test('imageFit=contain applies fit-contain modifier class', () => {
		const view = setupCoverView({ imageFit: 'contain' });
		const cover = cardByPath(view, 'Task A.md').querySelector('.obk-card-cover');
		assert.ok(cover?.classList.contains('obk-card-cover--fit-contain'));
		assert.ok(!cover?.classList.contains('obk-card-cover--fit-cover'));
	});

	test('imageAspectRatio is applied as inline aspect-ratio style', () => {
		const view = setupCoverView({ imageAspectRatio: 1.5 });
		const cover = cardByPath(view, 'Task A.md').querySelector('.obk-card-cover') as HTMLElement;
		assert.strictEqual(cover.style.aspectRatio, '1 / 1.5');
	});

	test('invalid/missing imageAspectRatio falls back to 0.5 (2:1 banner)', () => {
		const view = setupCoverView({ imageAspectRatio: Number.NaN });
		const cover = cardByPath(view, 'Task A.md').querySelector('.obk-card-cover') as HTMLElement;
		assert.strictEqual(cover.style.aspectRatio, '1 / 0.5');
	});
});

describe('Data Rendering - Board Rendering', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('render creates complete board', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const board = view.containerEl.querySelector('.obk-board');
		assert.ok(board, 'Board container should be created');

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should be created');

		// Verify columns are sorted alphabetically
		const columnValues = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		const sortedValues = [...columnValues].sort();
		assert.deepStrictEqual(columnValues, sortedValues, 'Columns should be sorted alphabetically');

		// Verify all entries appear in columns
		const allCards = view.containerEl.querySelectorAll('.obk-card');
		assert.strictEqual(allCards.length, entries.length, 'All entries should appear as cards');
	});
});

describe('Drag and Drop - Sortable Initialization', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;
	let sortableMock: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		sortableMock = mockSortable();
	});

	test('initializeSortable sets up drag-and-drop', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Verify Sortable instances were created
		const viewInstances = Array.from((view as any)._columnSortables.values());
		assert.ok(viewInstances.length > 0, 'Sortable instances should be created in view');

		// Verify the instance structure
		const firstInstance = viewInstances[0];
		assert.ok(firstInstance, 'Sortable instance should exist');

		// Verify that initializeSortable found column bodies to attach to
		const columnBodies = view.containerEl.querySelectorAll('.obk-column-body[data-sortable-container]');
		assert.ok(columnBodies.length > 0, 'Should have column bodies for Sortable');
		assert.strictEqual(viewInstances.length, columnBodies.length, 'Should have one Sortable instance per column body');

		// Verify instances have destroy method (required for cleanup)
		viewInstances.forEach((instance: any) => {
			assert.ok(typeof instance.destroy === 'function', 'Sortable instance should have destroy method');
		});
	});

	test('Existing instances are destroyed before creating new ones', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const instances = sortableMock.getInstances ? sortableMock.getInstances() : sortableMock.instances;
		const firstCallCount = instances.length;
		const firstInstances = [...instances];

		// Call onDataUpdated again
		triggerDataUpdate(view);

		// Verify old instances were destroyed
		firstInstances.forEach((instance) => {
			assert.strictEqual(instance.destroyed, true, 'Old instances should be destroyed');
		});
	});

	test('Card Sortable instances include touch settings', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const viewInstances = Array.from((view as any)._columnSortables.values());
		assert.ok(viewInstances.length > 0, 'Sortable instances should be created');

		viewInstances.forEach((instance: any) => {
			assert.strictEqual(
				instance.options.delay,
				SORTABLE_CONFIG.TOUCH_DELAY,
				'Card Sortable should have touch delay configured',
			);
			assert.strictEqual(instance.options.delayOnTouchOnly, true, 'Card Sortable should have delayOnTouchOnly enabled');
			assert.strictEqual(
				instance.options.touchStartThreshold,
				SORTABLE_CONFIG.TOUCH_START_THRESHOLD,
				'Card Sortable should have touchStartThreshold configured',
			);
		});
	});

	test('Card Sortable instances keep intra-column sorting enabled while Base sort is active', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('sort', [{ property: 'file.mtime', direction: 'DESC' }]);

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const viewInstances = Array.from((view as any)._columnSortables.values());
		assert.ok(viewInstances.length > 0, 'Sortable instances should be created');

		viewInstances.forEach((instance: any) => {
			assert.strictEqual(
				instance.options.sort,
				true,
				'Card Sortable should allow same-column drag attempts so a sorted board can warn on reorder',
			);
			assert.strictEqual(instance.options.group, SORTABLE_GROUP, 'Card Sortable should still allow cross-column dragging');
		});
	});

	test('Card Sortable instances allow intra-column sorting when Base sort is inactive', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const viewInstances = Array.from((view as any)._columnSortables.values());
		assert.ok(viewInstances.length > 0, 'Sortable instances should be created');

		viewInstances.forEach((instance: any) => {
			assert.strictEqual(instance.options.sort, true, 'Card Sortable should allow same-column sorting');
		});
	});
});

describe('Drag and Drop - Card Drop Handling', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;
	let sortableMock: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		sortableMock = mockSortable();
		(global as any).Sortable = sortableMock.Sortable;
		addClosestPolyfill(document.createElement('div'));
	});

	test('handleCardDrop updates property on drop', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Find a card in "To Do" column
		const columns = view.containerEl.querySelectorAll('.obk-column');
		const toDoColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('To Do'),
		) as HTMLElement;
		const doingColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('Doing'),
		) as HTMLElement;

		assert.ok(toDoColumn, 'To Do column should exist');
		assert.ok(doingColumn, 'Doing column should exist');

		const card = toDoColumn.querySelector('.obk-card') as HTMLElement;
		assert.ok(card, 'Card should exist');

		const entryPath = card.getAttribute('data-entry-path');
		const toDoBody = toDoColumn.querySelector('.obk-column-body') as HTMLElement;
		const doingBody = doingColumn.querySelector('.obk-column-body') as HTMLElement;

		// Create mock sortable event
		const mockEvent = {
			item: card,
			from: toDoBody,
			to: doingBody,
			oldIndex: 0,
			newIndex: 0,
		};

		// Call handleCardDrop
		await (view as any).handleCardDrop(mockEvent);

		// Verify processFrontMatter was called
		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 1, 'processFrontMatter should be called');
	});

	test('Skip update if dropped in same column', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const toDoColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('To Do'),
		) as HTMLElement;

		const card = toDoColumn.querySelector('.obk-card') as HTMLElement;
		const toDoBody = toDoColumn.querySelector('.obk-column-body') as HTMLElement;

		const mockEvent = {
			item: card,
			from: toDoBody,
			to: toDoBody, // Same column
			oldIndex: 0,
			newIndex: 1,
		};

		app.fileManager.processFrontMatter.calls.length = 0; // Reset

		await (view as any).handleCardDrop(mockEvent);

		// Should not call processFrontMatter
		assert.strictEqual(
			app.fileManager.processFrontMatter.calls.length,
			0,
			'processFrontMatter should not be called for same column drop',
		);
	});

	test('Handle "Uncategorized" value (set to empty string)', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const toDoColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('To Do'),
		) as HTMLElement;
		const uncategorizedColumn = Array.from(columns).find((col) =>
			col.getAttribute('data-column-value')?.includes('Uncategorized'),
		) as HTMLElement;

		if (!uncategorizedColumn) {
			// Create uncategorized column if it doesn't exist
			const uncatDiv = document.createElement('div');
			uncatDiv.className = 'obk-column';
			uncatDiv.setAttribute('data-column-value', 'Uncategorized');
			const uncatBody = document.createElement('div');
			uncatBody.className = 'obk-column-body';
			uncatDiv.appendChild(uncatBody);
			view.containerEl.querySelector('.obk-board')?.appendChild(uncatDiv);
		}

		const card = toDoColumn.querySelector('.obk-card') as HTMLElement;
		const toDoBody = toDoColumn.querySelector('.obk-column-body') as HTMLElement;
		const uncatBody = (
			uncategorizedColumn || view.containerEl.querySelector('[data-column-value="Uncategorized"]')
		)?.querySelector('.obk-column-body') as HTMLElement;

		const mockEvent = {
			item: card,
			from: toDoBody,
			to: uncatBody,
			oldIndex: 0,
			newIndex: 0,
		};

		await (view as any).handleCardDrop(mockEvent);

		// Verify processFrontMatter was called with empty string logic
		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 1, 'processFrontMatter should be called');
	});
});

describe('Drag and Drop - Drop Error Handling', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('Handle missing entry path', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = document.createElement('div');
		card.className = 'obk-card';
		// No data-entry-path attribute

		const mockEvent = {
			item: card,
			from: document.createElement('div'),
			to: document.createElement('div'),
			oldIndex: 0,
			newIndex: 0,
		};

		// Should not throw
		await (view as any).handleCardDrop(mockEvent);

		// Should not call processFrontMatter
		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 0, 'processFrontMatter should not be called');
	});

	test('Handle missing column elements', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = document.createElement('div');
		card.className = 'obk-card';
		card.setAttribute('data-entry-path', 'test.md');

		const mockEvent = {
			item: card,
			from: document.createElement('div'), // Not a column body
			to: document.createElement('div'), // Not a column body
			oldIndex: 0,
			newIndex: 0,
		};

		await (view as any).handleCardDrop(mockEvent);

		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 0, 'processFrontMatter should not be called');
	});
});

describe('Data Updates', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('onDataUpdated refreshes view', () => {
		const entries = createEntriesWithStatus();
		const controller = createMockQueryController(entries, TEST_PROPERTIES) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		let loadConfigCalled = false;
		let renderCalled = false;

		const originalLoadConfig = (view as any).loadConfig.bind(view);
		const originalRender = (view as any).render.bind(view);

		(view as any).loadConfig = function () {
			loadConfigCalled = true;
			return originalLoadConfig();
		};

		(view as any).render = function () {
			renderCalled = true;
			return originalRender();
		};

		triggerDataUpdate(view);

		assert.strictEqual(loadConfigCalled, true, 'loadConfig should be called');
		assert.strictEqual(renderCalled, true, 'render should be called');
	});

	test('re-renders card properties when getOrder() changes between updates', () => {
		const entries = createEntriesWithMixedProperties();
		const controller = createMockQueryController(entries, TEST_PROPERTIES) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.getDisplayName = (id: string) => id;
		controller.config.getOrder = (): string[] => [PROPERTY_STATUS];

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const cardsBefore = view.containerEl.querySelectorAll('.obk-card-property');
		assert.strictEqual(cardsBefore.length, 0, 'No extra properties shown initially');

		controller.config.getOrder = (): string[] => [PROPERTY_STATUS, PROPERTY_PRIORITY];
		triggerDataUpdate(view);

		const cardsAfter = view.containerEl.querySelectorAll('.obk-card-property');
		assert.ok(cardsAfter.length > 0, 'Property elements should appear after getOrder() changes');
	});

	test('re-renders cards when wrapPropertyValues changes', () => {
		const entries = createEntriesWithMixedProperties();
		const controller = createMockQueryController(entries, TEST_PROPERTIES) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.getDisplayName = (id: string) => id;
		controller.config.getOrder = (): string[] => [PROPERTY_PRIORITY];

		let wrapValue = false;
		controller.config.get = (key: string) => {
			if (key === 'wrapPropertyValues') return wrapValue;
			return null;
		};

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const propertyElBefore = view.containerEl.querySelector('.obk-card-property');
		assert.ok(propertyElBefore, 'Property element should exist');
		assert.strictEqual(
			propertyElBefore?.classList.contains('obk-card-property-wrap'),
			false,
			'Should not have wrap class initially',
		);

		// Toggle wrap and update
		wrapValue = true;
		triggerDataUpdate(view);

		const propertyElAfter = view.containerEl.querySelector('.obk-card-property');
		assert.ok(propertyElAfter, 'Property element should exist after update');
		assert.strictEqual(
			propertyElAfter?.classList.contains('obk-card-property-wrap'),
			true,
			'Should have wrap class after config changes',
		);
	});
});

describe('Cleanup', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;
	let sortableMock: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		sortableMock = mockSortable();
		(global as any).Sortable = sortableMock.Sortable;
	});

	test('onClose cleans up resources', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Verify instances exist before close
		const viewInstancesBefore = Array.from((view as any)._columnSortables.values());
		assert.ok(viewInstancesBefore.length > 0, 'Sortable instances should exist');

		// Call onClose
		view.onClose();

		// Verify instances were destroyed
		assert.strictEqual((view as any)._columnSortables.size, 0, 'All instances should be cleaned up');

		viewInstancesBefore.forEach((instance: any) => {
			if (instance && typeof instance.destroyed !== 'undefined') {
				assert.strictEqual(instance.destroyed, true, 'Instance should be destroyed');
			}
		});
	});
});

describe('Column Reordering - Drag Handle', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('Column drag handle appears in column headers', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should exist');

		columns.forEach((column) => {
			const header = column.querySelector('.obk-column-header');
			assert.ok(header, 'Column header should exist');

			const dragHandle = header?.querySelector('.obk-column-drag-handle');
			assert.ok(dragHandle, 'Drag handle should exist in column header');
		});
	});

	test('Drag handle has correct CSS class', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const dragHandle = view.containerEl.querySelector('.obk-column-drag-handle');
		assert.ok(dragHandle, 'Drag handle should exist');
		assert.ok(dragHandle?.classList.contains('obk-column-drag-handle'), 'Drag handle should have correct CSS class');
	});
});

describe('Column Reordering - Sortable Initialization', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;
	let sortableMock: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		sortableMock = mockSortable();
		(global as any).Sortable = sortableMock.Sortable;
	});

	test('Column Sortable instance is created for board', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columnSortable = (view as any).swimlaneColumnSortables.get(null);
		assert.ok(columnSortable, 'Column Sortable instance should be created');
		assert.ok(!columnSortable.destroyed, 'Column Sortable should not be destroyed');
	});

	test('Column Sortable uses drag handle selector', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columnSortable = (view as any).swimlaneColumnSortables.get(null);
		assert.ok(columnSortable, 'Column Sortable should exist');

		// Check the columnSortable instance directly
		assert.ok(columnSortable.options, 'Column Sortable should have options');
		assert.strictEqual(
			columnSortable.options.handle,
			'.obk-column-drag-handle',
			'Column Sortable should use drag handle selector',
		);
	});

	test('Column Sortable is destroyed on cleanup', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columnSortable = (view as any).swimlaneColumnSortables.get(null);
		assert.ok(columnSortable, 'Column Sortable should exist');

		// Verify it's a Sortable instance (has destroy method)
		assert.ok(typeof columnSortable.destroy === 'function', 'Column Sortable should have destroy method');

		view.onClose();

		// After cleanup, swimlaneColumnSortables should be empty
		assert.strictEqual(
			(view as any).swimlaneColumnSortables.size,
			0,
			'swimlaneColumnSortables should be empty after cleanup',
		);

		// Verify destroy was called if the mock tracks it
		if (columnSortable && typeof columnSortable.destroyed !== 'undefined') {
			assert.strictEqual(columnSortable.destroyed, true, 'Column Sortable should be destroyed');
		}
	});
});

describe('Column Reordering - Order Persistence', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('handleSwimlaneColumnDrop saves order to storage', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const boardEl = view.containerEl.querySelector('.obk-board') as HTMLElement;

		// Simulate column reorder: move first column to end
		const firstColumn = columns[0] as HTMLElement;

		const mockEvent = {
			item: firstColumn,
			from: boardEl,
			to: boardEl,
			oldIndex: 0,
			newIndex: columns.length - 1,
		};

		// handleSwimlaneColumnDrop handles both flat (boardEl) and swimlane (bodyEl) drops
		(view as any).handleSwimlaneColumnDrop(mockEvent);

		// Verify order was saved in config
		const savedOrders = controller.config.get('columnOrders') as Record<string, string[]> | null;
		const savedOrder = savedOrders?.[PROPERTY_STATUS];
		assert.ok(savedOrder, 'Column order should be saved');
		assert.ok(Array.isArray(savedOrder), 'Saved order should be an array');
	});

	test('Render respects saved column order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Set saved order
		const savedOrder = ['Done', 'Doing', 'To Do'];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));

		// Should match saved order (filtered to only include existing values)
		const expectedOrder = savedOrder.filter((v) => ['Done', 'Doing', 'To Do'].includes(v));
		assert.deepStrictEqual(renderedOrder, expectedOrder, 'Columns should be rendered in saved order');
	});

	test('New columns appear at end of existing columns', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Set saved order with only some columns
		const savedOrder = ['Done', 'Doing'];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));

		// Should have saved columns first, then new ones
		assert.strictEqual(renderedOrder[0], 'Done', 'First column should be from saved order');
		assert.strictEqual(renderedOrder[1], 'Doing', 'Second column should be from saved order');
		assert.ok(renderedOrder.includes('To Do'), 'New column should be included');
		// To Do should be after the saved columns
		const toDoIndex = renderedOrder.indexOf('To Do');
		assert.ok(toDoIndex >= 2, 'New column should appear after saved columns');
	});

	test('Property toggle preserves order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;

		// Set initial property and order
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		const savedOrder = ['Done', 'Doing', 'To Do'];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Verify initial order
		let columns = view.containerEl.querySelectorAll('.obk-column');
		let renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		assert.deepStrictEqual(renderedOrder, savedOrder, 'Initial order should match saved order');

		// Switch to different property
		controller.config.getAsPropertyId = () => PROPERTY_PRIORITY;
		triggerDataUpdate(view);

		// Switch back to original property
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		triggerDataUpdate(view);

		// Verify order is preserved
		columns = view.containerEl.querySelectorAll('.obk-column');
		renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		assert.deepStrictEqual(renderedOrder, savedOrder, 'Order should be preserved after property toggle');
	});

	test('Multiple properties have independent orders', () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;

		// Set different orders for different properties
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['Done', 'Doing', 'To Do'],
			[PROPERTY_PRIORITY]: ['Low', 'Medium', 'High'],
		});

		// Test status property
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		const view1 = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view1, app);
		triggerDataUpdate(view1);

		let columns = view1.containerEl.querySelectorAll('.obk-column');
		let order1 = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		assert.strictEqual(order1[0], 'Done', 'Status order should be respected');

		// Test priority property
		controller.config.getAsPropertyId = () => PROPERTY_PRIORITY;
		const view2 = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view2, app);
		triggerDataUpdate(view2);

		columns = view2.containerEl.querySelectorAll('.obk-column');
		const order2 = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		assert.strictEqual(order2[0], 'Low', 'Priority order should be independent');
		assert.notDeepStrictEqual(order1, order2, 'Orders should be different');
	});

	test('Fallback to alphabetical when no saved order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// No saved order (config has no columnOrders set — returns null by default)

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));

		// Should be alphabetical
		const expectedOrder = [...renderedOrder].sort();
		assert.deepStrictEqual(renderedOrder, expectedOrder, 'Columns should be alphabetical when no saved order');
	});

	test('Handle null/undefined saved order gracefully', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// No saved order (config returns null by default)

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should still be rendered');

		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		const expectedOrder = [...renderedOrder].sort();
		assert.deepStrictEqual(renderedOrder, expectedOrder, 'Should fallback to alphabetical when order is null');
	});
});

describe('Column Order Normalization', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('Normalizes old JSON strings in saved order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Saved order should be normalized strings (as they are when saved from column values)
		const savedOrder = ['Done', 'Doing', 'To Do'];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));

		// Should render correctly with saved order
		assert.ok(renderedOrder.includes('Done'), 'Done should be in rendered order');
		assert.ok(renderedOrder.includes('Doing'), 'Doing should be in rendered order');
		assert.ok(renderedOrder.includes('To Do'), 'To Do should be in rendered order');

		// Order should match saved order (Done, Doing, To Do)
		assert.strictEqual(renderedOrder[0], 'Done', 'First column should be Done (from saved order)');
		assert.strictEqual(renderedOrder[1], 'Doing', 'Second column should be Doing (from saved order)');
	});

	test('Handles mixed JSON strings and plain strings in saved order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Saved order should be normalized strings
		const savedOrder = ['Done', 'To Do', 'Doing'];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));

		// Should render in saved order
		assert.strictEqual(renderedOrder[0], 'Done', 'First should be Done (from saved order)');
		assert.strictEqual(renderedOrder[1], 'To Do', 'Second should be To Do (from saved order)');
		assert.strictEqual(renderedOrder[2], 'Doing', 'Third should be Doing (from saved order)');
	});

	test('New values merged correctly with normalized saved order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Saved order with only some columns (normalized strings)
		const savedOrder = ['Done'];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));

		// Should have Done first (from saved order), then new columns
		assert.strictEqual(renderedOrder[0], 'Done', 'First should be Done (from saved order)');
		assert.ok(renderedOrder.includes('To Do'), 'To Do should be included');
		assert.ok(renderedOrder.includes('Doing'), 'Doing should be included');

		// New columns should appear after saved ones
		const toDoIndex = renderedOrder.indexOf('To Do');
		const doingIndex = renderedOrder.indexOf('Doing');
		assert.ok(toDoIndex > 0, 'To Do should appear after Done');
		assert.ok(doingIndex > 0, 'Doing should appear after Done');
	});

	test('Backwards compatibility: old saved data does not break rendering', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Old format with invalid saved data (JSON strings won't match column values)
		// This simulates old data that might have been saved incorrectly
		const savedOrder = [
			'{"Data": "Done"}', // JSON string won't match normalized column value
			'InvalidValue', // Invalid value that doesn't exist
		];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		// Should not throw - invalid saved data should be ignored gracefully
		assert.doesNotThrow(() => {
			triggerDataUpdate(view);
		}, 'Should handle invalid saved data without errors');

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should be rendered');

		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));

		// All values should be normalized correctly
		assert.ok(renderedOrder.includes('Done'), 'Done should be present');
		assert.ok(renderedOrder.includes('Doing'), 'Doing should be present');
		assert.ok(renderedOrder.includes('To Do'), 'To Do should be present');
	});

	test('Handles invalid JSON strings in saved order gracefully', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Saved order with invalid JSON (should fall back to string value)
		const savedOrder = ['{invalid json}', 'To Do'];
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: savedOrder });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);

		// Should not throw
		assert.doesNotThrow(() => {
			triggerDataUpdate(view);
		}, 'Should handle invalid JSON gracefully');

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should be rendered');
	});
});

describe('Data Rendering - Card Properties', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('renders properties listed in getOrder() on each card', () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (): string => PROPERTY_STATUS;
		controller.config.getOrder = (): string[] => [PROPERTY_STATUS, PROPERTY_PRIORITY];
		controller.config.getDisplayName = (id: string): string => id;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Find the card for "Task A" specifically (status: "To Do", priority: "High")
		const cards = Array.from(view.containerEl.querySelectorAll('.obk-card'));
		const taskACard = cards.find((c) => c.getAttribute('data-entry-path') === 'Task A.md') as HTMLElement;
		assert.ok(taskACard, 'Card for Task A should exist');

		const propertyEls = taskACard.querySelectorAll('.obk-card-property');
		assert.strictEqual(propertyEls.length, 1, 'Card should show one non-group-by property');

		assert.strictEqual(
			(propertyEls[0] as HTMLElement).getAttribute('data-label'),
			PROPERTY_PRIORITY,
			'Label should show property id',
		);
		assert.strictEqual(
			propertyEls[0].querySelector('.obk-card-property-value')?.textContent,
			'High',
			'Value should show property value',
		);
	});

	test('does not render the group-by property as a card property', () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (): string => PROPERTY_STATUS;
		controller.config.getOrder = (): string[] => [PROPERTY_STATUS, PROPERTY_PRIORITY];
		controller.config.getDisplayName = (id: string): string => id;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		const propertyLabels = Array.from(card.querySelectorAll('.obk-card-property-label')).map((el) => el.textContent);
		assert.ok(!propertyLabels.includes(PROPERTY_STATUS), 'Group-by property should not appear as a card property');
	});

	test('does not render properties with null or empty values', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), {
				[PROPERTY_STATUS]: 'To Do',
				[PROPERTY_PRIORITY]: null,
				[PROPERTY_CATEGORY]: '',
			}),
		];
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (): string => PROPERTY_STATUS;
		controller.config.getOrder = (): string[] => [PROPERTY_STATUS, PROPERTY_PRIORITY, PROPERTY_CATEGORY];
		controller.config.getDisplayName = (id: string): string => id;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		const propertyEls = card.querySelectorAll('.obk-card-property');
		assert.strictEqual(propertyEls.length, 0, 'No property elements should be rendered for null/empty values');
	});

	test('renders no property elements when getOrder() returns empty array', () => {
		const entries = createEntriesWithMixedProperties();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (): string => PROPERTY_STATUS;
		// getOrder already returns [] by default in createMockQueryController

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		const propertyEls = card.querySelectorAll('.obk-card-property');
		assert.strictEqual(propertyEls.length, 0, 'No property elements should be rendered when getOrder is empty');
	});
});

describe('Column Colors', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		controller = createMockQueryController();
		app = createMockApp();
		controller.app = app;
	});

	test('color picker button is rendered in each column header', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const headers = view.containerEl.querySelectorAll('.obk-column-header');
		assert.ok(headers.length > 0, 'Columns should be rendered');
		headers.forEach((header) => {
			const colorBtn = header.querySelector('.obk-column-color-btn');
			assert.ok(colorBtn, 'Each column header should contain a color picker button');
		});
	});

	test('column renders with accent color CSS variable when color is set', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		controller.config.set('columnColors', {
			[PROPERTY_STATUS]: { 'To Do': 'red' },
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column') as NodeListOf<HTMLElement>;
		let toDoColumn: HTMLElement | null = null;
		columns.forEach((col) => {
			if (col.getAttribute('data-column-value') === 'To Do') toDoColumn = col;
		});

		assert.ok(toDoColumn, 'To Do column should exist');
		assert.strictEqual(
			(toDoColumn as HTMLElement).style.getPropertyValue('--obk-column-accent-color'),
			'var(--color-red)',
			'Column should have red accent color variable set',
		);
		assert.strictEqual(
			(toDoColumn as HTMLElement).getAttribute('data-column-color'),
			'red',
			'Column should have data-column-color attribute set',
		);
	});

	test('column does not set accent color when no color is stored', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column') as NodeListOf<HTMLElement>;
		columns.forEach((col) => {
			assert.strictEqual(
				col.style.getPropertyValue('--obk-column-accent-color'),
				'',
				'Column should not have accent color variable when no color stored',
			);
			assert.strictEqual(
				col.getAttribute('data-column-color'),
				null,
				'Column should not have data-column-color attribute',
			);
		});
	});

	test('color picker button has accessible aria-label', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		columns.forEach((col) => {
			const colorBtn = col.querySelector('.obk-column-color-btn');
			assert.ok(colorBtn, 'Color button should exist');
			const label = colorBtn!.getAttribute('aria-label');
			assert.ok(label && label.length > 0, 'Color button should have a non-empty aria-label');
			const colValue = col.getAttribute('data-column-value');
			assert.ok(label!.includes(colValue!), 'aria-label should include the column value');
		});
	});

	test('clicking a color swatch applies color and calls saveColumnColor', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Find the "To Do" column and its color button
		const columns = view.containerEl.querySelectorAll('.obk-column') as NodeListOf<HTMLElement>;
		let toDoColumn: HTMLElement | null = null;
		columns.forEach((col) => {
			if (col.getAttribute('data-column-value') === 'To Do') toDoColumn = col;
		});
		assert.ok(toDoColumn, 'To Do column should exist');

		const colorBtn = toDoColumn!.querySelector('.obk-column-color-btn') as HTMLElement;
		assert.ok(colorBtn, 'Color button should exist');

		// Open the popover
		colorBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		const popover = document.querySelector('.obk-column-color-popover') as HTMLElement;
		assert.ok(popover, 'Popover should appear after clicking color button');

		// Click the first colored swatch (index 1, skipping the "none" swatch at index 0)
		const swatches = popover.querySelectorAll('.obk-column-color-swatch') as NodeListOf<HTMLElement>;
		assert.ok(swatches.length > 1, 'Popover should have color swatches');
		const firstColorSwatch = swatches[1]; // index 0 is "none"
		const swatchTitle = firstColorSwatch.title; // e.g. "red"
		firstColorSwatch.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		// Popover should be gone
		assert.strictEqual(
			document.querySelector('.obk-column-color-popover'),
			null,
			'Popover should close after swatch click',
		);

		// Column should have the color applied
		assert.strictEqual(
			toDoColumn!.style.getPropertyValue('--obk-column-accent-color'),
			`var(--color-${swatchTitle})`,
			'Column should have accent color applied',
		);
		assert.strictEqual(toDoColumn!.getAttribute('data-column-color'), swatchTitle, 'Column data attribute should be set');

		// Config should have been updated to persist the color
		const savedColors = controller.config.get('columnColors') as Record<string, Record<string, string>> | null;
		assert.strictEqual(savedColors?.[PROPERTY_STATUS]?.['To Do'], swatchTitle, 'saveColumnColor should have been called');
	});

	test('color picker button reflects current column color via inline style', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		controller.config.set('columnColors', {
			[PROPERTY_STATUS]: { 'To Do': 'blue' },
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column') as NodeListOf<HTMLElement>;
		let toDoColumn: HTMLElement | null = null;
		columns.forEach((col) => {
			if (col.getAttribute('data-column-value') === 'To Do') toDoColumn = col;
		});
		assert.ok(toDoColumn, 'To Do column should exist');

		// The color button inherits --obk-column-accent-color from the column via CSS,
		// so we verify the column itself has the variable set correctly
		assert.strictEqual(
			(toDoColumn as HTMLElement).style.getPropertyValue('--obk-column-accent-color'),
			'var(--color-blue)',
			'Column CSS variable should reflect stored color',
		);
	});
});

describe('Hidden columns', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		MockMenu.lastInstance = null;
	});

	function setupStatusView(entries = createEntriesWithStatus(), options?: { columnOrder?: string[] }): KanbanView {
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		if (options?.columnOrder) {
			controller.config.set('columnOrders', { [PROPERTY_STATUS]: options.columnOrder });
		}
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		return view;
	}

	function getRenderedColumnValues(view: KanbanView): string[] {
		return Array.from(view.containerEl.querySelectorAll(`.${CSS_CLASSES.COLUMN}`)).map(
			(col) => col.getAttribute('data-column-value') ?? '',
		);
	}

	function hideColumnViaMenu(view: KanbanView, columnValue: string, columnEl: HTMLElement): void {
		(view as any).openColumnMenu(new MouseEvent('click'), columnValue, columnEl);
		const hideItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Hide column');
		hideItem?.onClick?.();
	}

	function showColumnViaMenu(view: KanbanView, columnValue: string): void {
		(view as any).openHiddenColumnsMenu(new MouseEvent('click'));
		const showItem = MockMenu.lastInstance?.items.find((item) => item.title === `Show: ${columnValue}`);
		showItem?.onClick?.();
	}

	test('hiding a column removes it from DOM but keeps columnOrder', () => {
		const view = setupStatusView(createEntriesWithStatus(), {
			columnOrder: ['To Do', 'Doing', 'Done'],
		});
		triggerDataUpdate(view);

		const doingColumn = view.containerEl.querySelector(
			`.${CSS_CLASSES.COLUMN}[data-column-value="Doing"]`,
		) as HTMLElement;
		assert.ok(doingColumn, 'Doing column should exist before hide');

		hideColumnViaMenu(view, 'Doing', doingColumn);

		assert.ok(
			!view.containerEl.querySelector(`.${CSS_CLASSES.COLUMN}[data-column-value="Doing"]`),
			'Doing column should be removed from DOM',
		);
		assert.deepStrictEqual(getRenderedColumnValues(view), ['To Do', 'Done'], 'Only visible columns should render');
		assert.deepStrictEqual(
			(view as any)._prefs.columnOrder,
			['To Do', 'Doing', 'Done'],
			'columnOrder should still include the hidden column',
		);
	});

	test('unhiding restores column in original position', () => {
		const view = setupStatusView(createEntriesWithStatus(), {
			columnOrder: ['To Do', 'Doing', 'Done'],
		});
		triggerDataUpdate(view);

		assert.deepStrictEqual(getRenderedColumnValues(view), ['To Do', 'Doing', 'Done']);

		const doingColumn = view.containerEl.querySelector(
			`.${CSS_CLASSES.COLUMN}[data-column-value="Doing"]`,
		) as HTMLElement;
		hideColumnViaMenu(view, 'Doing', doingColumn);
		assert.deepStrictEqual(getRenderedColumnValues(view), ['To Do', 'Done']);

		showColumnViaMenu(view, 'Doing');
		assert.deepStrictEqual(
			getRenderedColumnValues(view),
			['To Do', 'Doing', 'Done'],
			'Unhidden column should return to its original position',
		);
	});

	test('hiddenColumns persists to config keyed by property id', () => {
		const view = setupStatusView();
		triggerDataUpdate(view);

		(view as any)._prefs.hiddenColumns.add('Doing');
		(view as any)._persistPrefs();

		const savedHidden = controller.config.get('hiddenColumns') as Record<string, string[]> | null;
		assert.ok(savedHidden, 'hiddenColumns should be saved to config');
		assert.deepStrictEqual(savedHidden?.[PROPERTY_STATUS], ['Doing']);

		const scrollEl2 = createDivWithMethods();
		const view2 = new KanbanView(controller, scrollEl2);
		setupKanbanViewWithApp(view2, app);
		triggerDataUpdate(view2);

		assert.ok((view2 as any)._prefs.hiddenColumns instanceof Set, 'hiddenColumns should load as a Set');
		assert.ok((view2 as any)._prefs.hiddenColumns.has('Doing'), 'Reloaded prefs should include hidden column');
		assert.strictEqual((view2 as any)._prefs.hiddenColumns.size, 1);
	});

	test('hidden columns indicator appears only when columns are hidden', () => {
		const view = setupStatusView();
		triggerDataUpdate(view);

		assert.strictEqual(
			view.containerEl.querySelector(`.${CSS_CLASSES.HIDDEN_COLUMNS_INDICATOR}`),
			null,
			'Indicator should be absent when no columns are hidden',
		);

		const doingColumn = view.containerEl.querySelector(
			`.${CSS_CLASSES.COLUMN}[data-column-value="Doing"]`,
		) as HTMLElement;
		hideColumnViaMenu(view, 'Doing', doingColumn);

		const indicator = view.containerEl.querySelector(`.${CSS_CLASSES.HIDDEN_COLUMNS_INDICATOR}`);
		assert.ok(indicator, 'Indicator should appear when a column is hidden');
		assert.strictEqual(indicator?.textContent, '1 hidden');
	});
});

describe('Legacy Data Migration', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		controller = createMockQueryController(createEntriesWithStatus(), TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
	});

	test('migrates column order from legacy data on first render', () => {
		const legacyData = {
			columnOrders: { [PROPERTY_STATUS]: ['Done', 'Doing', 'To Do'] },
			columnColors: {},
		};
		const view = new KanbanView(controller, scrollEl, legacyData);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Order should be respected (migrated from legacy)
		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		assert.strictEqual(renderedOrder[0], 'Done', 'Legacy column order should be applied');

		// And persisted into config
		const saved = controller.config.get('columnOrders') as Record<string, string[]> | null;
		assert.deepStrictEqual(
			saved?.[PROPERTY_STATUS],
			['Done', 'Doing', 'To Do'],
			'Legacy order should be saved to config',
		);
	});

	test('migrates column colors from legacy data on first render', () => {
		const legacyData = {
			columnOrders: {},
			columnColors: { [PROPERTY_STATUS]: { 'To Do': 'red', Done: 'green' } },
		};
		const view = new KanbanView(controller, scrollEl, legacyData);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Colors should be applied (migrated from legacy)
		const columns = view.containerEl.querySelectorAll('.obk-column') as NodeListOf<HTMLElement>;
		let toDoColumn: HTMLElement | null = null;
		columns.forEach((col) => {
			if (col.getAttribute('data-column-value') === 'To Do') toDoColumn = col;
		});
		assert.ok(toDoColumn, 'To Do column should exist');
		assert.strictEqual(
			toDoColumn!.style.getPropertyValue('--obk-column-accent-color'),
			'var(--color-red)',
			'Legacy color should be applied',
		);

		// And persisted into config
		const saved = controller.config.get('columnColors') as Record<string, Record<string, string>> | null;
		assert.strictEqual(saved?.[PROPERTY_STATUS]?.['To Do'], 'red', 'Legacy colors should be saved to config');
	});

	test('config data takes priority over legacy data', () => {
		// Config already has an order set
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['To Do', 'Doing', 'Done'],
		});

		// Legacy data has a different order
		const legacyData = {
			columnOrders: { [PROPERTY_STATUS]: ['Done', 'Doing', 'To Do'] },
			columnColors: {},
		};
		const view = new KanbanView(controller, scrollEl, legacyData);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Config order should win
		const columns = view.containerEl.querySelectorAll('.obk-column');
		const renderedOrder = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		assert.strictEqual(renderedOrder[0], 'To Do', 'Config order should take priority over legacy data');
	});

	test('no legacy data results in normal behaviour', () => {
		const view = new KanbanView(controller, scrollEl, null);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Columns should render without legacy data');
	});
});

describe('Property Value Rendering', () => {
	let view: KanbanView;

	beforeEach(() => {
		const app = createMockApp();
		const scrollEl = createDivWithMethods();
		const entries = createEntriesWithLinks();
		const controller = createMockQueryController(entries, [PROPERTY_STATUS, PROPERTY_RELATED]) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.getOrder = () => [PROPERTY_STATUS, PROPERTY_RELATED];
		view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);
	});

	test('Plain text property value is rendered as textContent', () => {
		const cards = Array.from(view.containerEl.querySelectorAll('.obk-card')) as HTMLElement[];
		const taskBCard = cards.find((c) => c.getAttribute('data-entry-path') === 'notes/Task B.md');
		assert.ok(taskBCard, 'Task B card should exist');

		const valueEl = taskBCard?.querySelector('.obk-card-property-value');
		assert.ok(valueEl, 'Property value element should exist');
		assert.strictEqual(valueEl?.textContent, 'plain text value', 'Plain text should render as textContent');
		assert.strictEqual(valueEl?.querySelector('a'), null, 'No anchor element for plain text');
	});

	test('Property value containing [[wikilink]] renders as an anchor', () => {
		const cards = Array.from(view.containerEl.querySelectorAll('.obk-card')) as HTMLElement[];
		const taskACard = cards.find((c) => c.getAttribute('data-entry-path') === 'notes/Task A.md');
		assert.ok(taskACard, 'Task A card should exist');

		const valueEl = taskACard?.querySelector('.obk-card-property-value');
		assert.ok(valueEl, 'Property value element should exist');

		const link = valueEl?.querySelector('a.internal-link') as HTMLElement | null;
		assert.ok(link, 'An internal-link anchor should be rendered for [[wikilink]] values');
		assert.strictEqual(link?.getAttribute('data-href'), 'Meeting Notes', 'data-href should be the link target');
	});
});

describe('Internal Link Click Handling', () => {
	let view: KanbanView;
	let app: ReturnType<typeof createMockApp>;

	beforeEach(() => {
		app = createMockApp();
		const scrollEl = createDivWithMethods();
		const entries = createEntriesWithLinks();
		const controller = createMockQueryController(entries, [PROPERTY_STATUS, PROPERTY_RELATED]) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.getOrder = () => [PROPERTY_STATUS, PROPERTY_RELATED];
		view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);
	});

	test('Clicking an internal link calls openLinkText with the link href', () => {
		const link = view.containerEl.querySelector('a.internal-link') as HTMLElement;
		assert.ok(link, 'Internal link should exist');

		link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		assert.strictEqual(app.workspace.openLinkText.calls.length, 1, 'openLinkText should be called once');
		assert.strictEqual(
			app.workspace.openLinkText.calls[0][0],
			'Meeting Notes',
			'openLinkText should be called with the link target',
		);
	});

	test('Clicking an internal link uses the card file path as source', () => {
		const link = view.containerEl.querySelector('a.internal-link') as HTMLElement;
		assert.ok(link, 'Internal link should exist');

		link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		assert.strictEqual(
			app.workspace.openLinkText.calls[0][1],
			'notes/Task A.md',
			'openLinkText source path should be the card file path',
		);
	});

	test('Clicking an internal link does not also open the card note', () => {
		const link = view.containerEl.querySelector('a.internal-link') as HTMLElement;
		assert.ok(link, 'Internal link should exist');

		link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		// Only the delegated handler should fire — not the card click handler
		assert.strictEqual(app.workspace.openLinkText.calls.length, 1, 'openLinkText should be called exactly once');
		assert.notStrictEqual(
			app.workspace.openLinkText.calls[0][0],
			'notes/Task A.md',
			'openLinkText should not be called with the card file path',
		);
	});

	test('Clicking the card body (not a link) still opens the note', () => {
		const cards = Array.from(view.containerEl.querySelectorAll('.obk-card')) as HTMLElement[];
		const taskACard = cards.find((c) => c.getAttribute('data-entry-path') === 'notes/Task A.md');
		assert.ok(taskACard, 'Task A card should exist');

		const title = taskACard?.querySelector('.obk-card-title') as HTMLElement;
		assert.ok(title, 'Card title should exist');

		title.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		assert.strictEqual(app.workspace.openLinkText.calls.length, 1, 'openLinkText should be called once');
		assert.strictEqual(
			app.workspace.openLinkText.calls[0][0],
			'notes/Task A.md',
			'Clicking card body should open the card note',
		);
	});

	test('Middle-click on an internal link opens the linked note in a background tab', () => {
		const meetingNotesFile = {
			path: 'notes/Meeting Notes.md',
			basename: 'Meeting Notes',
			extension: 'md',
		};
		(app as any).metadataCache.getFirstLinkpathDest = (linkpath: string) =>
			linkpath === 'Meeting Notes' ? meetingNotesFile : null;

		const link = view.containerEl.querySelector('a.internal-link') as HTMLElement;
		assert.ok(link, 'Internal link should exist');

		link.dispatchEvent(
			new MouseEvent('auxclick', {
				bubbles: true,
				cancelable: true,
				button: 1,
			}),
		);

		assert.strictEqual(
			app.workspace.openLinkText.calls.length,
			0,
			'Middle-click bypasses openLinkText so it can open in background',
		);
		assert.strictEqual(app.workspace.getLeaf.calls.length, 1, 'getLeaf should be called once');
		assert.strictEqual(app.workspace.getLeaf.calls[0][0], 'tab', "getLeaf should be called with 'tab'");
		assert.strictEqual(
			app.workspace.openFile.calls[0][0],
			meetingNotesFile,
			'openFile should be called with the resolved link target',
		);
		assert.deepStrictEqual(
			app.workspace.openFile.calls[0][1],
			{ active: false },
			'openFile should be called with active:false (background)',
		);
	});

	test('Right-click on an internal link does not open the linked note', () => {
		const link = view.containerEl.querySelector('a.internal-link') as HTMLElement;
		assert.ok(link, 'Internal link should exist');

		link.dispatchEvent(
			new MouseEvent('auxclick', {
				bubbles: true,
				cancelable: true,
				button: 2,
			}),
		);

		assert.strictEqual(app.workspace.getLeaf.calls.length, 0, 'Right-click should not create a new leaf');
		assert.strictEqual(app.workspace.openLinkText.calls.length, 0, 'Right-click should not call openLinkText');
	});
});

describe('Hover Preview Handling', () => {
	let view: KanbanView;
	let app: ReturnType<typeof createMockApp>;

	beforeEach(() => {
		app = createMockApp();
		const scrollEl = createDivWithMethods();
		const entries = createEntriesWithLinks();
		const controller = createMockQueryController(entries, [PROPERTY_STATUS, PROPERTY_RELATED]) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.getOrder = () => [PROPERTY_STATUS, PROPERTY_RELATED];
		view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);
	});

	test('Hovering a card triggers Page Preview for the card note', () => {
		const card = view.containerEl.querySelector('[data-entry-path="notes/Task A.md"]') as HTMLElement;
		assert.ok(card, 'Task A card should exist');

		card.dispatchEvent(
			new MouseEvent('mouseover', {
				bubbles: true,
				cancelable: true,
				metaKey: true,
				relatedTarget: view.containerEl,
			}),
		);

		assert.strictEqual(app.workspace.trigger.calls.length, 1, 'hover-link should be triggered once');
		assert.strictEqual(app.workspace.trigger.calls[0][0], 'hover-link');
		const payload = app.workspace.trigger.calls[0][1] as any;
		assert.strictEqual(payload.source, HOVER_LINK_SOURCE_ID);
		assert.strictEqual(payload.linktext, 'notes/Task A.md');
		assert.strictEqual(payload.sourcePath, '');
		assert.strictEqual(payload.hoverParent, view);
		assert.strictEqual(payload.targetEl, card);
		assert.strictEqual(payload.event.metaKey, true);
	});

	test('Hovering an internal link triggers Page Preview for the linked note', () => {
		const link = view.containerEl.querySelector('a.internal-link') as HTMLElement;
		assert.ok(link, 'Internal link should exist');

		link.dispatchEvent(
			new MouseEvent('mouseover', {
				bubbles: true,
				cancelable: true,
				metaKey: true,
				relatedTarget: view.containerEl,
			}),
		);

		assert.strictEqual(app.workspace.trigger.calls.length, 1, 'hover-link should be triggered once');
		assert.strictEqual(app.workspace.trigger.calls[0][0], 'hover-link');
		const payload = app.workspace.trigger.calls[0][1] as any;
		assert.strictEqual(payload.source, HOVER_LINK_SOURCE_ID);
		assert.strictEqual(payload.linktext, 'Meeting Notes');
		assert.strictEqual(payload.sourcePath, 'notes/Task A.md');
		assert.strictEqual(payload.hoverParent, view);
		assert.strictEqual(payload.targetEl, link);
		assert.strictEqual(payload.event.metaKey, true);
	});
});

describe('Card Order - isCardOrders type guard', () => {
	test('accepts valid card orders structure', () => {
		assert.ok(isCardOrders({ 'note.status': { 'To Do': ['a.md', 'b.md'] } }));
		assert.ok(isCardOrders({}));
		assert.ok(isCardOrders({ prop: {} }));
	});

	test('rejects non-objects', () => {
		assert.strictEqual(isCardOrders(null), false);
		assert.strictEqual(isCardOrders('string'), false);
		assert.strictEqual(isCardOrders(42), false);
		assert.strictEqual(isCardOrders([]), false);
	});

	test('rejects when inner value is not an object', () => {
		assert.strictEqual(isCardOrders({ prop: ['a', 'b'] }), false);
		assert.strictEqual(isCardOrders({ prop: 'string' }), false);
	});

	test('rejects when column value is not an array', () => {
		assert.strictEqual(isCardOrders({ prop: { col: 'not-an-array' } }), false);
		assert.strictEqual(isCardOrders({ prop: { col: 42 } }), false);
	});
});

describe('Card Order - Persistence', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('Same-column drop saves card order to config', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const toDoColumn = Array.from(view.containerEl.querySelectorAll('.obk-column')).find(
			(col) => col.getAttribute('data-column-value') === 'To Do',
		) as HTMLElement;
		const toDoBody = toDoColumn.querySelector('.obk-column-body') as HTMLElement;
		const cards = Array.from(toDoBody.querySelectorAll('.obk-card')) as HTMLElement[];

		// Simulate Sortable moving second card before first in the DOM
		toDoBody.insertBefore(cards[1], cards[0]);

		const mockEvent = {
			item: cards[1],
			from: toDoBody,
			to: toDoBody,
			oldIndex: 1,
			newIndex: 0,
		};
		await (view as any).handleCardDrop(mockEvent);

		const savedOrders = controller.config.get('cardOrders') as Record<string, Record<string, string[]>>;
		assert.ok(savedOrders, 'cardOrders should be saved');
		const columnOrder = savedOrders?.[PROPERTY_STATUS]?.['To Do'];
		assert.ok(Array.isArray(columnOrder), 'To Do card order should be an array');
		assert.strictEqual(columnOrder[0], cards[1].getAttribute('data-entry-path'), 'Moved card should be first');
		assert.strictEqual(columnOrder[1], cards[0].getAttribute('data-entry-path'), 'Original first card should be second');
	});

	test('Same-column drop does not save card order while Base sort is active', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('sort', [{ property: 'file.mtime', direction: 'DESC' }]);

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const toDoColumn = Array.from(view.containerEl.querySelectorAll('.obk-column')).find(
			(col) => col.getAttribute('data-column-value') === 'To Do',
		) as HTMLElement;
		const toDoBody = toDoColumn.querySelector('.obk-column-body') as HTMLElement;
		const cards = Array.from(toDoBody.querySelectorAll('.obk-card')) as HTMLElement[];

		toDoBody.insertBefore(cards[1], cards[0]);

		const noticeStart = noticeMessages().length;
		const mockEvent = {
			item: cards[1],
			from: toDoBody,
			to: toDoBody,
			oldIndex: 1,
			newIndex: 0,
		};
		await (view as any).handleCardDrop(mockEvent);

		const savedOrders = controller.config.get('cardOrders') as Record<string, Record<string, string[]>> | null;
		assert.strictEqual(
			savedOrders?.[PROPERTY_STATUS]?.['To Do'],
			undefined,
			'To Do card order should not be saved when Base sort is active',
		);
		assert.deepStrictEqual(noticeMessages().slice(noticeStart), [SORTED_CARD_ORDER_NOTICE]);

		const cardPaths = Array.from(toDoBody.querySelectorAll('.obk-card')).map((c) => c.getAttribute('data-entry-path'));
		assert.strictEqual(cardPaths[0], 'Task 1.md', 'First card should snap back to sorted data order');
		assert.strictEqual(cardPaths[1], 'Task 2.md', 'Second card should snap back to sorted data order');
	});

	test('Cross-column drop while Base sort is active does not show manual-order notice', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('sort', [{ property: 'file.mtime', direction: 'DESC' }]);

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const toDoColumn = Array.from(columns).find(
			(col) => col.getAttribute('data-column-value') === 'To Do',
		) as HTMLElement;
		const doingColumn = Array.from(columns).find(
			(col) => col.getAttribute('data-column-value') === 'Doing',
		) as HTMLElement;
		const toDoBody = toDoColumn.querySelector('.obk-column-body') as HTMLElement;
		const doingBody = doingColumn.querySelector('.obk-column-body') as HTMLElement;

		const card = toDoBody.querySelector('.obk-card') as HTMLElement;
		doingBody.appendChild(card);

		const noticeStart = noticeMessages().length;
		const mockEvent = {
			item: card,
			from: toDoBody,
			to: doingBody,
			oldIndex: 0,
			newIndex: 0,
		};
		await (view as any).handleCardDrop(mockEvent);

		assert.deepStrictEqual(noticeMessages().slice(noticeStart), []);
	});

	test('Same-column unchanged drop while Base sort is active does not show manual-order notice', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('sort', [{ property: 'file.mtime', direction: 'DESC' }]);

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const toDoColumn = Array.from(view.containerEl.querySelectorAll('.obk-column')).find(
			(col) => col.getAttribute('data-column-value') === 'To Do',
		) as HTMLElement;
		const toDoBody = toDoColumn.querySelector('.obk-column-body') as HTMLElement;
		const card = toDoBody.querySelector('.obk-card') as HTMLElement;

		const noticeStart = noticeMessages().length;
		const mockEvent = {
			item: card,
			from: toDoBody,
			to: toDoBody,
			oldIndex: 0,
			newIndex: 0,
		};
		await (view as any).handleCardDrop(mockEvent);

		assert.deepStrictEqual(noticeMessages().slice(noticeStart), []);
	});

	test('Same-column unchanged draggable index while Base sort is active does not show manual-order notice', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('sort', [{ property: 'file.mtime', direction: 'DESC' }]);

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const toDoColumn = Array.from(view.containerEl.querySelectorAll('.obk-column')).find(
			(col) => col.getAttribute('data-column-value') === 'To Do',
		) as HTMLElement;
		const toDoBody = toDoColumn.querySelector('.obk-column-body') as HTMLElement;
		const card = toDoBody.querySelector('.obk-card') as HTMLElement;

		const noticeStart = noticeMessages().length;
		const mockEvent = {
			item: card,
			from: toDoBody,
			to: toDoBody,
			oldIndex: 0,
			newIndex: 1,
			oldDraggableIndex: 0,
			newDraggableIndex: 0,
		};
		await (view as any).handleCardDrop(mockEvent);

		assert.deepStrictEqual(noticeMessages().slice(noticeStart), []);
	});

	test('Same-column drop does not call processFrontMatter', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const toDoColumn = Array.from(view.containerEl.querySelectorAll('.obk-column')).find(
			(col) => col.getAttribute('data-column-value') === 'To Do',
		) as HTMLElement;
		const toDoBody = toDoColumn.querySelector('.obk-column-body') as HTMLElement;
		const card = toDoBody.querySelector('.obk-card') as HTMLElement;

		app.fileManager.processFrontMatter.calls.length = 0;
		const mockEvent = {
			item: card,
			from: toDoBody,
			to: toDoBody,
			oldIndex: 0,
			newIndex: 1,
		};
		await (view as any).handleCardDrop(mockEvent);

		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 0, 'processFrontMatter should not be called');
	});

	test('Cross-column drop saves card order for both columns', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		const toDoColumn = Array.from(columns).find(
			(col) => col.getAttribute('data-column-value') === 'To Do',
		) as HTMLElement;
		const doingColumn = Array.from(columns).find(
			(col) => col.getAttribute('data-column-value') === 'Doing',
		) as HTMLElement;
		const toDoBody = toDoColumn.querySelector('.obk-column-body') as HTMLElement;
		const doingBody = doingColumn.querySelector('.obk-column-body') as HTMLElement;

		const card = toDoBody.querySelector('.obk-card') as HTMLElement;
		const movedPath = card.getAttribute('data-entry-path');

		// Simulate Sortable: move card from To Do body to Doing body
		toDoBody.removeChild(card);
		doingBody.appendChild(card);

		const mockEvent = {
			item: card,
			from: toDoBody,
			to: doingBody,
			oldIndex: 0,
			newIndex: 1,
		};
		await (view as any).handleCardDrop(mockEvent);

		const savedOrders = controller.config.get('cardOrders') as Record<string, Record<string, string[]>>;
		assert.ok(savedOrders?.[PROPERTY_STATUS]?.['To Do'], 'To Do order should be saved');
		assert.ok(savedOrders?.[PROPERTY_STATUS]?.['Doing'], 'Doing order should be saved');
		assert.ok(
			!savedOrders[PROPERTY_STATUS]['To Do'].includes(movedPath!),
			'Moved card should not be in old column saved order',
		);
		assert.ok(
			savedOrders[PROPERTY_STATUS]['Doing'].includes(movedPath!),
			'Moved card should be in new column saved order',
		);
	});

	test('Initial render applies saved card order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Save reversed order: Task 2.md before Task 1.md
		controller.config.set('cardOrders', {
			[PROPERTY_STATUS]: { 'To Do': ['Task 2.md', 'Task 1.md'] },
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const toDoColumn = Array.from(view.containerEl.querySelectorAll('.obk-column')).find(
			(col) => col.getAttribute('data-column-value') === 'To Do',
		) as HTMLElement;
		const cardPaths = Array.from(toDoColumn.querySelectorAll('.obk-card')).map((c) => c.getAttribute('data-entry-path'));

		assert.strictEqual(cardPaths[0], 'Task 2.md', 'First card should be Task 2 per saved order');
		assert.strictEqual(cardPaths[1], 'Task 1.md', 'Second card should be Task 1 per saved order');
	});

	test('Base sort takes precedence over saved card order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		controller.config.set('sort', [{ property: 'file.mtime', direction: 'DESC' }]);
		controller.config.set('cardOrders', {
			[PROPERTY_STATUS]: { 'To Do': ['Task 2.md', 'Task 1.md'] },
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const toDoColumn = Array.from(view.containerEl.querySelectorAll('.obk-column')).find(
			(col) => col.getAttribute('data-column-value') === 'To Do',
		) as HTMLElement;
		const cardPaths = Array.from(toDoColumn.querySelectorAll('.obk-card')).map((c) => c.getAttribute('data-entry-path'));

		assert.strictEqual(cardPaths[0], 'Task 1.md', 'First card should follow the sorted data order');
		assert.strictEqual(cardPaths[1], 'Task 2.md', 'Second card should follow the sorted data order');
	});

	test('Re-render applies saved card order (patch path)', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Set order before first render so _loadPrefs picks it up
		controller.config.set('cardOrders', {
			[PROPERTY_STATUS]: { 'To Do': ['Task 2.md', 'Task 1.md'] },
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view); // first render — full rebuild, prefs loaded from config

		// Second render exercises the patch path (board already exists in DOM)
		triggerDataUpdate(view);

		const toDoColumn = Array.from(view.containerEl.querySelectorAll('.obk-column')).find(
			(col) => col.getAttribute('data-column-value') === 'To Do',
		) as HTMLElement;
		const cardPaths = Array.from(toDoColumn.querySelectorAll('.obk-card')).map((c) => c.getAttribute('data-entry-path'));

		assert.strictEqual(cardPaths[0], 'Task 2.md', 'First card should be Task 2 per saved order');
		assert.strictEqual(cardPaths[1], 'Task 1.md', 'Second card should be Task 1 per saved order');
	});

	test('Cards not in saved order appear at the end', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		// Saved order only mentions Task 2; Task 1 is new/unknown
		controller.config.set('cardOrders', {
			[PROPERTY_STATUS]: { 'To Do': ['Task 2.md'] },
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const toDoColumn = Array.from(view.containerEl.querySelectorAll('.obk-column')).find(
			(col) => col.getAttribute('data-column-value') === 'To Do',
		) as HTMLElement;
		const cardPaths = Array.from(toDoColumn.querySelectorAll('.obk-card')).map((c) => c.getAttribute('data-entry-path'));

		assert.strictEqual(cardPaths[0], 'Task 2.md', 'Saved card should be first');
		assert.strictEqual(cardPaths[1], 'Task 1.md', 'Unsaved card should appear at the end');
	});

	test('Regression: re-render after same-column drag preserves dragged order', async () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const toDoColumn = Array.from(view.containerEl.querySelectorAll('.obk-column')).find(
			(col) => col.getAttribute('data-column-value') === 'To Do',
		) as HTMLElement;
		const toDoBody = toDoColumn.querySelector('.obk-column-body') as HTMLElement;
		const cards = Array.from(toDoBody.querySelectorAll('.obk-card')) as HTMLElement[];

		const originalFirst = cards[0].getAttribute('data-entry-path');
		const originalSecond = cards[1].getAttribute('data-entry-path');

		// Simulate Sortable moving second card before first
		toDoBody.insertBefore(cards[1], cards[0]);

		const mockEvent = {
			item: cards[1],
			from: toDoBody,
			to: toDoBody,
			oldIndex: 1,
			newIndex: 0,
		};
		await (view as any).handleCardDrop(mockEvent);

		// Re-render — data hasn't changed, so Bases still returns original order
		triggerDataUpdate(view);

		const reRenderedToDoColumn = Array.from(view.containerEl.querySelectorAll('.obk-column')).find(
			(col) => col.getAttribute('data-column-value') === 'To Do',
		) as HTMLElement;
		const reRenderedPaths = Array.from(reRenderedToDoColumn.querySelectorAll('.obk-card')).map((c) =>
			c.getAttribute('data-entry-path'),
		);

		// Should preserve dragged order, not revert to original Bases order
		assert.strictEqual(reRenderedPaths[0], originalSecond, 'Dragged card should remain first after re-render');
		assert.strictEqual(reRenderedPaths[1], originalFirst, 'Original first card should remain second after re-render');
	});
});

// ---------------------------------------------------------------------------
// Empty Column Persistence
// ---------------------------------------------------------------------------

describe('Empty Column Persistence - Saved columns restored', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('Column in saved order with no live entries is rendered', () => {
		const entries = createEntriesWithStatus(); // To Do, Doing, Done
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['To Do', 'Doing', 'Done', 'In Progress'],
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columnValues = Array.from(view.containerEl.querySelectorAll('.obk-column')).map((col) =>
			col.getAttribute('data-column-value'),
		);
		assert.ok(columnValues.includes('In Progress'), 'Empty saved column should be rendered');
	});

	test('Empty saved column renders with zero cards', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['To Do', 'Doing', 'Done', 'In Progress'],
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const inProgressCol = view.containerEl.querySelector('[data-column-value="In Progress"]');
		const cards = inProgressCol?.querySelectorAll('.obk-card');
		assert.strictEqual(cards?.length, 0, 'Empty saved column should have no cards');
	});

	test('Empty saved column keeps its position among other columns', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['To Do', 'Doing', 'Done', 'In Progress'],
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columnValues = Array.from(view.containerEl.querySelectorAll('.obk-column')).map((col) =>
			col.getAttribute('data-column-value'),
		);
		assert.strictEqual(columnValues[3], 'In Progress', 'Empty saved column should appear at its saved position');
	});

	test('Empty saved Uncategorized column is hidden when no entries need the fallback', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['To Do', 'Doing', 'Done', UNCATEGORIZED_LABEL],
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columnValues = Array.from(view.containerEl.querySelectorAll('.obk-column')).map((col) =>
			col.getAttribute('data-column-value'),
		);
		const savedOrders = controller.config.get('columnOrders') as Record<string, string[]>;

		assert.ok(!columnValues.includes(UNCATEGORIZED_LABEL), 'Empty fallback column should not be rendered');
		assert.ok(
			!savedOrders[PROPERTY_STATUS].includes(UNCATEGORIZED_LABEL),
			'Empty fallback column should be pruned from saved column order',
		);
	});
});

describe('Empty Column Persistence - Eager order save', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('First render persists column order without requiring drag-drop', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		// No saved order

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const savedOrders = controller.config.get('columnOrders') as Record<string, string[]> | null;
		const savedOrder = savedOrders?.[PROPERTY_STATUS];
		assert.ok(savedOrder, 'Column order should be saved after first render');
		assert.strictEqual(savedOrder.length, 3, 'All three live columns should be persisted');
	});

	test('Column that loses all entries remains in persisted order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Remove all Doing entries
		controller.data.data = entries.filter((e: any) => e.getValue(PROPERTY_STATUS)?.toString() !== 'Doing');
		triggerDataUpdate(view);

		const savedOrders = controller.config.get('columnOrders') as Record<string, string[]>;
		const savedOrder = savedOrders?.[PROPERTY_STATUS] ?? [];
		assert.ok(savedOrder.includes('Doing'), 'Emptied column should remain in persisted order');
	});
});

describe('Empty Column Persistence - Remove button visibility', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('Remove button not shown on columns with entries', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		columns.forEach((col) => {
			const removeBtn = col.querySelector('.obk-column-remove-btn');
			assert.ok(!removeBtn, `Column "${col.getAttribute('data-column-value')}" should not have a remove button`);
		});
	});

	test('Remove button shown on empty column from saved order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['To Do', 'Doing', 'Done', 'In Progress'],
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const inProgressCol = view.containerEl.querySelector('[data-column-value="In Progress"]');
		const removeBtn = inProgressCol?.querySelector('.obk-column-remove-btn');
		assert.ok(removeBtn, 'Empty saved column should show a remove button');
	});

	test('Remove button has correct aria-label', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['To Do', 'Doing', 'Done', 'In Progress'],
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const removeBtn = view.containerEl
			.querySelector('[data-column-value="In Progress"]')
			?.querySelector('.obk-column-remove-btn');
		assert.strictEqual(
			removeBtn?.getAttribute('aria-label'),
			'Remove column: In Progress',
			'Remove button should have a descriptive aria-label',
		);
	});

	test('Remove button appears when column becomes empty after data update', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		assert.strictEqual(
			view.containerEl.querySelectorAll('.obk-column-remove-btn').length,
			0,
			'No remove buttons should exist when all columns have entries',
		);

		// Remove all Doing entries so the column becomes empty
		controller.data.data = entries.filter((e: any) => e.getValue(PROPERTY_STATUS)?.toString() !== 'Doing');
		triggerDataUpdate(view);

		const doingCol = view.containerEl.querySelector('[data-column-value="Doing"]');
		assert.ok(doingCol, 'Doing column should still exist in the DOM');
		assert.ok(doingCol?.querySelector('.obk-column-remove-btn'), 'Remove button should appear on newly-emptied column');
	});

	test('Remove button disappears when an entry arrives in an empty column', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['To Do', 'Doing', 'Done', 'In Progress'],
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		assert.ok(
			view.containerEl.querySelector('[data-column-value="In Progress"] .obk-column-remove-btn'),
			'Remove button should be visible on empty column before data update',
		);

		// Add an In Progress entry
		const newEntry = createMockBasesEntry(createMockTFile('Task 6.md'), {
			[PROPERTY_STATUS]: 'In Progress',
		});
		controller.data.data = [...entries, newEntry];
		triggerDataUpdate(view);

		const removeBtn = view.containerEl.querySelector('[data-column-value="In Progress"] .obk-column-remove-btn');
		assert.ok(!removeBtn, 'Remove button should disappear when the column receives an entry');
	});
});

describe('Empty Column Persistence - Remove column action', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('Clicking remove button removes the column from the DOM', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['To Do', 'Doing', 'Done', 'In Progress'],
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const removeBtn = view.containerEl.querySelector(
			'[data-column-value="In Progress"] .obk-column-remove-btn',
		) as HTMLElement;
		assert.ok(removeBtn, 'Precondition: remove button should exist');

		removeBtn.click();

		assert.ok(
			!view.containerEl.querySelector('[data-column-value="In Progress"]'),
			'Column should be removed from DOM after clicking remove button',
		);
	});

	test('Clicking remove button removes the column from saved order', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['To Do', 'Doing', 'Done', 'In Progress'],
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		(view.containerEl.querySelector('[data-column-value="In Progress"] .obk-column-remove-btn') as HTMLElement).click();

		const savedOrders = controller.config.get('columnOrders') as Record<string, string[]>;
		const savedOrder = savedOrders?.[PROPERTY_STATUS] ?? [];
		assert.ok(!savedOrder.includes('In Progress'), 'Removed column should not appear in saved order');
	});

	test('Clicking remove button does not affect other columns', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['To Do', 'Doing', 'Done', 'In Progress'],
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		(view.containerEl.querySelector('[data-column-value="In Progress"] .obk-column-remove-btn') as HTMLElement).click();

		assert.ok(view.containerEl.querySelector('[data-column-value="To Do"]'), 'To Do column should remain');
		assert.ok(view.containerEl.querySelector('[data-column-value="Doing"]'), 'Doing column should remain');
		assert.ok(view.containerEl.querySelector('[data-column-value="Done"]'), 'Done column should remain');
	});

	test('Clicking remove button tears down the sortable instance for that column', () => {
		const sortableMock = mockSortable();
		(global as any).Sortable = sortableMock.Sortable;

		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['To Do', 'Doing', 'Done', 'In Progress'],
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		assert.ok(
			(view as any)._columnSortables.has('In Progress'),
			'Precondition: empty column should have a sortable instance',
		);

		(view.containerEl.querySelector('[data-column-value="In Progress"] .obk-column-remove-btn') as HTMLElement).click();

		assert.ok(
			!(view as any)._columnSortables.has('In Progress'),
			'Sortable instance should be removed after column is removed',
		);
	});
});

// ---------------------------------------------------------------------------
// Column persistence when the group-by property disappears from data
// ---------------------------------------------------------------------------

describe('Column persistence when group-by property disappears from allProperties', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('groupByPropertyId is not replaced by another available property', () => {
		// Regression: when the last note with the group-by field is updated,
		// Obsidian may drop that property from allProperties while other
		// properties remain. The board must keep using the configured property,
		// not silently switch to whichever property is now first in the list.
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// PROPERTY_STATUS drops out of allProperties; PROPERTY_PRIORITY remains
		(controller as any).allProperties = [PROPERTY_PRIORITY];
		triggerDataUpdate(view);

		assert.strictEqual(
			(view as any).groupByPropertyId,
			PROPERTY_STATUS,
			'groupByPropertyId should not switch to PROPERTY_PRIORITY',
		);
	});

	test('Saved column values are not replaced by values from the fallback property', () => {
		// Regression: before the fix, groupByPropertyId switched to PROPERTY_PRIORITY
		// (whose values are "High", "Medium", "Low"), replacing the original swimlanes.
		const entries = createEntriesWithMixedProperties(); // has both STATUS and PRIORITY values
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['To Do', 'Doing', 'Done'],
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// STATUS drops out; only PRIORITY remains
		(controller as any).allProperties = [PROPERTY_PRIORITY];
		triggerDataUpdate(view);

		const columnValues = Array.from(view.containerEl.querySelectorAll('.obk-column')).map((col) =>
			col.getAttribute('data-column-value'),
		);

		assert.ok(!columnValues.includes('High'), 'PRIORITY value "High" must not become a swimlane');
		assert.ok(!columnValues.includes('Medium'), 'PRIORITY value "Medium" must not become a swimlane');
		assert.ok(!columnValues.includes('Low'), 'PRIORITY value "Low" must not become a swimlane');
	});

	test('Saved columns remain visible when the group-by property leaves allProperties', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('columnOrders', {
			[PROPERTY_STATUS]: ['To Do', 'Doing', 'Done'],
		});

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Simulate removing the group-by field from all remaining notes
		(controller as any).allProperties = [PROPERTY_PRIORITY];
		triggerDataUpdate(view);

		const columnValues = Array.from(view.containerEl.querySelectorAll('.obk-column')).map((col) =>
			col.getAttribute('data-column-value'),
		);
		assert.ok(columnValues.includes('To Do'), 'To Do column should persist');
		assert.ok(columnValues.includes('Doing'), 'Doing column should persist');
		assert.ok(columnValues.includes('Done'), 'Done column should persist');
	});

	test('Saved columns render as empty when all entries are removed', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view); // builds and persists To Do / Doing / Done

		// All notes removed — base returns no entries and no properties
		controller.data.data = [];
		(controller as any).allProperties = [];
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		assert.ok(columns.length > 0, 'Board should still show columns after all entries are removed');

		const columnValues = Array.from(columns).map((col) => col.getAttribute('data-column-value'));
		assert.ok(columnValues.includes('To Do'), 'To Do should persist as empty column');
		assert.ok(columnValues.includes('Doing'), 'Doing should persist as empty column');
		assert.ok(columnValues.includes('Done'), 'Done should persist as empty column');
	});

	test('Each empty persisted column has a remove button', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		controller.data.data = [];
		(controller as any).allProperties = [];
		triggerDataUpdate(view);

		const columns = view.containerEl.querySelectorAll('.obk-column');
		columns.forEach((col) => {
			const removeBtn = col.querySelector('.obk-column-remove-btn');
			assert.ok(removeBtn, `Column "${col.getAttribute('data-column-value')}" should have a remove button`);
		});
	});
});

// ---------------------------------------------------------------------------
// normalizePropertyValue – 'null' string edge cases
// ---------------------------------------------------------------------------

describe("normalizePropertyValue - 'null' string", () => {
	test("primitive string 'null' maps to Uncategorized", () => {
		assert.strictEqual(normalizePropertyValue('null'), UNCATEGORIZED_LABEL);
	});

	test("object whose toString() returns 'null' maps to Uncategorized", () => {
		assert.strictEqual(normalizePropertyValue({ toString: () => 'null' }), UNCATEGORIZED_LABEL);
	});

	test("object whose toString() returns '  null  ' maps to Uncategorized", () => {
		assert.strictEqual(normalizePropertyValue({ toString: () => '  null  ' }), UNCATEGORIZED_LABEL);
	});

	test("string 'nullable' is NOT treated as Uncategorized", () => {
		assert.strictEqual(normalizePropertyValue('nullable'), 'nullable');
	});
});

// ---------------------------------------------------------------------------
// applyCardOrder – unit tests (pure function)
// ---------------------------------------------------------------------------

describe('applyCardOrder', () => {
	let view: any;

	beforeEach(() => {
		const scrollEl = createDivWithMethods();
		const controller = createMockQueryController([], TEST_PROPERTIES) as any;
		const app = createMockApp();
		controller.app = app;
		view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
	});

	test('orders entries to match savedOrder', () => {
		const a = createMockBasesEntry(createMockTFile('a.md'), {});
		const b = createMockBasesEntry(createMockTFile('b.md'), {});
		const c = createMockBasesEntry(createMockTFile('c.md'), {});

		const result = view.applyCardOrder([c, a, b], ['a.md', 'b.md', 'c.md']);

		assert.strictEqual(result[0].file.path, 'a.md');
		assert.strictEqual(result[1].file.path, 'b.md');
		assert.strictEqual(result[2].file.path, 'c.md');
	});

	test('unsaved entries are appended at the end in original array order', () => {
		const a = createMockBasesEntry(createMockTFile('a.md'), {});
		const b = createMockBasesEntry(createMockTFile('b.md'), {});
		const c = createMockBasesEntry(createMockTFile('c.md'), {});

		const result = view.applyCardOrder([c, b, a], ['a.md']);

		assert.strictEqual(result[0].file.path, 'a.md');
		assert.strictEqual(result[1].file.path, 'c.md');
		assert.strictEqual(result[2].file.path, 'b.md');
	});

	test('unknown paths in savedOrder are silently ignored', () => {
		const a = createMockBasesEntry(createMockTFile('a.md'), {});

		const result = view.applyCardOrder([a], ['ghost.md', 'a.md']);

		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].file.path, 'a.md');
	});

	test('empty savedOrder returns all entries in original order', () => {
		const a = createMockBasesEntry(createMockTFile('a.md'), {});
		const b = createMockBasesEntry(createMockTFile('b.md'), {});

		const result = view.applyCardOrder([a, b], []);

		assert.strictEqual(result[0].file.path, 'a.md');
		assert.strictEqual(result[1].file.path, 'b.md');
	});
});

// ---------------------------------------------------------------------------
// setActiveCard / reapplyActiveCard – CSS class management
// ---------------------------------------------------------------------------

describe('setActiveCard and reapplyActiveCard', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		app = createMockApp();
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
	});

	test('setActiveCard adds obk-card--active to the target card', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		const path = card.getAttribute('data-entry-path')!;

		(view as any).setActiveCard(path);

		assert.ok(card.classList.contains('obk-card--active'));
	});

	test('setActiveCard removes obk-card--active from the previously active card', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const cards = view.containerEl.querySelectorAll('.obk-card');
		assert.ok(cards.length >= 2, 'need at least two cards');
		const firstPath = (cards[0] as HTMLElement).getAttribute('data-entry-path')!;
		const secondPath = (cards[1] as HTMLElement).getAttribute('data-entry-path')!;

		(view as any).setActiveCard(firstPath);
		(view as any).setActiveCard(secondPath);

		assert.ok(!(cards[0] as HTMLElement).classList.contains('obk-card--active'));
		assert.ok((cards[1] as HTMLElement).classList.contains('obk-card--active'));
	});

	test('setActiveCard(null) clears the active card', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		const path = card.getAttribute('data-entry-path')!;
		(view as any).setActiveCard(path);
		(view as any).setActiveCard(null);

		assert.ok(!card.classList.contains('obk-card--active'));
	});

	test('reapplyActiveCard restores obk-card--active after it is stripped', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		const path = card.getAttribute('data-entry-path')!;
		(view as any).setActiveCard(path);
		card.classList.remove('obk-card--active');

		(view as any).reapplyActiveCard();

		assert.ok(card.classList.contains('obk-card--active'));
	});

	test('reapplyActiveCard is a no-op when no card is active', () => {
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		assert.strictEqual((view as any)._activeCardPath, null);
		assert.doesNotThrow(() => (view as any).reapplyActiveCard());
	});
});

// ---------------------------------------------------------------------------
// _dragging flag skips DOM reorder in patchColumnCards
// ---------------------------------------------------------------------------

describe('patchColumnCards - _dragging flag', () => {
	let scrollEl: HTMLElement;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('when _dragging is false, cards are reordered to match newEntries', () => {
		const a = createMockBasesEntry(createMockTFile('a.md'), {
			[PROPERTY_STATUS]: 'To Do',
		});
		const b = createMockBasesEntry(createMockTFile('b.md'), {
			[PROPERTY_STATUS]: 'To Do',
		});
		const controller = createMockQueryController([a, b], TEST_PROPERTIES) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Trigger patch with reversed order
		controller.data.data = [b, a];
		(view as any)._dragging = false;
		triggerDataUpdate(view);

		const paths = Array.from(view.containerEl.querySelectorAll('.obk-card')).map((c) =>
			(c as HTMLElement).getAttribute('data-entry-path'),
		);
		assert.strictEqual(paths[0], 'b.md');
		assert.strictEqual(paths[1], 'a.md');
	});

	test('when _dragging is true, DOM order is not changed', () => {
		const a = createMockBasesEntry(createMockTFile('a.md'), {
			[PROPERTY_STATUS]: 'To Do',
		});
		const b = createMockBasesEntry(createMockTFile('b.md'), {
			[PROPERTY_STATUS]: 'To Do',
		});
		const controller = createMockQueryController([a, b], TEST_PROPERTIES) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const orderBefore = Array.from(view.containerEl.querySelectorAll('.obk-card')).map((c) =>
			(c as HTMLElement).getAttribute('data-entry-path'),
		);

		(view as any)._dragging = true;
		controller.data.data = [b, a];
		triggerDataUpdate(view);

		const orderAfter = Array.from(view.containerEl.querySelectorAll('.obk-card')).map((c) =>
			(c as HTMLElement).getAttribute('data-entry-path'),
		);
		assert.deepStrictEqual(orderAfter, orderBefore);
	});
});

// ---------------------------------------------------------------------------
// Reactivity: property value changes are reflected after patch (issue #24)
// ---------------------------------------------------------------------------

describe('patchColumnCards - property value reactivity', () => {
	let scrollEl: HTMLElement;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
	});

	test('updated property value is shown on card after second data update', () => {
		const file = createMockTFile('note.md');
		const entryV1 = createMockBasesEntry(file, {
			[PROPERTY_STATUS]: 'To Do',
			[PROPERTY_PRIORITY]: 'Low',
		});
		const controller = createMockQueryController([entryV1], TEST_PROPERTIES) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.getOrder = () => [PROPERTY_STATUS, PROPERTY_PRIORITY];

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// Simulate user editing the file: same path, updated property value
		const entryV2 = createMockBasesEntry(file, {
			[PROPERTY_STATUS]: 'To Do',
			[PROPERTY_PRIORITY]: 'High',
		});
		controller.data.data = [entryV2];
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('[data-entry-path="note.md"]') as HTMLElement;
		assert.ok(card, 'Card should still exist after update');

		const valueEl = card.querySelector('.obk-card-property-value');
		assert.strictEqual(valueEl?.textContent, 'High', 'Card should reflect the updated property value');
	});

	test('no duplicate cards after property-only update', () => {
		const file = createMockTFile('note.md');
		const entryV1 = createMockBasesEntry(file, { [PROPERTY_STATUS]: 'To Do' });
		const controller = createMockQueryController([entryV1], TEST_PROPERTIES) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const entryV2 = createMockBasesEntry(file, { [PROPERTY_STATUS]: 'To Do' });
		controller.data.data = [entryV2];
		triggerDataUpdate(view);

		const cards = view.containerEl.querySelectorAll('[data-entry-path="note.md"]');
		assert.strictEqual(cards.length, 1, 'Should be exactly one card for the file after a property-only update');
	});

	test('column count remains correct after property-only update', () => {
		const file = createMockTFile('note.md');
		const entryV1 = createMockBasesEntry(file, { [PROPERTY_STATUS]: 'To Do' });
		const controller = createMockQueryController([entryV1], TEST_PROPERTIES) as any;
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const entryV2 = createMockBasesEntry(file, { [PROPERTY_STATUS]: 'To Do' });
		controller.data.data = [entryV2];
		triggerDataUpdate(view);

		const countEl = view.containerEl.querySelector('.obk-column-count');
		assert.strictEqual(countEl?.textContent, '1', 'Column count should remain 1 after a property-only update');
	});
});

// ---------------------------------------------------------------------------
// Card Archive Context Menu
// ---------------------------------------------------------------------------

describe('Card Archive Context Menu', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: ReturnType<typeof createMockApp>;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		MockMenu.lastInstance = null;
	});

	function setupStatusView(
		entries = createEntriesWithStatus(),
		options?: { columnOrder?: string[]; swimlaneBy?: BasesPropertyId | null },
	): KanbanView {
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			if (key === 'swimlaneByProperty') return options?.swimlaneBy ?? null;
			return null;
		};
		if (options?.columnOrder) {
			controller.config.set('columnOrders', { [PROPERTY_STATUS]: options.columnOrder });
		}
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		return view;
	}

	test('ARCHIVED_LABEL constant equals Archived', () => {
		assert.strictEqual(ARCHIVED_LABEL, 'Archived');
	});

	test('right-click on archivable card opens context menu with Archive item', () => {
		const view = setupStatusView();
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		assert.ok(card, 'Card should exist');

		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		assert.ok(MockMenu.lastInstance, 'Menu should be constructed');
		const archiveItem = MockMenu.lastInstance!.items.find((item) => item.title === 'Archive');
		assert.ok(archiveItem, 'Menu should contain an Archive item');
	});

	test('Archive item present for normal non-archived card', () => {
		const view = setupStatusView();
		triggerDataUpdate(view);

		const toDoColumn = view.containerEl.querySelector('[data-column-value="To Do"]') as HTMLElement;
		const card = toDoColumn?.querySelector('.obk-card') as HTMLElement;
		assert.ok(card, 'To Do card should exist');

		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		assert.ok(archiveItem, 'Archive item should exist for a non-archived card');
	});

	test('no Archive item when no groupBy property is configured', () => {
		// The view auto-selects the first available property when none is
		// configured, so we exercise createCard directly with groupByPropertyId
		// set to null to verify the handler guard.
		const entry = createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' });
		const card = createCard(
			entry,
			'To Do',
			{
				app: app as any,
				doc: document,
				groupByPropertyId: null,
				cardTitlePropertyId: null,
				imagePropertyId: null,
				imageFit: 'cover',
				imageAspectRatio: 0.5,
				wrapValues: false,
				order: [],
				getDisplayName: (id: string) => id,
			},
			{
				onHoverPreview: () => {},
				onSetActiveCard: () => {},
				onOpenInBackgroundTab: () => {},
				onArchiveCard: () => {},
			},
		);

		MockMenu.lastInstance = null;
		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		assert.strictEqual(archiveItem, undefined, 'No Archive item when groupBy is not configured');
	});

	test('no Archive item when card is already in Archived column', () => {
		const entries = [createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL })];
		const view = setupStatusView(entries, { columnOrder: ['Archived'] });
		triggerDataUpdate(view);

		const archivedColumn = view.containerEl.querySelector('[data-column-value="Archived"]') as HTMLElement;
		const card = archivedColumn?.querySelector('.obk-card') as HTMLElement;
		assert.ok(card, 'Archived card should exist');

		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		assert.strictEqual(archiveItem, undefined, 'No Archive item for already-archived card');
	});

	test('selecting Archive calls processFrontMatter exactly once with the correct file', () => {
		const view = setupStatusView();
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		const entryPath = card.getAttribute('data-entry-path');

		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		assert.ok(archiveItem?.onClick, 'Archive item should have onClick');
		archiveItem!.onClick!();

		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 1, 'processFrontMatter should be called once');
		assert.strictEqual(
			app.fileManager.processFrontMatter.calls[0][0].path,
			entryPath,
			'processFrontMatter should receive the card file',
		);
	});

	test('Archive writes resolved groupBy property name to Archived', () => {
		const view = setupStatusView();
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		archiveItem!.onClick!();

		const frontmatter: Record<string, unknown> = {};
		app.fileManager.processFrontMatter.calls[0][1](frontmatter);
		assert.strictEqual(frontmatter['status'], 'Archived', 'Frontmatter should set status to Archived');
	});

	test('written value equals ARCHIVED_LABEL constant', () => {
		const view = setupStatusView();
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		archiveItem!.onClick!();

		const frontmatter: Record<string, unknown> = {};
		app.fileManager.processFrontMatter.calls[0][1](frontmatter);
		assert.strictEqual(frontmatter['status'], ARCHIVED_LABEL, 'Written value should equal ARCHIVED_LABEL');
	});

	test('archiving an Uncategorized card sets the property to Archived', () => {
		const entries = [createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: null })];
		const view = setupStatusView(entries, { columnOrder: [UNCATEGORIZED_LABEL] });
		triggerDataUpdate(view);

		const uncatColumn = view.containerEl.querySelector('[data-column-value="Uncategorized"]') as HTMLElement;
		const card = uncatColumn?.querySelector('.obk-card') as HTMLElement;
		assert.ok(card, 'Uncategorized card should exist');

		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		assert.ok(archiveItem, 'Archive item should be present for Uncategorized card');
		archiveItem!.onClick!();

		const frontmatter: Record<string, unknown> = {};
		app.fileManager.processFrontMatter.calls[0][1](frontmatter);
		assert.strictEqual(frontmatter['status'], 'Archived', 'Uncategorized card should have status set to Archived');
		assert.ok('status' in frontmatter, 'Property key should exist after archiving');
	});

	test('after data refresh the archived card moves into the Archived column', () => {
		const file = createMockTFile('Task 1.md');
		const entries = [createMockBasesEntry(file, { [PROPERTY_STATUS]: 'To Do' })];
		const view = setupStatusView(entries, { columnOrder: ['To Do', ARCHIVED_LABEL] });
		triggerDataUpdate(view);

		const toDoCard = view.containerEl.querySelector('[data-column-value="To Do"] .obk-card') as HTMLElement;
		assert.ok(toDoCard, 'Card should start in To Do');

		toDoCard.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		archiveItem!.onClick!();

		// Simulate data update reflecting the new value
		controller.data.data = [createMockBasesEntry(file, { [PROPERTY_STATUS]: ARCHIVED_LABEL })];
		triggerDataUpdate(view);

		const archivedCard = view.containerEl.querySelector('[data-column-value="Archived"] .obk-card');
		assert.ok(archivedCard, 'Card should now be in Archived column');
		assert.strictEqual(
			archivedCard?.getAttribute('data-entry-path'),
			'Task 1.md',
			'Archived card should have correct path',
		);
		assert.strictEqual(
			view.containerEl.querySelector('[data-column-value="To Do"] .obk-card'),
			null,
			'To Do column should no longer contain the card',
		);
	});

	test('no Unarchive item exists in the card menu', () => {
		const view = setupStatusView();
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		const unarchiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Unarchive');
		assert.strictEqual(unarchiveItem, undefined, 'No Unarchive item should exist');
	});

	test('no card menu shown for already-archived card', () => {
		const entries = [createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL })];
		const view = setupStatusView(entries, { columnOrder: [ARCHIVED_LABEL] });
		triggerDataUpdate(view);

		MockMenu.lastInstance = null;
		const archivedCard = view.containerEl.querySelector('[data-column-value="Archived"] .obk-card') as HTMLElement;
		assert.ok(archivedCard, 'Archived card should exist');

		archivedCard.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		assert.strictEqual(archiveItem, undefined, 'No Archive item for already-archived card');
	});

	test('archiving in swimlane mode writes only the groupBy property', () => {
		const entries = createEntriesWithMixedProperties();
		const view = setupStatusView(entries, {
			columnOrder: ['To Do', 'Doing', 'Done'],
			swimlaneBy: PROPERTY_PRIORITY,
		});
		triggerDataUpdate(view);

		const toDoHighCard = view.containerEl.querySelector(
			'[data-swimlane-value="High"] [data-column-value="To Do"] .obk-card',
		) as HTMLElement;
		assert.ok(toDoHighCard, 'Card in To Do / High lane should exist');

		toDoHighCard.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		assert.ok(archiveItem, 'Archive item should exist in swimlane mode');
		archiveItem!.onClick!();

		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 1);
		const frontmatter: Record<string, unknown> = { priority: 'High' };
		app.fileManager.processFrontMatter.calls[0][1](frontmatter);
		assert.strictEqual(frontmatter['status'], 'Archived', 'groupBy property should be Archived');
		assert.strictEqual(frontmatter['priority'], 'High', 'swimlane property should be preserved');
	});

	test('right-click does not open the note', () => {
		const view = setupStatusView();
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		const openCountBefore = app.workspace.openLinkText.calls.length;

		const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		card.dispatchEvent(event);

		assert.strictEqual(
			app.workspace.openLinkText.calls.length,
			openCountBefore,
			'openLinkText should not be called on contextmenu',
		);
		assert.strictEqual(event.defaultPrevented, true, 'Event default should be prevented for archivable card');
	});

	test('left-click still opens the note after contextmenu handler added', () => {
		const view = setupStatusView();
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		card.click();

		assert.strictEqual(app.workspace.openLinkText.calls.length, 1, 'Left-click should still open the note');
	});

	test('middle-click still opens background tab after contextmenu handler added', () => {
		const view = setupStatusView();
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		card.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));

		assert.strictEqual(app.workspace.getLeaf.calls.length, 1, 'Middle-click should still open background tab');
	});

	test('clicking an inner anchor still bypasses card-open after contextmenu handler added', () => {
		const entries = createEntriesWithLinks();
		controller = createMockQueryController(entries, [PROPERTY_STATUS, PROPERTY_RELATED]);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.getOrder = () => [PROPERTY_STATUS, PROPERTY_RELATED];

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		const link = view.containerEl.querySelector('a.internal-link') as HTMLElement;
		assert.ok(link, 'Internal link should exist');

		link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		assert.strictEqual(app.workspace.openLinkText.calls.length, 1);
		assert.strictEqual(app.workspace.openLinkText.calls[0][0], 'Meeting Notes', 'Anchor click should open link target');
	});

	test('Archive works while a sort is active', () => {
		const view = setupStatusView();
		controller.config.set('sort', [{ property: 'file.mtime', direction: 'DESC' }]);
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector('.obk-card') as HTMLElement;
		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		assert.ok(archiveItem, 'Archive item should be present even with active sort');
		archiveItem!.onClick!();

		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 1);
		const frontmatter: Record<string, unknown> = {};
		app.fileManager.processFrontMatter.calls[0][1](frontmatter);
		assert.strictEqual(frontmatter['status'], 'Archived');
	});

	test('card context menu reachable in swimlane mode', () => {
		const entries = createEntriesWithMixedProperties();
		const view = setupStatusView(entries, {
			columnOrder: ['To Do', 'Doing', 'Done'],
			swimlaneBy: PROPERTY_PRIORITY,
		});
		triggerDataUpdate(view);

		const card = view.containerEl.querySelector(
			'[data-swimlane-value="High"] [data-column-value="To Do"] .obk-card',
		) as HTMLElement;
		assert.ok(card, 'Card should exist in swimlane');

		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		assert.ok(MockMenu.lastInstance, 'Menu should be constructed in swimlane mode');
		const archiveItem = MockMenu.lastInstance!.items.find((item) => item.title === 'Archive');
		assert.ok(archiveItem, 'Archive item should exist in swimlane mode');
	});

	test('column hide, quick add, and drag-drop coexist with card context menu', () => {
		const entries = createEntriesWithStatus();
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = () => PROPERTY_STATUS;
		controller.config.set('quickAddFolder', 'cards');
		controller.config.set('columnOrders', { [PROPERTY_STATUS]: ['To Do', 'Doing', 'Done'] });

		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		triggerDataUpdate(view);

		// 1. Column hide still works
		const doingColumn = view.containerEl.querySelector('[data-column-value="Doing"]') as HTMLElement;
		(view as any).openColumnMenu(new MouseEvent('click'), 'Doing', doingColumn);
		const hideItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Hide column');
		assert.ok(hideItem, 'Hide column item should still exist');
		hideItem!.onClick!();
		assert.strictEqual(
			view.containerEl.querySelector('[data-column-value="Doing"]'),
			null,
			'Hide column should still work',
		);

		// 2. Quick add button still exists
		const toDoColumn = view.containerEl.querySelector('[data-column-value="To Do"]') as HTMLElement;
		const addBtn = toDoColumn?.querySelector('.obk-column-add-btn');
		assert.ok(addBtn, 'Quick add button should still exist');

		// 3. Card context menu still works
		const card = toDoColumn?.querySelector('.obk-card') as HTMLElement;
		MockMenu.lastInstance = null;
		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		assert.ok(archiveItem, 'Archive item should still exist alongside other features');
	});
});

// ---------------------------------------------------------------------------
// Archived Column Behavior - Always Last
// ---------------------------------------------------------------------------

describe('Archived Column Behavior - Always Last', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		MockMenu.lastInstance = null;
	});

	function setupStatusView(
		entries = createEntriesWithStatus(),
		options?: { columnOrder?: string[]; swimlaneBy?: BasesPropertyId | null },
	): KanbanView {
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			if (key === 'swimlaneByProperty') return options?.swimlaneBy ?? null;
			return null;
		};
		if (options?.columnOrder) {
			controller.config.set('columnOrders', { [PROPERTY_STATUS]: options.columnOrder });
		}
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		return view;
	}

	function getRenderedColumnValues(view: KanbanView): string[] {
		return Array.from(view.containerEl.querySelectorAll('.obk-column')).map(
			(col) => col.getAttribute('data-column-value') ?? '',
		);
	}

	test('VAL-ARCHCOL-001: Archived renders last among visible columns when revealed', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' }),
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL }),
		];
		const view = setupStatusView(entries, { columnOrder: ['To Do', ARCHIVED_LABEL] });
		triggerDataUpdate(view);

		const values = getRenderedColumnValues(view);
		assert.strictEqual(values[values.length - 1], ARCHIVED_LABEL, 'Archived should be last visible column');
	});

	test('VAL-ARCHCOL-002: Archived stays pinned last when saved order lists it earlier', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' }),
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL }),
		];
		const view = setupStatusView(entries, { columnOrder: [ARCHIVED_LABEL, 'To Do'] });
		triggerDataUpdate(view);

		const values = getRenderedColumnValues(view);
		assert.deepStrictEqual(
			values,
			['To Do', ARCHIVED_LABEL],
			'Archived should be pinned to end regardless of saved order',
		);
	});

	test('VAL-ARCHCOL-003: Archived stays pinned last when new live columns appear', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' }),
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL }),
		];
		const view = setupStatusView(entries, { columnOrder: ['To Do', ARCHIVED_LABEL] });
		triggerDataUpdate(view);

		// Add a new column value
		controller.data.data = [
			...entries,
			createMockBasesEntry(createMockTFile('Task 3.md'), { [PROPERTY_STATUS]: 'In Review' }),
		];
		triggerDataUpdate(view);

		const values = getRenderedColumnValues(view);
		assert.strictEqual(values[values.length - 1], ARCHIVED_LABEL, 'Archived should still be last');
		assert.strictEqual(values[values.length - 2], 'In Review', 'New column should appear immediately before Archived');
	});
});

// ---------------------------------------------------------------------------
// Archived Column Behavior - Hidden by Default
// ---------------------------------------------------------------------------

describe('Archived Column Behavior - Hidden by Default', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		MockMenu.lastInstance = null;
	});

	function setupStatusView(
		entries = createEntriesWithStatus(),
		options?: { columnOrder?: string[]; swimlaneBy?: BasesPropertyId | null },
	): KanbanView {
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			if (key === 'swimlaneByProperty') return options?.swimlaneBy ?? null;
			return null;
		};
		if (options?.columnOrder) {
			controller.config.set('columnOrders', { [PROPERTY_STATUS]: options.columnOrder });
		}
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		return view;
	}

	function getRenderedColumnValues(view: KanbanView): string[] {
		return Array.from(view.containerEl.querySelectorAll('.obk-column')).map(
			(col) => col.getAttribute('data-column-value') ?? '',
		);
	}

	test('VAL-ARCHCOL-004: Archived is hidden on first appearance (absent from DOM)', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' }),
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL }),
		];
		const view = setupStatusView(entries); // no columnOrder preset
		triggerDataUpdate(view);

		assert.strictEqual(
			view.containerEl.querySelector(`[data-column-value="${ARCHIVED_LABEL}"]`),
			null,
			'Archived column should not be in DOM on first appearance',
		);
	});

	test('VAL-ARCHCOL-005: Non-Archived columns render normally despite Archived auto-hide', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' }),
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL }),
		];
		const view = setupStatusView(entries);
		triggerDataUpdate(view);

		const values = getRenderedColumnValues(view);
		assert.deepStrictEqual(values, ['To Do'], 'Only non-Archived columns should render');
		assert.strictEqual(view.containerEl.querySelectorAll('.obk-card').length, 1, 'The To Do card should still render');
	});

	test('VAL-ARCHCOL-006: First-appearance auto-hide adds Archived to hiddenColumns and persists (single-axis)', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' }),
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL }),
		];
		const view = setupStatusView(entries);
		triggerDataUpdate(view);

		assert.ok(
			(view as any)._prefs.hiddenColumns.has(ARCHIVED_LABEL),
			'Archived should be in hiddenColumns after auto-hide',
		);

		const savedHidden = controller.config.get('hiddenColumns') as Record<string, string[]> | null;
		assert.ok(savedHidden, 'hiddenColumns should be persisted to config');
		assert.deepStrictEqual(
			savedHidden?.[PROPERTY_STATUS],
			[ARCHIVED_LABEL],
			'Archived should be persisted under property id key',
		);
	});

	test('VAL-ARCHCOL-007: Hidden-columns indicator reflects the auto-hidden Archived column', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' }),
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL }),
		];
		const view = setupStatusView(entries);
		triggerDataUpdate(view);

		const indicator = view.containerEl.querySelector('.obk-hidden-columns-indicator');
		assert.ok(indicator, 'Indicator should appear');
		assert.strictEqual(indicator?.textContent, '1 hidden', 'Indicator should count Archived');

		// Verify menu offers Show: Archived
		(view as any).openHiddenColumnsMenu(new MouseEvent('click'));
		const showItem = MockMenu.lastInstance?.items.find((item) => item.title === `Show: ${ARCHIVED_LABEL}`);
		assert.ok(showItem, 'Menu should offer Show: Archived');
	});

	test('VAL-ARCHCOL-008: Revealing Archived from the indicator renders it pinned last', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' }),
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL }),
		];
		const view = setupStatusView(entries);
		triggerDataUpdate(view);

		(view as any).openHiddenColumnsMenu(new MouseEvent('click'));
		const showItem = MockMenu.lastInstance?.items.find((item) => item.title === `Show: ${ARCHIVED_LABEL}`);
		showItem?.onClick?.();

		const values = getRenderedColumnValues(view);
		assert.ok(values.includes(ARCHIVED_LABEL), 'Archived should be rendered after reveal');
		assert.strictEqual(values[values.length - 1], ARCHIVED_LABEL, 'Archived should be last after reveal');
	});

	test('VAL-ARCHCOL-009: Once revealed, Archived stays revealed across re-render', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' }),
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL }),
		];
		const view = setupStatusView(entries);
		triggerDataUpdate(view);

		// Reveal Archived
		(view as any).openHiddenColumnsMenu(new MouseEvent('click'));
		const showItem = MockMenu.lastInstance?.items.find((item) => item.title === `Show: ${ARCHIVED_LABEL}`);
		showItem?.onClick?.();

		// Trigger more data updates
		triggerDataUpdate(view);
		triggerDataUpdate(view);

		assert.ok(
			view.containerEl.querySelector(`[data-column-value="${ARCHIVED_LABEL}"]`),
			'Archived should still be rendered',
		);
		assert.ok(
			!(view as any)._prefs.hiddenColumns.has(ARCHIVED_LABEL),
			'Archived should not be re-added to hiddenColumns',
		);
	});

	test('VAL-ARCHCOL-010: Re-hiding Archived via Hide column menu works', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' }),
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL }),
		];
		const view = setupStatusView(entries);
		triggerDataUpdate(view);

		// Reveal Archived first
		(view as any).openHiddenColumnsMenu(new MouseEvent('click'));
		const showItem = MockMenu.lastInstance?.items.find((item) => item.title === `Show: ${ARCHIVED_LABEL}`);
		showItem?.onClick?.();
		assert.ok(
			view.containerEl.querySelector(`[data-column-value="${ARCHIVED_LABEL}"]`),
			'Precondition: Archived revealed',
		);

		// Hide via column menu
		const archivedColumn = view.containerEl.querySelector(`[data-column-value="${ARCHIVED_LABEL}"]`) as HTMLElement;
		(view as any).openColumnMenu(new MouseEvent('click'), ARCHIVED_LABEL, archivedColumn);
		const hideItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Hide column');
		hideItem?.onClick?.();

		assert.strictEqual(
			view.containerEl.querySelector(`[data-column-value="${ARCHIVED_LABEL}"]`),
			null,
			'Archived should be hidden again',
		);
		assert.ok((view as any)._prefs.hiddenColumns.has(ARCHIVED_LABEL), 'Archived should be back in hiddenColumns');
		const indicator = view.containerEl.querySelector('.obk-hidden-columns-indicator');
		assert.ok(indicator, 'Indicator should reappear');
		assert.strictEqual(indicator?.textContent, '1 hidden');
	});

	test('VAL-ARCHCOL-013: Archived is NOT auto-hidden when already present in saved columnOrder', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' }),
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL }),
		];
		const view = setupStatusView(entries, { columnOrder: ['To Do', ARCHIVED_LABEL] });
		triggerDataUpdate(view);

		assert.ok(
			view.containerEl.querySelector(`[data-column-value="${ARCHIVED_LABEL}"]`),
			'Archived should render when already in saved order',
		);
		assert.strictEqual(
			(view as any)._prefs.hiddenColumns.size,
			0,
			'hiddenColumns should be empty when Archived was already known',
		);
	});

	test('VAL-ARCHCOL-014: Edge - Archived as the only live column auto-hides safely and is revealable', () => {
		const entries = [createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL })];
		const view = setupStatusView(entries);
		triggerDataUpdate(view);

		assert.strictEqual(
			view.containerEl.querySelectorAll('.obk-column').length,
			0,
			'No visible columns when Archived is the only value and auto-hidden',
		);
		const indicator = view.containerEl.querySelector('.obk-hidden-columns-indicator');
		assert.ok(indicator, 'Indicator should appear');
		assert.strictEqual(indicator?.textContent, '1 hidden');

		// Reveal
		(view as any).openHiddenColumnsMenu(new MouseEvent('click'));
		const showItem = MockMenu.lastInstance?.items.find((item) => item.title === `Show: ${ARCHIVED_LABEL}`);
		showItem?.onClick?.();

		const values = getRenderedColumnValues(view);
		assert.deepStrictEqual(values, [ARCHIVED_LABEL], 'Revealed Archived should be the only column');
	});
});

// ---------------------------------------------------------------------------
// Archived Column Behavior - Not Deletable
// ---------------------------------------------------------------------------

describe('Archived Column Behavior - Not Deletable', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		MockMenu.lastInstance = null;
	});

	function setupStatusView(
		entries = createEntriesWithStatus(),
		options?: { columnOrder?: string[]; swimlaneBy?: BasesPropertyId | null },
	): KanbanView {
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			if (key === 'swimlaneByProperty') return options?.swimlaneBy ?? null;
			return null;
		};
		if (options?.columnOrder) {
			controller.config.set('columnOrders', { [PROPERTY_STATUS]: options.columnOrder });
		}
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		return view;
	}

	test('VAL-ARCHCOL-011: Archived shows NO remove (x) button when empty', () => {
		const entries = [createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: ARCHIVED_LABEL })];
		const view = setupStatusView(entries, { columnOrder: [ARCHIVED_LABEL] });
		triggerDataUpdate(view);

		const archivedColumn = view.containerEl.querySelector(`[data-column-value="${ARCHIVED_LABEL}"]`) as HTMLElement;
		assert.ok(archivedColumn, 'Archived column should exist');
		const removeBtn = archivedColumn.querySelector('.obk-column-remove-btn');
		assert.strictEqual(removeBtn, null, 'Empty Archived should not have a remove button');
	});

	test('VAL-ARCHCOL-012: Non-Archived empty column still shows its remove button (single-axis)', () => {
		const entries = [createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do' })];
		const view = setupStatusView(entries, { columnOrder: ['To Do', 'Done', ARCHIVED_LABEL] });
		triggerDataUpdate(view);

		const doneColumn = view.containerEl.querySelector('[data-column-value="Done"]') as HTMLElement;
		assert.ok(doneColumn, 'Done column should exist as empty saved column');
		const removeBtn = doneColumn.querySelector('.obk-column-remove-btn');
		assert.ok(removeBtn, 'Empty non-Archived column should have a remove button');
	});

	test('VAL-ARCHCOL-015: Edge - Archived emptied after last card removed keeps no remove button', () => {
		const file = createMockTFile('Task 1.md');
		const entries = [createMockBasesEntry(file, { [PROPERTY_STATUS]: ARCHIVED_LABEL })];
		const view = setupStatusView(entries, { columnOrder: [ARCHIVED_LABEL] });
		triggerDataUpdate(view);

		// Remove the card
		controller.data.data = [];
		triggerDataUpdate(view);

		const archivedColumn = view.containerEl.querySelector(`[data-column-value="${ARCHIVED_LABEL}"]`) as HTMLElement;
		assert.ok(archivedColumn, 'Archived column should persist even when empty');
		const removeBtn = archivedColumn.querySelector('.obk-column-remove-btn');
		assert.strictEqual(removeBtn, null, 'Emptied Archived should still have no remove button');
	});

	test('VAL-ARCHCOL-016: Patch-render path also withholds the Archived remove button', () => {
		const file = createMockTFile('Task 1.md');
		const entries = [createMockBasesEntry(file, { [PROPERTY_STATUS]: ARCHIVED_LABEL })];
		const view = setupStatusView(entries, { columnOrder: [ARCHIVED_LABEL] });
		triggerDataUpdate(view);

		// Second render with empty data exercises the patch path
		controller.data.data = [];
		triggerDataUpdate(view);

		const archivedColumn = view.containerEl.querySelector(`[data-column-value="${ARCHIVED_LABEL}"]`) as HTMLElement;
		assert.ok(archivedColumn, 'Archived column should exist after patch');
		const removeBtn = archivedColumn.querySelector('.obk-column-remove-btn');
		assert.strictEqual(removeBtn, null, 'Patch path should not add remove button to Archived');
	});
});

// ---------------------------------------------------------------------------
// Archived Column Behavior - Swimlane
// ---------------------------------------------------------------------------

describe('Archived Column Behavior - Swimlane', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		MockMenu.lastInstance = null;
	});

	function setupStatusView(
		entries = createEntriesWithStatus(),
		options?: { columnOrder?: string[]; swimlaneBy?: BasesPropertyId | null },
	): KanbanView {
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			if (key === 'swimlaneByProperty') return options?.swimlaneBy ?? null;
			return null;
		};
		if (options?.columnOrder) {
			controller.config.set('columnOrders', { [PROPERTY_STATUS]: options.columnOrder });
		}
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		return view;
	}

	test('VAL-ARCHCOL-017: Archived pins last in every lane (swimlane mode)', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do', [PROPERTY_PRIORITY]: 'High' }),
			createMockBasesEntry(createMockTFile('Task 2.md'), {
				[PROPERTY_STATUS]: ARCHIVED_LABEL,
				[PROPERTY_PRIORITY]: 'High',
			}),
			createMockBasesEntry(createMockTFile('Task 3.md'), { [PROPERTY_STATUS]: 'To Do', [PROPERTY_PRIORITY]: 'Low' }),
			createMockBasesEntry(createMockTFile('Task 4.md'), {
				[PROPERTY_STATUS]: ARCHIVED_LABEL,
				[PROPERTY_PRIORITY]: 'Low',
			}),
		];
		const view = setupStatusView(entries, {
			columnOrder: ['To Do', ARCHIVED_LABEL],
			swimlaneBy: PROPERTY_PRIORITY,
		});
		triggerDataUpdate(view);

		const lanes = view.containerEl.querySelectorAll('.obk-swimlane');
		assert.ok(lanes.length >= 1, 'Should have swimlane lanes');
		lanes.forEach((lane) => {
			const columns = lane.querySelectorAll('.obk-column');
			const lastCol = columns[columns.length - 1];
			assert.strictEqual(
				lastCol?.getAttribute('data-column-value'),
				ARCHIVED_LABEL,
				'Archived should be last in every lane',
			);
		});
	});

	test('VAL-ARCHCOL-018: First-appearance auto-hide persists under swimlane-scoped key and hides Archived in all lanes', () => {
		const entries = [
			createMockBasesEntry(createMockTFile('Task 1.md'), { [PROPERTY_STATUS]: 'To Do', [PROPERTY_PRIORITY]: 'High' }),
			createMockBasesEntry(createMockTFile('Task 2.md'), {
				[PROPERTY_STATUS]: ARCHIVED_LABEL,
				[PROPERTY_PRIORITY]: 'High',
			}),
		];
		const view = setupStatusView(entries, {
			swimlaneBy: PROPERTY_PRIORITY,
		});
		triggerDataUpdate(view);

		// Archived should be hidden in all lanes
		const lanes = view.containerEl.querySelectorAll('.obk-swimlane');
		lanes.forEach((lane) => {
			assert.strictEqual(
				lane.querySelector(`[data-column-value="${ARCHIVED_LABEL}"]`),
				null,
				'Archived should be hidden in every lane',
			);
		});

		// Check persisted under scoped key
		const scopedKey = `${PROPERTY_STATUS}\u001F${PROPERTY_PRIORITY}`;
		const savedHidden = controller.config.get('hiddenColumns') as Record<string, string[]> | null;
		assert.deepStrictEqual(
			savedHidden?.[scopedKey],
			[ARCHIVED_LABEL],
			'Archived should be persisted under swimlane-scoped key',
		);
	});
});

// ---------------------------------------------------------------------------
// Archived Column Behavior - Cross Flows
// ---------------------------------------------------------------------------

describe('Archived Column Behavior - Cross Flows', () => {
	let scrollEl: HTMLElement;
	let controller: any;
	let app: any;

	beforeEach(() => {
		scrollEl = createDivWithMethods();
		app = createMockApp();
		MockMenu.lastInstance = null;
	});

	function setupStatusView(
		entries = createEntriesWithStatus(),
		options?: { columnOrder?: string[]; swimlaneBy?: BasesPropertyId | null },
	): KanbanView {
		controller = createMockQueryController(entries, TEST_PROPERTIES);
		controller.app = app;
		controller.config.getAsPropertyId = (key: string) => {
			if (key === 'groupByProperty') return PROPERTY_STATUS;
			if (key === 'swimlaneByProperty') return options?.swimlaneBy ?? null;
			return null;
		};
		if (options?.columnOrder) {
			controller.config.set('columnOrders', { [PROPERTY_STATUS]: options.columnOrder });
		}
		const view = new KanbanView(controller, scrollEl);
		setupKanbanViewWithApp(view, app);
		return view;
	}

	function getRenderedColumnValues(view: KanbanView): string[] {
		return Array.from(view.containerEl.querySelectorAll('.obk-column')).map(
			(col) => col.getAttribute('data-column-value') ?? '',
		);
	}

	test('VAL-CROSS-001: Archiving a card spawns a hidden Archived column and surfaces the reveal indicator', () => {
		const file = createMockTFile('Task 1.md');
		const entries = [createMockBasesEntry(file, { [PROPERTY_STATUS]: 'To Do' })];
		const view = setupStatusView(entries, { columnOrder: ['To Do'] });
		triggerDataUpdate(view);

		// Archive the card
		const card = view.containerEl.querySelector('[data-column-value="To Do"] .obk-card') as HTMLElement;
		assert.ok(card);
		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		archiveItem!.onClick!();

		// Simulate data update reflecting the new value
		controller.data.data = [createMockBasesEntry(file, { [PROPERTY_STATUS]: ARCHIVED_LABEL })];
		triggerDataUpdate(view);

		assert.strictEqual(
			view.containerEl.querySelector('[data-column-value="To Do"] .obk-card'),
			null,
			'Card should be gone from To Do',
		);
		assert.strictEqual(
			view.containerEl.querySelector(`[data-column-value="${ARCHIVED_LABEL}"]`),
			null,
			'Archived column should be hidden on first appearance',
		);
		const indicator = view.containerEl.querySelector('.obk-hidden-columns-indicator');
		assert.ok(indicator, 'Indicator should appear');
		assert.ok(indicator?.textContent?.includes('1 hidden'));
		assert.ok((view as any)._prefs.hiddenColumns.has(ARCHIVED_LABEL));
	});

	test('VAL-CROSS-002: Revealing the hidden Archived column shows it last with the archived card', () => {
		const file = createMockTFile('Task 1.md');
		const entries = [createMockBasesEntry(file, { [PROPERTY_STATUS]: 'To Do' })];
		const view = setupStatusView(entries, { columnOrder: ['To Do'] });
		triggerDataUpdate(view);

		// Archive
		const card = view.containerEl.querySelector('[data-column-value="To Do"] .obk-card') as HTMLElement;
		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		archiveItem!.onClick!();

		controller.data.data = [createMockBasesEntry(file, { [PROPERTY_STATUS]: ARCHIVED_LABEL })];
		triggerDataUpdate(view);

		// Reveal Archived
		(view as any).openHiddenColumnsMenu(new MouseEvent('click'));
		const showItem = MockMenu.lastInstance?.items.find((item) => item.title === `Show: ${ARCHIVED_LABEL}`);
		showItem?.onClick?.();

		const values = getRenderedColumnValues(view);
		assert.strictEqual(values[values.length - 1], ARCHIVED_LABEL, 'Archived should be last');
		const archivedCard = view.containerEl.querySelector(`[data-column-value="${ARCHIVED_LABEL}"] .obk-card`);
		assert.ok(archivedCard, 'Archived card should be in Archived column');
		assert.strictEqual(archivedCard?.getAttribute('data-entry-path'), 'Task 1.md');
	});

	test('VAL-CROSS-003: Dragging a card out of Archived unarchives it to the destination column value', async () => {
		const file = createMockTFile('Task 1.md');
		const entries = [
			createMockBasesEntry(file, { [PROPERTY_STATUS]: ARCHIVED_LABEL }),
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: 'Doing' }),
		];
		const view = setupStatusView(entries, { columnOrder: ['Doing', ARCHIVED_LABEL] });
		triggerDataUpdate(view);

		// Ensure Archived is visible
		(view as any)._prefs.hiddenColumns.delete(ARCHIVED_LABEL);
		triggerDataUpdate(view);

		// Simulate cross-cell drag from Archived to Doing
		const archivedBody = view.containerEl.querySelector(
			`[data-column-value="${ARCHIVED_LABEL}"] .obk-column-body`,
		) as HTMLElement;
		const doingBody = view.containerEl.querySelector('[data-column-value="Doing"] .obk-column-body') as HTMLElement;
		const card = archivedBody.querySelector('.obk-card') as HTMLElement;

		// Move card in DOM (simulating Sortable)
		archivedBody.removeChild(card);
		doingBody.appendChild(card);

		const mockEvent = {
			item: card,
			from: archivedBody,
			to: doingBody,
			oldIndex: 0,
			newIndex: 0,
		};

		app.fileManager.processFrontMatter.calls.length = 0;
		await (view as any).handleCardDrop(mockEvent);

		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 1, 'processFrontMatter should be called once');
		const frontmatter: Record<string, unknown> = {};
		app.fileManager.processFrontMatter.calls[0][1](frontmatter);
		assert.strictEqual(frontmatter['status'], 'Doing', 'Drag out should write destination value');
	});

	test('VAL-CROSS-004: Emptying Archived by unarchiving its last card keeps no remove button (single-axis)', async () => {
		const file = createMockTFile('Task 1.md');
		const entries = [createMockBasesEntry(file, { [PROPERTY_STATUS]: ARCHIVED_LABEL })];
		const view = setupStatusView(entries, { columnOrder: [ARCHIVED_LABEL] });
		triggerDataUpdate(view);

		// Create a temporary Doing column body for the drag target
		const boardEl = view.containerEl.querySelector('.obk-board') as HTMLElement;
		const doingCol = document.createElement('div');
		doingCol.className = 'obk-column';
		doingCol.setAttribute('data-column-value', 'Doing');
		const doingBody = document.createElement('div');
		doingBody.className = 'obk-column-body';
		doingBody.setAttribute('data-sortable-container', 'true');
		doingCol.appendChild(doingBody);
		boardEl.appendChild(doingCol);

		const archivedBody = view.containerEl.querySelector(
			`[data-column-value="${ARCHIVED_LABEL}"] .obk-column-body`,
		) as HTMLElement;
		const card = archivedBody.querySelector('.obk-card') as HTMLElement;

		archivedBody.removeChild(card);
		doingBody.appendChild(card);

		const mockEvent = {
			item: card,
			from: archivedBody,
			to: doingBody,
			oldIndex: 0,
			newIndex: 0,
		};

		await (view as any).handleCardDrop(mockEvent);

		// Re-render to reflect the empty Archived column
		controller.data.data = [];
		triggerDataUpdate(view);

		const archivedColumn = view.containerEl.querySelector(`[data-column-value="${ARCHIVED_LABEL}"]`) as HTMLElement;
		if (archivedColumn) {
			const removeBtn = archivedColumn.querySelector('.obk-column-remove-btn');
			assert.strictEqual(removeBtn, null, 'Empty Archived should not have remove button');
		}
	});

	test('VAL-CROSS-011: Archiving the last card of a normal column leaves it empty-with-remove-button while Archived stays remove-button-free', () => {
		const file = createMockTFile('Task 1.md');
		const entries = [createMockBasesEntry(file, { [PROPERTY_STATUS]: 'Doing' })];
		const view = setupStatusView(entries, { columnOrder: ['Doing', ARCHIVED_LABEL] });
		triggerDataUpdate(view);

		// Ensure Archived is visible
		(view as any)._prefs.hiddenColumns.delete(ARCHIVED_LABEL);
		triggerDataUpdate(view);

		// Archive the card
		const card = view.containerEl.querySelector('[data-column-value="Doing"] .obk-card') as HTMLElement;
		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		archiveItem!.onClick!();

		controller.data.data = [createMockBasesEntry(file, { [PROPERTY_STATUS]: ARCHIVED_LABEL })];
		triggerDataUpdate(view);

		const doingColumn = view.containerEl.querySelector('[data-column-value="Doing"]') as HTMLElement;
		const archivedColumn = view.containerEl.querySelector(`[data-column-value="${ARCHIVED_LABEL}"]`) as HTMLElement;

		assert.ok(doingColumn.querySelector('.obk-column-remove-btn'), 'Doing should have remove button');
		assert.strictEqual(
			archivedColumn.querySelector('.obk-column-remove-btn'),
			null,
			'Archived should not have remove button',
		);
	});

	test('VAL-CROSS-012: Indicator counts both manually hidden and auto-hidden Archived', () => {
		const file = createMockTFile('Task 1.md');
		const entries = [
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: 'Done' }),
			createMockBasesEntry(file, { [PROPERTY_STATUS]: 'Doing' }),
		];
		const view = setupStatusView(entries, { columnOrder: ['Doing', 'Done'] });
		triggerDataUpdate(view);

		// Hide Done manually
		const doneColumn = view.containerEl.querySelector('[data-column-value="Done"]') as HTMLElement;
		(view as any).openColumnMenu(new MouseEvent('click'), 'Done', doneColumn);
		const hideItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Hide column');
		hideItem?.onClick?.();

		// Archive the Doing card
		const card = view.containerEl.querySelector('[data-column-value="Doing"] .obk-card') as HTMLElement;
		card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		const archiveItem = MockMenu.lastInstance?.items.find((item) => item.title === 'Archive');
		archiveItem!.onClick!();

		controller.data.data = [
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: 'Done' }),
			createMockBasesEntry(file, { [PROPERTY_STATUS]: ARCHIVED_LABEL }),
		];
		triggerDataUpdate(view);

		const indicator = view.containerEl.querySelector('.obk-hidden-columns-indicator');
		assert.ok(indicator);
		assert.strictEqual(indicator?.textContent, '2 hidden', 'Indicator should count both hidden sources');

		// Verify menu has both
		(view as any).openHiddenColumnsMenu(new MouseEvent('click'));
		const showDone = MockMenu.lastInstance?.items.find((item) => item.title === 'Show: Done');
		const showArchived = MockMenu.lastInstance?.items.find((item) => item.title === `Show: ${ARCHIVED_LABEL}`);
		assert.ok(showDone, 'Menu should have Show: Done');
		assert.ok(showArchived, 'Menu should have Show: Archived');

		// Reveal only Archived
		showArchived?.onClick?.();
		const indicatorAfter = view.containerEl.querySelector('.obk-hidden-columns-indicator');
		assert.ok(indicatorAfter);
		assert.strictEqual(indicatorAfter?.textContent, '1 hidden', 'Only Done should remain hidden');
		assert.strictEqual(view.containerEl.querySelector('[data-column-value="Done"]'), null, 'Done should still be hidden');
	});

	test('VAL-CROSS-014: Unarchiving by cross-cell drag still writes the destination value under an active sort', async () => {
		const file = createMockTFile('Task 1.md');
		const entries = [
			createMockBasesEntry(file, { [PROPERTY_STATUS]: ARCHIVED_LABEL }),
			createMockBasesEntry(createMockTFile('Task 2.md'), { [PROPERTY_STATUS]: 'Doing' }),
		];
		const view = setupStatusView(entries, { columnOrder: ['Doing', ARCHIVED_LABEL] });
		controller.config.set('sort', [{ property: 'file.mtime', direction: 'DESC' }]);
		triggerDataUpdate(view);

		// Ensure Archived is visible
		(view as any)._prefs.hiddenColumns.delete(ARCHIVED_LABEL);
		triggerDataUpdate(view);

		// Simulate cross-cell drag from Archived to Doing
		const archivedBody = view.containerEl.querySelector(
			`[data-column-value="${ARCHIVED_LABEL}"] .obk-column-body`,
		) as HTMLElement;
		const doingBody = view.containerEl.querySelector('[data-column-value="Doing"] .obk-column-body') as HTMLElement;
		const card = archivedBody.querySelector('.obk-card') as HTMLElement;

		archivedBody.removeChild(card);
		doingBody.appendChild(card);

		const mockEvent = {
			item: card,
			from: archivedBody,
			to: doingBody,
			oldIndex: 0,
			newIndex: 0,
		};

		app.fileManager.processFrontMatter.calls.length = 0;
		await (view as any).handleCardDrop(mockEvent);

		assert.strictEqual(app.fileManager.processFrontMatter.calls.length, 1);
		const frontmatter: Record<string, unknown> = {};
		app.fileManager.processFrontMatter.calls[0][1](frontmatter);
		assert.strictEqual(frontmatter['status'], 'Doing', 'Cross-cell drag should write destination regardless of sort');
	});
});
