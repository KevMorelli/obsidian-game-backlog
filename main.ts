import { App, Plugin, PluginSettingTab, Setting, MarkdownPostProcessorContext, Modal, Notice, TFile, requestUrl } from 'obsidian';
import { AppLanguage, I18nKey, translate } from './i18n';

enum GamePlatform {
	SWITCH = 'Switch',
	PC = 'PC',
	STEAM_DECK = 'Steam Deck',
	PS_VITA = 'Playstation Vita',
	PS1 = 'Playstation 1',
	PS2 = 'Playstation 2',
	PS3 = 'Playstation 3',
	PS4 = 'Playstation 4',
	PS5 = 'Playstation 5',
	NINTENDO_3DS = '3DS',
	NINTENDO_DS = 'DS',
	GBA = 'Game Boy Advance',
	DREAMCAST = 'Dreamcast',
	PSP = 'Playstation Portable',
	GAMECUBE = 'GameCube',
	GB = 'Game Boy',
	GBC = 'Game Boy Color',
	NES = 'NES',
	SNES = 'SNES',
	GENESIS = 'Genesis',
	N64 = 'N64',
	VIRTUAL_BOY = 'Virtual Boy',
	WII_U = 'Wii U',
	XBOX = 'Xbox',
	XBOX_360 = 'Xbox 360',
	XBOX_ONE = 'Xbox One',
	XBOX_SERIES = 'Xbox Series X/S',
	WII = 'Wii',
	MAME = 'MAME',
	DOS = 'DOS',
	NEO_GEO = 'Neo Geo',
	SEGA_SATURN = 'Saturn',
	ATARI_2600 = 'Atari 2600',
	STEAM_DECK_PC = 'Steam Deck / PC',
	SWITCH2 = 'Switch 2',
	ANDROID = 'Android'
}

const PLATFORM_GROUPS: Array<{ label: string; platforms: GamePlatform[] }> = [
	{
		label: 'PC',
		platforms: [
			GamePlatform.DOS,
			GamePlatform.PC,
			GamePlatform.STEAM_DECK,
			GamePlatform.STEAM_DECK_PC
		]
	},
	{
		label: 'Nintendo',
		platforms: [
			GamePlatform.NES,
			GamePlatform.GB,
			GamePlatform.SNES,
			GamePlatform.VIRTUAL_BOY,
			GamePlatform.N64,
			GamePlatform.GBC,
			GamePlatform.GBA,
			GamePlatform.GAMECUBE,
			GamePlatform.NINTENDO_DS,
			GamePlatform.WII,
			GamePlatform.NINTENDO_3DS,
			GamePlatform.WII_U,
			GamePlatform.SWITCH,
			GamePlatform.SWITCH2
		]
	},
	{
		label: 'Sony',
		platforms: [
			GamePlatform.PS1,
			GamePlatform.PS2,
			GamePlatform.PSP,
			GamePlatform.PS3,
			GamePlatform.PS_VITA,
			GamePlatform.PS4,
			GamePlatform.PS5
		]
	},
	{
		label: 'Microsoft',
		platforms: [
			GamePlatform.XBOX,
			GamePlatform.XBOX_360,
			GamePlatform.XBOX_ONE,
			GamePlatform.XBOX_SERIES
		]
	},
	{
		label: 'Sega',
		platforms: [
			GamePlatform.GENESIS,
			GamePlatform.SEGA_SATURN,
			GamePlatform.DREAMCAST
		]
	},
	{
		label: 'Arcade / Other',
		platforms: [
			GamePlatform.ATARI_2600,
			GamePlatform.NEO_GEO,
			GamePlatform.MAME,
			GamePlatform.ANDROID
		]
	}
];

interface GameEntry {
	id: string;
	name: string;
	cover: string;
	rating: number;
	completionDate: string;
	platform: GamePlatform;
	platinum: boolean;
	dlc: boolean;
	hours: number;
}

function generateGameId(): string {
	return `game-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface BlockConfig {
	isLocked: boolean;
	viewMode: 'grid' | 'table';
	cardWidth: number;
	toolsCollapsed: boolean;
	topGame1: string;
	topGame2: string;
	topGame3: string;
}

interface GameBacklogProfileConfig {
	playerName: string;
	avatar: string;
	path: string;
	totalCompleted: string;
	totalHours: string;
	totalPlatinums: string;
	mostUsedPlatform: string;
	retroAchievementsUrl: string;
	files: string[];
}

type PlatformMode = 'none' | 'label';
type ScoreType = 'stars-5' | 'stars-5-half' | 'stars-10' | 'numeric-10';

interface SGDBGame {
	id: number;
	name: string;
}

interface SGDBGrid {
	id: number;
	url: string;
	thumb: string;
	width: number;
	height: number;
}

interface GameBacklogSettings {
	language: AppLanguage;
	defaultCoverImage: string;
	defaultPlatform: GamePlatform;
	platformMode: PlatformMode;
	scoreType: ScoreType;
	imageDownloadFolder: string;
	cardColor: string;
	textColor: string;
	noImageBackgroundColor: string;
	noImageTextColor: string;
	steamGridDbApiKey: string;
}

const DEFAULT_SETTINGS: GameBacklogSettings = {
	language: 'es',
	defaultCoverImage: '',
	defaultPlatform: GamePlatform.PC,
	platformMode: 'label',
	scoreType: 'stars-5',
	imageDownloadFolder: '',
	cardColor: '#35393d',
	textColor: '',
	noImageBackgroundColor: '',
	noImageTextColor: '',
	steamGridDbApiKey: ''
}

export default class GameBacklogPlugin extends Plugin {
	settings: GameBacklogSettings;
	private static readonly REPO_ASSETS_API_URL = 'https://api.github.com/repos/KevMorelli/obsidian-game-backlog/contents/assets';

	t(key: I18nKey, vars?: Record<string, string | number>): string {
		return translate(this.settings.language, key, vars);
	}

	getDateLocale(): string {
		return this.settings.language === 'en' ? 'en-US' : 'es-ES';
	}

	getScoreBounds(): { min: number; max: number } {
		switch (this.settings.scoreType) {
			case 'stars-5-half':
				return { min: 0.5, max: 5 };
			case 'stars-10':
				return { min: 1, max: 10 };
			case 'numeric-10':
				return { min: 0, max: 10 };
			case 'stars-5':
			default:
				return { min: 1, max: 5 };
		}
	}

	private getScoreStep(): number {
		return this.settings.scoreType === 'stars-5-half' ? 0.5 : 1;
	}

	private getCardWidthBounds(): { min: number; max: number } {
		return { min: 100, max: 188 };
	}

	normalizeCardWidth(rawValue: number): number {
		const { min, max } = this.getCardWidthBounds();
		const value = Number.isFinite(rawValue) ? Math.round(rawValue) : max;
		return Math.max(min, Math.min(max, value));
	}

	getDefaultRatingValue(): number {
		switch (this.settings.scoreType) {
			case 'stars-5-half':
				return 3;
			case 'stars-10':
			case 'numeric-10':
				return 5;
			case 'stars-5':
			default:
				return 3;
		}
	}

	normalizeRatingValue(rawValue: number): number {
		const step = this.getScoreStep();
		const value = Number.isFinite(rawValue)
			? Math.round(rawValue / step) * step
			: 0;
		const { max } = this.getScoreBounds();
		return Math.max(0, Math.min(max, value));
	}

	private getNumericScoreClass(score: number): string {
		if (score <= 4) return 'game-score-low';
		if (score <= 7) return 'game-score-mid';
		return 'game-score-high';
	}

	private renderStars(container: HTMLElement, rating: number, maxStars: number): void {
		const filledStars = Math.floor(rating);
		const hasHalfStar = rating - filledStars >= 0.5;

		for (let i = 1; i <= maxStars; i++) {
			let starClass = 'star empty';
			if (i <= filledStars) {
				starClass = 'star filled';
			} else if (i === filledStars + 1 && hasHalfStar) {
				starClass = 'star half';
			}

			const star = container.createSpan({ cls: starClass });
			star.textContent = '★';
		}
	}

	renderCardRating(container: HTMLElement, rating: number): void {
		const normalizedRating = this.normalizeRatingValue(rating || 0);

		switch (this.settings.scoreType) {
			case 'stars-10':
				container.addClass('game-rating-compact');
				container.textContent = normalizedRating > 0 ? `${normalizedRating} ⭐` : this.t('emptyValue');
				break;
			case 'numeric-10': {
				const scoreCircle = container.createSpan({
					cls: `game-score-circle ${this.getNumericScoreClass(normalizedRating)}`,
					text: String(normalizedRating)
				});
				scoreCircle.setAttribute('aria-label', `${this.t('viewRatingLabel')}${normalizedRating}`);
				break;
			}
			case 'stars-5':
			case 'stars-5-half':
			default:
				this.renderStars(container, normalizedRating, 5);
				break;
		}
	}

	renderDetailRating(container: HTMLElement, rating: number): void {
		const normalizedRating = this.normalizeRatingValue(rating || 0);

		switch (this.settings.scoreType) {
			case 'stars-10':
				this.renderStars(container, normalizedRating, 10);
				break;
			case 'numeric-10': {
				const scoreCircle = container.createSpan({
					cls: `game-score-circle ${this.getNumericScoreClass(normalizedRating)}`,
					text: String(normalizedRating)
				});
				scoreCircle.setAttribute('aria-label', `${this.t('viewRatingLabel')}${normalizedRating}`);
				break;
			}
			case 'stars-5':
			case 'stars-5-half':
			default:
				this.renderStars(container, normalizedRating, 5);
				break;
		}
	}

	renderTableRating(container: HTMLElement, rating: number): void {
		const normalizedRating = this.normalizeRatingValue(rating || 0);

		switch (this.settings.scoreType) {
			case 'numeric-10': {
				const scoreCircle = container.createSpan({
					cls: `game-score-circle game-score-circle-small ${this.getNumericScoreClass(normalizedRating)}`,
					text: String(normalizedRating)
				});
				scoreCircle.setAttribute('aria-label', `${this.t('viewRatingLabel')}${normalizedRating}`);
				break;
			}
			case 'stars-5-half':
				container.textContent = normalizedRating > 0 ? `${normalizedRating.toFixed(1)} ★` : this.t('emptyValue');
				break;
			case 'stars-10':
			case 'stars-5':
			default:
				container.textContent = normalizedRating > 0 ? `${normalizedRating} ★` : this.t('emptyValue');
				break;
		}
	}

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'insert-game-backlog-block',
			name: this.t('commandInsertBlock'),
			editorCallback: (editor) => {
				const defaultPlatform = this.settings.defaultPlatform || GamePlatform.PC;
				const defaultBlock = [
					'```game-backlog',
					'isLocked: false',
					'viewMode: grid',
					'cardWidth: 188',
					'toolsCollapsed: true',
					'---',
					'id: ',
					'name: ',
					'cover: ',
					'rating: 3',
					'date: ',
					`platform: ${defaultPlatform}`,
					'hours: 0',
					'platinum: false',
					'dlc: false',
					'```'
				].join('\n');

				editor.replaceSelection(defaultBlock);
			}
		});

		this.addCommand({
			id: 'insert-game-backlog-profile-block',
			name: this.t('commandInsertProfileBlock'),
			editorCallback: (editor) => {
				const defaultBlock = [
					'```game-backlog-profile',
					'playerName: Player 1',
					'avatar: ',
					'path: ',
					'totalCompleted: ',
					'totalHours: ',
					'platinums: ',
					'mostUsedPlatform: ',
					'files: ',
					'```'
				].join('\n');

				editor.replaceSelection(defaultBlock);
			}
		});

		// Registrar el procesador para bloques de código con lenguaje "game-backlog"
		this.registerMarkdownCodeBlockProcessor('game-backlog', (source, el, ctx) => {
			try {
				this.renderGameBacklog(source, el, ctx);
			} catch {
				el.createDiv({ text: this.t('renderError') });
			}
		});

		this.registerMarkdownCodeBlockProcessor('game-backlog-profile', async (source, el, ctx) => {
			try {
				await this.renderGameBacklogProfile(source, el, ctx);
			} catch {
				el.createDiv({ text: this.t('renderError') });
			}
		});

		// Agregar tab de configuración
		this.addSettingTab(new GameBacklogSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		const rawData = ((await this.loadData()) ?? {}) as Partial<GameBacklogSettings> & { showPlatform?: boolean };
		const { showPlatform, ...rest } = rawData;

		const rawPlatformMode = (rawData.platformMode as string) === 'image' ? 'label' : rawData.platformMode;
		const migratedPlatformMode: PlatformMode = rawPlatformMode
			?? (typeof showPlatform === 'boolean' ? (showPlatform ? 'label' : 'none') : DEFAULT_SETTINGS.platformMode);

		this.settings = Object.assign({}, DEFAULT_SETTINGS, rest, { platformMode: migratedPlatformMode });

		if (!rawData.platformMode && typeof showPlatform === 'boolean') {
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async ensureAdapterFolder(path: string): Promise<void> {
		const adapter = this.app.vault.adapter as unknown as {
			exists?: (path: string) => Promise<boolean>;
			mkdir?: (path: string) => Promise<void>;
		};

		if (!path || typeof adapter.mkdir !== 'function') return;

		const parts = path.split('/').filter(Boolean);
		let currentPath = '';

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			if (typeof adapter.exists === 'function') {
				const exists = await adapter.exists(currentPath);
				if (exists) continue;
			}

			try {
				await adapter.mkdir(currentPath);
			} catch (error) {
				const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
				if (!message.includes('exist')) {
					throw error;
				}
			}
		}
	}

	async downloadPluginAssetsFromRepo(): Promise<void> {
		const pluginAssetsFolder = `${this.app.vault.configDir}/plugins/${this.manifest.id}/assets`;
		const adapter = this.app.vault.adapter as unknown as {
			writeBinary?: (path: string, data: ArrayBuffer) => Promise<void>;
		};

		if (typeof adapter.writeBinary !== 'function') {
			new Notice(this.t('noticeAssetsSyncUnsupported'));
			return;
		}

		new Notice(this.t('noticeAssetsSyncStarted'));

		try {
			await this.ensureAdapterFolder(pluginAssetsFolder);

			const listingResponse = await requestUrl({
				url: GameBacklogPlugin.REPO_ASSETS_API_URL,
				method: 'GET',
				headers: {
					Accept: 'application/vnd.github+json',
					'User-Agent': 'obsidian-game-backlog-plugin'
				}
			});

			const assets = JSON.parse(listingResponse.text) as Array<{
				type: string;
				name: string;
				download_url: string | null;
			}>;

			const files = assets.filter((asset) => asset.type === 'file' && typeof asset.download_url === 'string');
			if (!files.length) {
				new Notice(this.t('noticeAssetsSyncNoFiles'));
				return;
			}

			let downloadedCount = 0;
			for (const file of files) {
				const fileResponse = await requestUrl({
					url: file.download_url as string,
					method: 'GET',
					headers: {
						'User-Agent': 'obsidian-game-backlog-plugin'
					}
				});

				await adapter.writeBinary(`${pluginAssetsFolder}/${file.name}`, fileResponse.arrayBuffer);
				downloadedCount += 1;
			}

			new Notice(this.t('noticeAssetsSyncSuccess', { count: downloadedCount }));
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(this.t('noticeAssetsSyncError', { error: errorMsg }));
		}
	}

	async searchSteamGridDB(term: string): Promise<SGDBGame[]> {
		const response = await requestUrl({
			url: `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(term)}`,
			method: 'GET',
			headers: {
				Authorization: `Bearer ${this.settings.steamGridDbApiKey}`,
				'User-Agent': 'obsidian-game-backlog-plugin'
			}
		});
		const data = JSON.parse(response.text) as { success: boolean; data: SGDBGame[] };
		if (!data.success) return [];
		return data.data || [];
	}

	async getSteamGridDBGrids(gameId: number): Promise<SGDBGrid[]> {
		const response = await requestUrl({
			url: `https://www.steamgriddb.com/api/v2/grids/game/${gameId}`,
			method: 'GET',
			headers: {
				Authorization: `Bearer ${this.settings.steamGridDbApiKey}`,
				'User-Agent': 'obsidian-game-backlog-plugin'
			}
		});
		const data = JSON.parse(response.text) as { success: boolean; data: SGDBGrid[] };
		if (!data.success) return [];
		return data.data || [];
	}

	parseGameEntries(source: string): GameEntry[] {
		const entries: GameEntry[] = [];
		const lines = source.trim().split('\n');
		
		let currentGame: Partial<GameEntry> = {};
		
		for (const line of lines) {
			const trimmed = line.trim();
			
			if (!trimmed || trimmed.startsWith('#')) continue;
			
			if (trimmed.startsWith('---')) {
				// Nuevo juego
				if (currentGame.name) {
					if (!currentGame.id) {
						currentGame.id = generateGameId();
					}
					if (!currentGame.platform) {
						currentGame.platform = this.settings.defaultPlatform;
					}
					if (typeof currentGame.platinum !== 'boolean') {
						currentGame.platinum = false;
					}
					if (typeof currentGame.dlc !== 'boolean') {
						currentGame.dlc = false;
					}
					if (typeof currentGame.hours !== 'number') {
						currentGame.hours = 0;
					}
					entries.push(currentGame as GameEntry);
				}
				currentGame = {};
				continue;
			}
			
			const [key, ...valueParts] = trimmed.split(':');
			const value = valueParts.join(':').trim();
			
			if (!value) continue;
			
			switch (key.toLowerCase()) {
				case 'id':
					currentGame.id = value;
					break;
				case 'name':
					currentGame.name = value;
					break;
				case 'cover':
					currentGame.cover = value;
					break;
				case 'rating':
					currentGame.rating = parseFloat(value) || 0;
					break;
				case 'date':
					currentGame.completionDate = value;
					break;
				case 'platform':
					currentGame.platform = this.parsePlatform(value);
					break;
				case 'hours':
					currentGame.hours = parseFloat(value) || 0;
					break;
				case 'platinum':
					currentGame.platinum = ['true', '1', 'yes'].includes(value.toLowerCase());
					break;
				case 'dlc':
					currentGame.dlc = ['true', '1', 'yes'].includes(value.toLowerCase());
					break;
			}
		}
		
		// Agregar el último juego si existe
		if (currentGame.name) {
			if (!currentGame.id) {
				currentGame.id = generateGameId();
			}
			if (!currentGame.platform) {
				currentGame.platform = this.settings.defaultPlatform;
			}
			if (typeof currentGame.platinum !== 'boolean') {
				currentGame.platinum = false;
			}
			if (typeof currentGame.dlc !== 'boolean') {
				currentGame.dlc = false;
			}
			if (typeof currentGame.hours !== 'number') {
				currentGame.hours = 0;
			}
			entries.push(currentGame as GameEntry);
		}
		
		return entries;
	}

	parsePlatform(value: string): GamePlatform {
		const trimmed = value.trim();
		const platforms = Object.values(GamePlatform) as string[];
		const fallbackPlatform = this.settings.defaultPlatform || DEFAULT_SETTINGS.defaultPlatform;

		if (!trimmed) {
			return fallbackPlatform;
		}

		if (platforms.includes(trimmed)) {
			return trimmed as GamePlatform;
		}

		const normalized = trimmed.toLowerCase();
		const caseInsensitiveMatch = platforms.find((platform) => platform.toLowerCase() === normalized);
		return caseInsensitiveMatch ? (caseInsensitiveMatch as GamePlatform) : fallbackPlatform;
	}

	async downloadRemoteImage(url: string, destFolder: string | null, sourceFile: TFile): Promise<string> {
		try {
			if (!url || !/^https?:\/\//.test(url)) {
				return url;
			}

			// Determinar carpeta destino: si no está configurada, usar la misma del archivo
			const targetFolder = destFolder || sourceFile.parent?.path || '';

			// Crear directorio si no existe
			const targetPath = this.app.vault.adapter as unknown as { mkdir?: (path: string) => Promise<void> };
			if (typeof targetPath.mkdir === 'function' && targetFolder) {
				await targetPath.mkdir(targetFolder);
			}

			// Obtener nombre del archivo de la URL
			const urlParts = new URL(url);
			const fileName = urlParts.pathname.split('/').pop() || `image-${Date.now()}.png`;

			// Construir ruta de destino completa
			const filePath = targetFolder ? `${targetFolder}/${fileName}` : fileName;

			// Intentar descargar con múltiples estrategias
			let arrayBuffer: ArrayBuffer | null = null;
			let firstAttemptError: string | null = null;
			let secondAttemptError: string | null = null;

			// Estrategia 1: requestUrl (Obsidian desktop request, evita problemas típicos de CORS)
			try {
				const response = await requestUrl({
					url,
					method: 'GET',
					headers: {
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
					}
				});
				arrayBuffer = response.arrayBuffer;
			} catch (error) {
				firstAttemptError = error instanceof Error ? error.message : String(error);
			}

			// Estrategia 2: segundo intento con requestUrl sin cabeceras personalizadas
			try {
				if (!arrayBuffer) {
					const fallbackResponse = await requestUrl({
						url,
						method: 'GET'
					});
					arrayBuffer = fallbackResponse.arrayBuffer;
				}
			} catch (error) {
				secondAttemptError = error instanceof Error ? error.message : String(error);
			}

			if (!arrayBuffer) {
				const attemptDetails = [firstAttemptError, secondAttemptError]
					.filter((detail): detail is string => Boolean(detail && detail.trim()))
					.join(' | ');

				throw new Error(
					attemptDetails
						? `${this.t('downloadErrorUnavailable')} (${attemptDetails})`
						: this.t('downloadErrorUnavailable')
				);
			}

			// Guardar archivo, sobrescribiendo si existe
			const existingFile = this.app.vault.getAbstractFileByPath(filePath);
			if (existingFile instanceof TFile) {
				await this.app.vault.modifyBinary(existingFile, arrayBuffer);
			} else {
				await this.app.vault.createBinary(filePath, arrayBuffer);
			}

			// Retornar referencia obsidian
			return filePath;
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(this.t('downloadErrorPrefix', { error: errorMsg }));
			return url;
		}
	}

	getPluginAssetUrl(fileName: string): string {
		if (!fileName) return '';

		const assetPath = `${this.app.vault.configDir}/plugins/${this.manifest.id}/assets/${fileName}`;
		const runtimeAsset = this.app.vault.getAbstractFileByPath(assetPath);
		if (runtimeAsset instanceof TFile) {
			return this.app.vault.getResourcePath(runtimeAsset);
		}

		const localAssetPath = `assets/${fileName}`;
		const localAsset = this.app.vault.getAbstractFileByPath(localAssetPath);
		if (localAsset instanceof TFile) {
			return this.app.vault.getResourcePath(localAsset);
		}

		const adapter = this.app.vault.adapter as unknown as { getResourcePath?: (path: string) => string };

		if (typeof adapter.getResourcePath === 'function') {
			return adapter.getResourcePath(assetPath);
		}

		return assetPath;
	}

	getPluginAssetFallbackUrl(fileName: string): string {
		if (!fileName) return '';
		return `https://raw.githubusercontent.com/KevMorelli/obsidian-game-backlog/main/assets/${encodeURIComponent(fileName)}`;
	}

	resolveImageSource(rawPath: string, sourcePath: string = ''): string {
		if (!rawPath) return '';
		const configDirPrefix = `${this.app.vault.configDir}/`;

		// Si es una URL o data URI, retornar directamente
		if (/^(https?:\/\/|data:|app:|blob:)/i.test(rawPath)) {
			return rawPath;
		}

		// Si comienza con la carpeta de configuración del vault, es relativo al vault root
		if (rawPath.startsWith(configDirPrefix)) {
			const file = this.app.vault.getAbstractFileByPath(rawPath);
			if (file instanceof TFile) {
				return this.app.vault.getResourcePath(file);
			}
			return '';
		}

		// Intentar resolver como enlace o ruta de archivo del vault
		const linked = this.app.metadataCache.getFirstLinkpathDest(rawPath, sourcePath);
		if (linked instanceof TFile) {
			return this.app.vault.getResourcePath(linked);
		}

		const byPath = this.app.vault.getAbstractFileByPath(rawPath);
		if (byPath instanceof TFile) {
			return this.app.vault.getResourcePath(byPath);
		}

		return '';
	}

	private parseCompletionDate(rawDate: string): Date | null {
		const dateOnlyMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (dateOnlyMatch) {
			const year = Number(dateOnlyMatch[1]);
			const month = Number(dateOnlyMatch[2]);
			const day = Number(dateOnlyMatch[3]);
			const parsed = new Date(year, month - 1, day);

			if (
				parsed.getFullYear() === year
				&& parsed.getMonth() === month - 1
				&& parsed.getDate() === day
			) {
				return parsed;
			}

			return null;
		}

		const parsed = new Date(rawDate);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	private normalizeCssColor(rawValue: string): string {
		const value = rawValue.trim();
		if (!value) return '';
		if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
			return value;
		}

		return CSS.supports('color', value) ? value : '';
	}

	formatCompletionDate(rawDate: string): string {
		const parsed = this.parseCompletionDate(rawDate);
		if (!parsed) return rawDate;

		const locale = this.getDateLocale();
		return new Intl.DateTimeFormat(locale, {
			day: 'numeric',
			month: 'long'
		}).format(parsed);
	}

	formatCompletionDateWithYear(rawDate: string): string {
		const parsed = this.parseCompletionDate(rawDate);
		if (!parsed) return rawDate;

		const locale = this.getDateLocale();
		return new Intl.DateTimeFormat(locale, {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		}).format(parsed);
	}

	parseBlockConfig(source: string): BlockConfig {
		const config: BlockConfig = {
			isLocked: false,
			viewMode: 'grid',
			cardWidth: this.getCardWidthBounds().max,
			toolsCollapsed: true,
			topGame1: '',
			topGame2: '',
			topGame3: ''
		};
		const lines = source.split('\n');
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('---')) break;
			const colonIdx = trimmed.indexOf(':');
			if (colonIdx === -1) continue;
			const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
			const value = trimmed.slice(colonIdx + 1).trim();
			switch (key) {
				case 'islocked': config.isLocked = value === 'true'; break;
				case 'viewmode': config.viewMode = value === 'table' ? 'table' : 'grid'; break;
				case 'cardwidth': config.cardWidth = this.normalizeCardWidth(parseInt(value, 10)); break;
				case 'toolscollapsed': config.toolsCollapsed = value !== 'false'; break;
				case 'topgame1': config.topGame1 = value; break;
				case 'topgame2': config.topGame2 = value; break;
				case 'topgame3': config.topGame3 = value; break;
			}
		}
		return config;
	}

	async saveBlockConfig(ctx: MarkdownPostProcessorContext, config: BlockConfig): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);
		const codeBlockRegex = /```game-backlog\n([\s\S]*?)```/;
		const match = content.match(codeBlockRegex);
		if (!match) return;

		const originalBlock = match[1];
		const firstDashIdx = originalBlock.indexOf('---');
		const entriesPart = firstDashIdx !== -1 ? originalBlock.slice(firstDashIdx) : originalBlock;

		const configSection = `isLocked: ${config.isLocked}\nviewMode: ${config.viewMode}\ncardWidth: ${config.cardWidth}\ntoolsCollapsed: ${config.toolsCollapsed}\ntopGame1: ${config.topGame1}\ntopGame2: ${config.topGame2}\ntopGame3: ${config.topGame3}\n`;
		const newBlock = configSection + entriesPart;
		const newContent = content.replace(codeBlockRegex, '```game-backlog\n' + newBlock + '```');
		await this.app.vault.modify(file, newContent);
	}

	parseProfileConfig(source: string): GameBacklogProfileConfig {
		const config: GameBacklogProfileConfig = {
			playerName: this.t('profileDefaultPlayer'),
			avatar: '',
			path: '',
			totalCompleted: '',
			totalHours: '',
			totalPlatinums: '',
			mostUsedPlatform: '',
			retroAchievementsUrl: '',
			files: []
		};

		let legacyScope: 'vault' | 'folder' = 'vault';
		let legacyFolder = '';
		const lines = source.split('\n');
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;

			const colonIdx = trimmed.indexOf(':');
			if (colonIdx === -1) continue;

			const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
			const value = trimmed.slice(colonIdx + 1).trim();

			switch (key) {
				case 'player':
				case 'playername':
				case 'name':
					config.playerName = value || config.playerName;
					break;
				case 'avatar':
					config.avatar = value;
					break;
				case 'path':
					config.path = value.replace(/^\/+|\/+$/g, '');
					break;
				case 'scope':
					legacyScope = value.toLowerCase() === 'folder' ? 'folder' : 'vault';
					break;
				case 'folder':
					legacyFolder = value.replace(/^\/+|\/+$/g, '');
					break;
				case 'totalcompleted':
					config.totalCompleted = value;
					break;
				case 'totalhours':
					config.totalHours = value;
					break;
				case 'platinums':
					config.totalPlatinums = value;
					break;
				case 'mostusedplatform':
					config.mostUsedPlatform = value;
					break;
				case 'retroachievements':
					config.retroAchievementsUrl = value;
					break;
				case 'files':
					config.files = value
						? value.split('|').map((item) => item.trim()).filter(Boolean)
						: [];
					break;
				case 'file':
					if (value) {
						config.files.push(value);
					}
					break;
			}
		}

		if (!config.path && legacyScope === 'folder' && legacyFolder) {
			config.path = legacyFolder;
		}

		config.files = Array.from(new Set(config.files));
		return config;
	}

	private extractGameBacklogBlocks(content: string): string[] {
		const blocks: string[] = [];
		const regex = /```game-backlog\s*\n([\s\S]*?)```/g;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(content)) !== null) {
			blocks.push(match[1]);
		}

		return blocks;
	}

	private async collectGamesForProfile(config: GameBacklogProfileConfig): Promise<{ games: GameEntry[]; backlogFiles: TFile[] }> {
		const normalizedPath = config.path.trim().replace(/^\/+|\/+$/g, '');
		const markdownFiles = this.app.vault.getMarkdownFiles();
		const candidateFiles = normalizedPath
			? markdownFiles.filter((file) => file.path.startsWith(`${normalizedPath}/`))
			: markdownFiles;

		const results = await Promise.all(candidateFiles.map(async (file) => {
			const content = await this.app.vault.cachedRead(file);
			const blocks = this.extractGameBacklogBlocks(content);

			if (!blocks.length) {
				return { file, games: [] as GameEntry[], hasBacklog: false };
			}

			const fileGames: GameEntry[] = [];
			for (const block of blocks) {
				fileGames.push(...this.parseGameEntries(block));
			}

			return { file, games: fileGames, hasBacklog: true };
		}));

		const games: GameEntry[] = [];
		const backlogFiles: TFile[] = [];

		for (const result of results) {
			if (result.hasBacklog) {
				backlogFiles.push(result.file);
			}
			games.push(...result.games);
		}

		return { games, backlogFiles };
	}

	private getMostUsedPlatform(games: GameEntry[]): string {
		const platformCount = new Map<string, number>();

		for (const game of games) {
			const platform = (game.platform || '').trim();
			if (!platform) continue;
			platformCount.set(platform, (platformCount.get(platform) ?? 0) + 1);
		}

		let mostUsed = '';
		let highestCount = 0;

		for (const [platform, count] of platformCount.entries()) {
			if (count > highestCount) {
				mostUsed = platform;
				highestCount = count;
			}
		}

		return mostUsed || this.t('emptyValue');
	}

	private isProfileDataEmpty(config: GameBacklogProfileConfig): boolean {
		return !config.totalCompleted || !config.totalHours || !config.totalPlatinums || !config.mostUsedPlatform;
	}

	private resolveProfileFiles(config: GameBacklogProfileConfig): TFile[] {
		return config.files
			.map((filePath) => this.app.vault.getAbstractFileByPath(filePath))
			.filter((file): file is TFile => file instanceof TFile);
	}

	private async saveProfileBlockData(ctx: MarkdownPostProcessorContext, config: GameBacklogProfileConfig): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);
		const codeBlockRegex = /```game-backlog-profile\n([\s\S]*?)```/;
		if (!codeBlockRegex.test(content)) return;

		const lines = [
			`playerName: ${config.playerName}`,
			`avatar: ${config.avatar}`,
			`path: ${config.path}`,
			`totalCompleted: ${config.totalCompleted}`,
			`totalHours: ${config.totalHours}`,
			`platinums: ${config.totalPlatinums}`,
			`mostUsedPlatform: ${config.mostUsedPlatform}`,
			`retroAchievements: ${config.retroAchievementsUrl}`
		];

		if (config.files.length > 0) {
			config.files.forEach((filePath) => {
				lines.push(`file: ${filePath}`);
			});
		} else {
			lines.push('files: ');
		}

		const newContent = content.replace(codeBlockRegex, `\`\`\`game-backlog-profile\n${lines.join('\n')}\n\`\`\``);
		if (newContent !== content) {
			await this.app.vault.modify(file, newContent);
		}
	}

	private async recalculateProfileData(ctx: MarkdownPostProcessorContext, config: GameBacklogProfileConfig): Promise<TFile[]> {
		const { games, backlogFiles } = await this.collectGamesForProfile(config);
		const totalCompleted = games.length;
		const totalHours = games.reduce((sum, game) => sum + (game.hours || 0), 0);
		const totalPlatinums = games.filter((game) => game.platinum).length;
		const mostUsedPlatform = this.getMostUsedPlatform(games);
		const formattedHours = Number.isInteger(totalHours) ? String(totalHours) : totalHours.toFixed(1);

		config.totalCompleted = String(totalCompleted);
		config.totalHours = formattedHours;
		config.totalPlatinums = String(totalPlatinums);
		config.mostUsedPlatform = mostUsedPlatform;
		config.files = Array.from(new Set(backlogFiles.map((file) => file.path)));

		await this.saveProfileBlockData(ctx, config);
		return backlogFiles;
	}

	async renderGameBacklogProfile(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
		const config = this.parseProfileConfig(source);
		const container = el.createDiv({ cls: 'game-backlog-profile-container' });
		const playerName = config.playerName || this.t('profileDefaultPlayer');
		const avatarSource = this.resolveImageSource(config.avatar, ctx.sourcePath);

		let renderProfileContent: (forceRefresh?: boolean) => Promise<void>;
		const appendRefreshToolbar = (parent: HTMLElement, disabled: boolean = false): void => {
			const toolbar = parent.createDiv({ cls: 'game-backlog-profile-toolbar' });
			const refreshButton = toolbar.createEl('button', {
				cls: 'game-backlog-profile-refresh-button',
				text: '🔄'
			});
			refreshButton.title = this.t('profileRefreshTooltip');
			refreshButton.setAttribute('aria-label', this.t('profileRefreshTooltip'));
			refreshButton.disabled = disabled;
			refreshButton.addEventListener('click', () => {
				void renderProfileContent(true);
			});
		};

		const renderProfileView = (backlogFiles: TFile[]): void => {
			container.empty();
			appendRefreshToolbar(container);

			const header = container.createDiv({ cls: 'game-backlog-profile-header' });
			const avatarWrapper = header.createDiv({ cls: 'game-backlog-profile-avatar-wrapper' });
			const fallbackAvatar = avatarWrapper.createDiv({ cls: 'game-backlog-profile-avatar-fallback' });
			const initials = playerName
				.split(/\s+/)
				.filter(Boolean)
				.slice(0, 2)
				.map((part) => part.charAt(0).toUpperCase())
				.join('');
			fallbackAvatar.textContent = initials || '🎮';

			if (avatarSource) {
				const avatar = avatarWrapper.createEl('img', {
					cls: 'game-backlog-profile-avatar',
					attr: {
						src: avatarSource,
						alt: playerName
					}
				});

				avatar.onerror = () => {
					avatar.remove();
				};
			}

			const heading = header.createDiv({ cls: 'game-backlog-profile-heading' });
			heading.createEl('h3', { cls: 'game-backlog-profile-player-name', text: playerName });

			const statsList = container.createDiv({ cls: 'game-backlog-profile-stats-list' });
			[
				{ emoji: '✅', label: this.t('profileStatCompleted'), value: config.totalCompleted },
				{ emoji: '⏱️', label: this.t('profileStatHours'), value: `${config.totalHours} hs` },
				{ emoji: '🏆', label: this.t('profileStatPlatinums'), value: config.totalPlatinums },
				{ emoji: '🎮', label: this.t('profileStatMostUsedPlatform'), value: config.mostUsedPlatform }
			].forEach((stat) => {
				const row = statsList.createDiv({ cls: 'game-backlog-profile-stat-row' });
				row.createSpan({ cls: 'game-backlog-profile-stat-label-inline', text: `${stat.emoji} ${stat.label}` });
				row.createSpan({ cls: 'game-backlog-profile-stat-value-inline', text: stat.value || this.t('emptyValue') });
			});

			if (config.retroAchievementsUrl) {
				const raBase = 'https://retroachievements.org/user/';
				const isFullUrl = /^https?:\/\//i.test(config.retroAchievementsUrl);
				const raFullUrl = isFullUrl
					? config.retroAchievementsUrl
					: `${raBase}${config.retroAchievementsUrl}`;
				const raUsername = isFullUrl
					? config.retroAchievementsUrl.replace(/\/+$/, '').split('/').pop() || config.retroAchievementsUrl
					: config.retroAchievementsUrl;
				const raRow = statsList.createDiv({ cls: 'game-backlog-profile-stat-row game-backlog-profile-ra-row' });
				raRow.createSpan({ cls: 'game-backlog-profile-stat-label-inline', text: `🏅 ${this.t('profileRetroAchievements')}` });
				const raLink = raRow.createEl('a', {
					cls: 'game-backlog-profile-ra-link',
					text: raUsername,
					attr: {
						href: raFullUrl,
						target: '_blank',
						rel: 'noopener noreferrer'
					}
				});
				raLink.addEventListener('click', (event) => {
					event.preventDefault();
					window.open(raFullUrl, '_blank', 'noopener,noreferrer');
				});
			}

			if (backlogFiles.length > 0) {
				const filesSection = container.createDiv({ cls: 'game-backlog-profile-files' });
				const filesList = filesSection.createDiv({ cls: 'game-backlog-profile-files-list' });
				[...backlogFiles]
					.sort((a, b) => a.basename.localeCompare(b.basename, undefined, { sensitivity: 'base' }))
					.forEach((file) => {
						const link = filesList.createEl('a', {
							cls: 'game-backlog-profile-file-link',
							text: file.basename,
							attr: {
								href: '#',
								title: file.path
							}
						});

						link.addEventListener('click', (event) => {
							event.preventDefault();
							void this.app.workspace.getLeaf(false).openFile(file);
						});
					});
			}

			if (config.totalCompleted === '0') {
				container.createDiv({ cls: 'game-backlog-profile-empty', text: this.t('profileNoGames') });
			}
		};

		renderProfileContent = async (forceRefresh: boolean = false) => {
			const shouldRefresh = forceRefresh || this.isProfileDataEmpty(config);

			if (shouldRefresh) {
				container.empty();
				appendRefreshToolbar(container, true);
				container.createDiv({ cls: 'game-backlog-profile-loading', text: this.t('profileLoading') });

				try {
					const backlogFiles = await this.recalculateProfileData(ctx, config);
					renderProfileView(backlogFiles);
				} catch {
					container.empty();
					appendRefreshToolbar(container);
					container.createDiv({ cls: 'game-backlog-profile-empty', text: this.t('renderError') });
				}
				return;
			}

			renderProfileView(this.resolveProfileFiles(config));
		};

		await renderProfileContent();
	}

	renderGameBacklog(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const games = this.parseGameEntries(source);
		const blockConfig = this.parseBlockConfig(source);
		
		// Contenedor principal
		const container = el.createDiv({ cls: 'game-backlog-container' });
		const cardWidth = this.normalizeCardWidth(blockConfig.cardWidth);
		blockConfig.cardWidth = cardWidth;
		container.style.setProperty('--game-card-width', `${cardWidth}px`);
		
		// Estado de vista (tarjetas o tabla)
		let isTableView = blockConfig.viewMode === 'table';
		
		// Contenedor de controles
		const controlsContainer = container.createDiv({ cls: 'game-backlog-controls' });
		const toolbarToggleButton = controlsContainer.createEl('button', { cls: 'game-tools-toggle' });
		const toolsContainer = controlsContainer.createDiv({ cls: 'game-backlog-tools' });
		const cardSizeControl = toolsContainer.createDiv({ cls: 'game-card-size-control' });
		cardSizeControl.createSpan({ cls: 'game-card-size-label', text: this.t('cardSizeLabel') });
		const cardSizeSlider = cardSizeControl.createEl('input', { cls: 'game-card-size-slider' });
		cardSizeSlider.type = 'range';
		cardSizeSlider.min = String(this.getCardWidthBounds().min);
		cardSizeSlider.max = String(this.getCardWidthBounds().max);
		cardSizeSlider.step = '1';
		cardSizeSlider.value = String(cardWidth);
		const cardSizeValue = cardSizeControl.createSpan({ cls: 'game-card-size-value', text: `${cardWidth}px` });

		const setToolsCollapsed = (collapsed: boolean): void => {
			blockConfig.toolsCollapsed = collapsed;
			toolsContainer.classList.toggle('is-collapsed', collapsed);
			toolbarToggleButton.textContent = collapsed ? '<' : '>';
			toolbarToggleButton.title = collapsed ? this.t('toolbarExpandTitle') : this.t('toolbarCollapseTitle');
			toolbarToggleButton.setAttribute('aria-label', collapsed ? this.t('toolbarExpandTitle') : this.t('toolbarCollapseTitle'));
		};

		toolbarToggleButton.addEventListener('click', () => {
			const isCollapsed = toolsContainer.classList.contains('is-collapsed');
			setToolsCollapsed(!isCollapsed);
			void this.saveBlockConfig(ctx, blockConfig);
		});

		setToolsCollapsed(blockConfig.toolsCollapsed);

		const applyCardWidth = (rawValue: number, shouldPersist: boolean): void => {
			const normalizedWidth = this.normalizeCardWidth(rawValue);
			blockConfig.cardWidth = normalizedWidth;
			container.style.setProperty('--game-card-width', `${normalizedWidth}px`);
			cardSizeSlider.value = String(normalizedWidth);
			cardSizeValue.textContent = `${normalizedWidth}px`;
			renderCards();
			if (shouldPersist) {
				void this.saveBlockConfig(ctx, blockConfig);
			}
		};

		cardSizeSlider.addEventListener('input', () => {
			applyCardWidth(Number(cardSizeSlider.value), false);
		});
		cardSizeSlider.addEventListener('change', () => {
			applyCardWidth(Number(cardSizeSlider.value), true);
		});
		
		// Botón de toggle vista
		const toggleButton = toolsContainer.createEl('button', { cls: 'game-view-toggle', text: isTableView ? '🃏' : '📊' });
		toggleButton.title = this.t('toggleViewTitle');

		// Botón de candado
		const lockButton = toolsContainer.createEl('button', { cls: 'game-lock-toggle' });
		lockButton.textContent = blockConfig.isLocked ? '🔒' : '🔓';
		lockButton.title = blockConfig.isLocked ? this.t('lockTitleLocked') : this.t('lockTitleUnlocked');
		lockButton.addEventListener('click', () => {
			void (async () => {
				blockConfig.isLocked = !blockConfig.isLocked;
				await this.saveBlockConfig(ctx, blockConfig);
				lockButton.textContent = blockConfig.isLocked ? '🔒' : '🔓';
				lockButton.title = blockConfig.isLocked ? this.t('lockTitleLocked') : this.t('lockTitleUnlocked');
				if (isTableView) {
					renderTable();
				} else {
					renderCards();
				}
				statsContainer.empty();
				renderStats();
			})();
		});
		
		// Contenedor para vista de tarjetas
		const cardsContainer = container.createDiv({ cls: 'game-backlog-cards-view' });
		
		// Contenedor para vista de tabla
		const tableContainer = container.createDiv({ cls: 'game-backlog-table-view' });

		const setContainerVisibility = (target: HTMLElement, visible: boolean): void => {
			target.classList.toggle('game-backlog-hidden', !visible);
		};
		
		// Sección de estadísticas
		const statsContainer = container.createDiv({ cls: 'game-stats-container' });
		
		// Función para renderizar tarjetas
		const renderCards = () => {
			cardsContainer.empty();
			const grid = cardsContainer.createDiv({ cls: 'game-backlog-grid' });
			const compactCards = blockConfig.cardWidth < 135;
		
		games.forEach(game => {
			let card: HTMLElement;
			if (game.platinum) {
				const wrapper = grid.createDiv({ cls: 'game-card-platinum-wrapper' });
				card = wrapper.createDiv({ cls: 'game-card' });
			} else {
				card = grid.createDiv({ cls: 'game-card' });
			}

			const cardColor = this.normalizeCssColor(this.settings.cardColor || '');
			const textColor = this.normalizeCssColor(this.settings.textColor || '');
			if (cardColor) {
				card.style.setProperty('--game-card-bg', cardColor);
			}
			if (textColor) {
				card.style.setProperty('--game-card-text', textColor);
			}
			
			// Imagen de portada
			const coverContainer = card.createDiv({ cls: 'game-cover-container' });
			const noImageBackgroundColor = this.normalizeCssColor(this.settings.noImageBackgroundColor || '');
			const noImageTextColor = this.normalizeCssColor(this.settings.noImageTextColor || '');
			if (noImageBackgroundColor) {
				coverContainer.style.setProperty('--game-no-image-bg', noImageBackgroundColor);
			}
			if (noImageTextColor) {
				coverContainer.style.setProperty('--game-no-image-text', noImageTextColor);
			}
			const nameOverlay = coverContainer.createDiv({ cls: 'game-name-overlay' });
			nameOverlay.textContent = game.name || this.t('noName');

			const normalizeCoverValue = (value: string): string => {
				const normalized = (value || '').trim();
				const emptyAliases = ['null', 'undefined', 'none', 'n/a', 'na', '-'];
				return emptyAliases.includes(normalized.toLowerCase()) ? '' : normalized;
			};

			const gameCover = normalizeCoverValue(game.cover || '');
			const defaultCover = normalizeCoverValue(this.settings.defaultCoverImage || '');
			const resolvedGameCover = this.resolveImageSource(gameCover, ctx.sourcePath);
			const resolvedDefaultCover = this.resolveImageSource(defaultCover, ctx.sourcePath);
			const coverSource = resolvedGameCover || resolvedDefaultCover;

			if (coverSource) {
				const cover = coverContainer.createEl('img', {
					cls: 'game-cover',
					attr: {
						src: coverSource,
						alt: game.name || this.t('noName')
					}
				});

				// Si falla la portada del juego, intentar con default. Si no hay default, mostrar solo nombre.
				cover.onerror = () => {
					if (resolvedDefaultCover && coverSource !== resolvedDefaultCover) {
						cover.src = resolvedDefaultCover;
						return;
					}

					cover.remove();
					coverContainer.addClass('game-cover-no-image');
					nameOverlay.addClass('game-name-overlay-static');
				};
			} else {
				coverContainer.addClass('game-cover-no-image');
				nameOverlay.addClass('game-name-overlay-static');
			}

			if (game.platinum) {
				const platinumLocalSource = this.getPluginAssetUrl('Platinum.png');
				const platinumFallbackSource = this.getPluginAssetFallbackUrl('Platinum.png');
				const initialPlatinumSource = platinumLocalSource || platinumFallbackSource;
				let triedPlatinumFallback = !platinumLocalSource;

				const platinumBadge = coverContainer.createEl('img', {
					cls: 'game-platinum-badge',
					attr: {
						src: initialPlatinumSource,
						alt: this.t('platinumBadgeAlt')
					}
				});

				platinumBadge.onerror = () => {
					if (!triedPlatinumFallback && platinumFallbackSource) {
						triedPlatinumFallback = true;
						platinumBadge.src = platinumFallbackSource;
						return;
					}

					platinumBadge.remove();
				};
			}

			if (game.dlc) {
				const dlcBadge = coverContainer.createDiv({ cls: 'game-dlc-badge' });
				dlcBadge.textContent = this.t('dlcBadgeAlt');
			}

			if (!compactCards) {
				// Información del juego
				const info = card.createDiv({ cls: 'game-info' });
				
				// Rating (estrellas)
				const ratingContainer = info.createDiv({ cls: 'game-rating' });
				this.renderCardRating(ratingContainer, game.rating || 0);
				
				// Fecha y plataforma
				const details = info.createDiv({ cls: 'game-details' });
				
				if (game.completionDate) {
					const date = details.createDiv({ cls: 'game-date' });
					date.textContent = `📅 ${this.formatCompletionDate(game.completionDate)}`;
				}

				if (this.settings.platformMode === 'label' && game.platform) {
					const platform = details.createDiv({ cls: 'game-platform' });
					platform.textContent = `🎮 ${game.platform}`;
				}

				if (game.hours && game.hours > 0) {
					const hours = details.createDiv({ cls: 'game-hours' });
					hours.textContent = `⏱️ ${game.hours} hs`;
				}
			}

			// Click handler para abrir modal de lectura (siempre disponible)
			card.addEventListener('click', (e) => {
				e.stopPropagation();
				new GameViewModal(this.app, game, (editedGame) => {
					void this.editGameInFile(ctx, game, editedGame);
				}, () => {
					void this.deleteGameInFile(ctx, game);
				}, !blockConfig.isLocked, this).open();
			});
			
		});

			// Tarjeta de agregar (solo si desbloqueado)
			if (!blockConfig.isLocked) {
				const addCard = grid.createDiv({ cls: 'game-card game-card-add' });
				addCard.createSpan({ cls: 'game-card-add-icon', text: '+' });
				addCard.addEventListener('click', () => {
					new AddGameModal(this.app, (newGame) => {
						void this.addGameToFile(ctx, newGame);
					}, this).open();
				});
			}
		};
		
		// Función para renderizar tabla
		const renderTable = () => {
			tableContainer.empty();
			const table = tableContainer.createEl('table', { cls: 'game-backlog-table' });
			
			// Header
			const thead = table.createEl('thead');
			const headerRow = thead.createEl('tr');
			[this.t('tableHeaderGame'), this.t('tableHeaderPlatform'), this.t('tableHeaderDate'), this.t('tableHeaderRating'), this.t('tableHeaderDuration')].forEach(header => {
				headerRow.createEl('th', { text: header });
			});
			
			// Body
			const tbody = table.createEl('tbody');
			games.forEach(game => {
				const row = tbody.createEl('tr');
				row.addClass('game-clickable-row');
				
				// Juego
				const nameCell = row.createEl('td');
				nameCell.addClass('game-table-name-cell');
				const gameName = game.name || this.t('noName');
				const nameContent = nameCell.createSpan({ cls: 'game-table-name-content' });
				const platinumIcon = nameContent.createSpan({ cls: 'game-table-platinum-icon' });
				if (game.platinum) {
					platinumIcon.textContent = '🏆';
				} else {
					platinumIcon.addClass('is-empty');
					platinumIcon.textContent = '🏆';
				}
				const dlcIcon = nameContent.createSpan({ cls: 'game-table-dlc-icon' });
				if (game.dlc) {
					dlcIcon.textContent = '🧩';
				} else {
					dlcIcon.addClass('is-empty');
					dlcIcon.textContent = '🧩';
				}
				const nameText = nameContent.createSpan({ cls: 'game-table-name-text' });
				nameText.textContent = gameName;
				
				// Plataforma
				const platformCell = row.createEl('td');
				platformCell.textContent = game.platform || this.t('emptyValue');
				
				// Fecha
				const dateCell = row.createEl('td');
				if (game.completionDate) {
					const parsed = this.parseCompletionDate(game.completionDate);
					if (parsed) {
						const day = String(parsed.getDate()).padStart(2, '0');
						const month = String(parsed.getMonth() + 1).padStart(2, '0');
						dateCell.textContent = `${day}/${month}`;
					} else {
						dateCell.textContent = game.completionDate;
					}
				} else {
					dateCell.textContent = this.t('emptyValue');
				}
				
				// Puntaje
				const scoreCell = row.createEl('td');
				this.renderTableRating(scoreCell, game.rating || 0);
				
				// Duración
				const hoursCell = row.createEl('td');
				if (game.hours && game.hours > 0) {
					hoursCell.textContent = `${game.hours} hs`;
				} else {
					hoursCell.textContent = this.t('emptyValue');
				}
				
				// Click handler para abrir modal (siempre disponible)
				row.addEventListener('click', () => {
					new GameViewModal(this.app, game, (editedGame) => {
						void this.editGameInFile(ctx, game, editedGame);
					}, () => {
						void this.deleteGameInFile(ctx, game);
					}, !blockConfig.isLocked, this).open();
				});
			});
			
			// Fila de agregar (solo si desbloqueado)
			if (!blockConfig.isLocked) {
				const addRow = tbody.createEl('tr', { cls: 'game-table-add-row' });
				const addCell = addRow.createEl('td', { attr: { colspan: '5' } });
				addCell.textContent = '+';
				addRow.addEventListener('click', () => {
					new AddGameModal(this.app, (newGame) => {
						void this.addGameToFile(ctx, newGame);
					}, this).open();
				});
			}
		};
		
		// Función para actualizar estadísticas
		const renderStats = () => {
			const totalGames = games.filter(g => !g.dlc).length;
			const totalDlcs = games.filter(g => g.dlc).length;
			const totalHours = games.reduce((sum, game) => sum + (game.hours || 0), 0);
			
			// Labels de estadísticas
			const statsLabels = statsContainer.createDiv({ cls: 'game-stats-labels' });
			
			const gamesLabel = statsLabels.createDiv({ cls: 'game-stat-item' });
			gamesLabel.textContent = this.t('statsCompleted', { count: totalGames });

			if (totalDlcs > 0) {
				const dlcsLabel = statsLabels.createDiv({ cls: 'game-stat-item' });
				dlcsLabel.textContent = this.t('statsDlcCompleted', { count: totalDlcs });
			}
			
			const hoursLabel = statsLabels.createDiv({ cls: 'game-stat-item' });
			hoursLabel.textContent = this.t('statsTotalHours', { hours: Math.round(totalHours) });
			
			// Top 3 games
			const topGamesContainer = statsContainer.createDiv({ cls: 'game-top-games' });
			const medals = ['🥇', '🥈', '🥉'];
			const topGameSettings: Array<'topGame1' | 'topGame2' | 'topGame3'> = ['topGame1', 'topGame2', 'topGame3'];
			const gameNames = games.map(g => g.name);
			
			topGameSettings.forEach((settingKey, index) => {
				const topGameRow = topGamesContainer.createDiv({ cls: 'game-top-game-row' });
				
				const medal = topGameRow.createSpan({ cls: 'game-medal' });
				medal.textContent = medals[index];
				
				const currentValue = blockConfig[settingKey];

				if (blockConfig.isLocked) {
					// Modo bloqueado: mostrar texto plano
					const label = topGameRow.createSpan({ cls: 'game-top-game-label' });
					label.textContent = currentValue || this.t('emptyValue');
				} else {
					// Modo edición: mostrar dropdown
					const select = topGameRow.createEl('select', { cls: 'game-top-game-select' });
					
					const emptyOption = select.createEl('option');
					emptyOption.value = '';
					emptyOption.textContent = [this.t('topGameSelectBest'), this.t('topGameSelectSecond'), this.t('topGameSelectThird')][index];
					
					gameNames.forEach(name => {
						const option = select.createEl('option');
						option.value = name;
						option.textContent = name;
					});
					
					select.value = currentValue || '';
					
					select.addEventListener('change', (e: Event) => {
						void (async () => {
							const newValue = (e.target as HTMLSelectElement).value;
							blockConfig[settingKey] = newValue;
							await this.saveBlockConfig(ctx, blockConfig);
						})();
					});
				}
			});
		};
		
		// Renderizar inicial segun estado guardado en el bloque
		if (isTableView) {
			setContainerVisibility(cardsContainer, false);
			setContainerVisibility(tableContainer, true);
			renderTable();
		} else {
			setContainerVisibility(cardsContainer, true);
			setContainerVisibility(tableContainer, false);
			renderCards();
		}
		
		// Sección de estadísticas
		statsContainer.empty();
		renderStats();
		
		// Event listener para toggle de vista
		toggleButton.addEventListener('click', () => {
			void (async () => {
				isTableView = !isTableView;
				blockConfig.viewMode = isTableView ? 'table' : 'grid';
				await this.saveBlockConfig(ctx, blockConfig);
				if (isTableView) {
					setContainerVisibility(cardsContainer, false);
					setContainerVisibility(tableContainer, true);
					toggleButton.textContent = '🃏';
					renderTable();
				} else {
					setContainerVisibility(cardsContainer, true);
					setContainerVisibility(tableContainer, false);
					toggleButton.textContent = '📊';
					renderCards();
				}
			})();
		});
		
	}

	async addGameToFile(ctx: MarkdownPostProcessorContext, game: GameEntry) {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;
		
		const content = await this.app.vault.read(file);
		
		// Buscar el bloque de código game-backlog
		const codeBlockRegex = /```game-backlog\n([\s\S]*?)```/;
		const match = content.match(codeBlockRegex);
		
		if (match) {
			const gameId = game.id || generateGameId();
			const newEntry = `\n---\nid: ${gameId}\nname: ${game.name}\ncover: ${game.cover}\nrating: ${game.rating}\ndate: ${game.completionDate}\nplatform: ${game.platform}\nhours: ${game.hours}\nplatinum: ${game.platinum}\ndlc: ${game.dlc}\n`;
			const updatedBlock = match[1] + newEntry;
			const newContent = content.replace(codeBlockRegex, `\`\`\`game-backlog\n${updatedBlock}\`\`\``);
			
			await this.app.vault.modify(file, newContent);
			new Notice(this.t('noticeGameAdded'));
		}
	}

	async editGameInFile(ctx: MarkdownPostProcessorContext, oldGame: GameEntry, newGame: GameEntry) {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;
		
		const content = await this.app.vault.read(file);
		
		// Buscar el bloque de código game-backlog
		const codeBlockRegex = /```game-backlog\n([\s\S]*?)```/;
		const match = content.match(codeBlockRegex);
		
		if (match) {
			const oldId = oldGame.id || '';
			const stableId = newGame.id || oldId || generateGameId();

			const newEntry = `---\nid: ${stableId}\nname: ${newGame.name}\ncover: ${newGame.cover}\nrating: ${newGame.rating}\ndate: ${newGame.completionDate}\nplatform: ${newGame.platform}\nhours: ${newGame.hours}\nplatinum: ${newGame.platinum}\ndlc: ${newGame.dlc}\n`;

			const originalBlock = match[1];
			const entries = originalBlock.match(/---\s*\n[\s\S]*?(?=(?:\n---\s*\n)|$)/g) || [];

			let entryIndex = -1;

			if (oldId) {
				entryIndex = entries.findIndex((entry) => {
					const idMatch = entry.match(/^id:\s*(.+)$/im);
					return (idMatch?.[1] || '').trim() === oldId;
				});
			}

			if (entryIndex === -1) {
				entryIndex = entries.findIndex((entry) => {
					const nameMatch = entry.match(/^name:\s*(.*)$/im);
					const coverMatch = entry.match(/^cover:\s*(.*)$/im);
					const ratingMatch = entry.match(/^rating:\s*(.*)$/im);
					const dateMatch = entry.match(/^date:\s*(.*)$/im);
					const platformMatch = entry.match(/^platform:\s*(.*)$/im);
					const hoursMatch = entry.match(/^hours:\s*(.*)$/im);
					const platinumMatch = entry.match(/^platinum:\s*(.*)$/im);

					return (nameMatch?.[1] || '').trim() === (oldGame.name || '').trim() &&
						(coverMatch?.[1] || '').trim() === (oldGame.cover || '').trim() &&
						(ratingMatch?.[1] || '').trim() === String(oldGame.rating ?? 0) &&
						(dateMatch?.[1] || '').trim() === (oldGame.completionDate || '').trim() &&
						(platformMatch?.[1] || '').trim() === String(oldGame.platform || '').trim() &&
						(hoursMatch?.[1] || '').trim() === String(oldGame.hours ?? 0) &&
						(platinumMatch?.[1] || '').trim().toLowerCase() === String(oldGame.platinum).toLowerCase();
				});
			}

			if (entryIndex === -1) {
				new Notice(this.t('noticeEntryNotFound'));
				return;
			}

			const targetEntry = entries[entryIndex];
			const updatedBlock = originalBlock.replace(targetEntry, newEntry);
			const newContent = content.replace(codeBlockRegex, `\`\`\`game-backlog\n${updatedBlock}\`\`\``);
			
			await this.app.vault.modify(file, newContent);
			new Notice(this.t('noticeGameUpdated'));
		}
	}

	async deleteGameInFile(ctx: MarkdownPostProcessorContext, gameToDelete: GameEntry) {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);

		const codeBlockRegex = /```game-backlog\n([\s\S]*?)```/;
		const match = content.match(codeBlockRegex);

		if (match) {
			const targetId = gameToDelete.id || '';
			const originalBlock = match[1];
			const entries = originalBlock.match(/---\s*\n[\s\S]*?(?=(?:\n---\s*\n)|$)/g) || [];

			let entryIndex = -1;

			if (targetId) {
				entryIndex = entries.findIndex((entry) => {
					const idMatch = entry.match(/^id:\s*(.+)$/im);
					return (idMatch?.[1] || '').trim() === targetId;
				});
			}

			if (entryIndex === -1) {
				entryIndex = entries.findIndex((entry) => {
					const nameMatch = entry.match(/^name:\s*(.*)$/im);
					const coverMatch = entry.match(/^cover:\s*(.*)$/im);
					const ratingMatch = entry.match(/^rating:\s*(.*)$/im);
					const dateMatch = entry.match(/^date:\s*(.*)$/im);
					const platformMatch = entry.match(/^platform:\s*(.*)$/im);
					const hoursMatch = entry.match(/^hours:\s*(.*)$/im);
					const platinumMatch = entry.match(/^platinum:\s*(.*)$/im);

					return (nameMatch?.[1] || '').trim() === (gameToDelete.name || '').trim() &&
						(coverMatch?.[1] || '').trim() === (gameToDelete.cover || '').trim() &&
						(ratingMatch?.[1] || '').trim() === String(gameToDelete.rating ?? 0) &&
						(dateMatch?.[1] || '').trim() === (gameToDelete.completionDate || '').trim() &&
						(platformMatch?.[1] || '').trim() === String(gameToDelete.platform || '').trim() &&
						(hoursMatch?.[1] || '').trim() === String(gameToDelete.hours ?? 0) &&
						(platinumMatch?.[1] || '').trim().toLowerCase() === String(gameToDelete.platinum).toLowerCase();
				});
			}

			if (entryIndex === -1) {
				new Notice(this.t('noticeEntryNotFound'));
				return;
			}

			const targetEntry = entries[entryIndex];
			const updatedBlock = originalBlock.replace(targetEntry, '').replace(/\n{3,}/g, '\n\n');
			const newContent = content.replace(codeBlockRegex, `\`\`\`game-backlog\n${updatedBlock}\`\`\``);

			await this.app.vault.modify(file, newContent);
			new Notice(this.t('noticeGameDeleted'));
		}
	}
}

class AddGameModal extends Modal {
	onSubmit: (game: GameEntry) => void;
	isEditMode: boolean;
	plugin: GameBacklogPlugin;
	
	id: string = '';
	name: string = '';
	cover: string = '';
	rating: number = 3;
	completionDate: string = '';
	platform: GamePlatform = GamePlatform.PC;
	hours: number = 0;
	platinum: boolean = false;
	dlc: boolean = false;

	constructor(app: App, onSubmit: (game: GameEntry) => void, plugin: GameBacklogPlugin, existingGame?: GameEntry) {
		super(app);
		this.onSubmit = onSubmit;
		this.plugin = plugin;
		this.isEditMode = !!existingGame;
		
		if (existingGame) {
			this.id = existingGame.id || '';
			this.name = existingGame.name || '';
			this.cover = existingGame.cover || '';
			this.rating = typeof existingGame.rating === 'number'
				? existingGame.rating
				: this.plugin.getDefaultRatingValue();
			this.completionDate = existingGame.completionDate || '';
			this.platform = existingGame.platform || this.plugin.settings.defaultPlatform;
			this.hours = existingGame.hours || 0;
			this.platinum = existingGame.platinum || false;
			this.dlc = existingGame.dlc || false;
		} else {
			this.rating = this.plugin.getDefaultRatingValue();
			this.platform = this.plugin.settings.defaultPlatform;
			// Fecha actual por defecto
			const today = new Date();
			this.completionDate = today.toISOString().split('T')[0];
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl('h2', { text: this.isEditMode ? this.plugin.t('modalEditTitle') : this.plugin.t('modalAddTitle') });
		
		// Nombre
		new Setting(contentEl)
			.setName(this.plugin.t('modalNameLabel'))
			.setDesc(this.plugin.t('modalNameDesc'))
			.addText(text => text
				.setPlaceholder(this.plugin.t('modalNamePlaceholder'))
				.setValue(this.name)
				.onChange(value => {
					this.name = value;
				}));
		
		// Portada (URL)
		let coverTextField: HTMLInputElement;
		let downloadBtnEl: HTMLButtonElement | null = null;

		const updateDownloadButtonVisibility = () => {
			if (downloadBtnEl) {
				downloadBtnEl.style.display = /^https?:\/\//.test(this.cover) ? '' : 'none';
			}
		};

		const coverSetting = new Setting(contentEl);
		coverSetting
			.setName(this.plugin.t('modalCoverLabel'))
			.setDesc(this.plugin.t('modalCoverDesc'))
			.addText(text => {
				coverTextField = text.inputEl;
				text.setPlaceholder(this.plugin.t('modalCoverPlaceholder'))
					.setValue(this.cover)
					.onChange(value => {
						this.cover = value;
						updateDownloadButtonVisibility();
					});
			})
			.addButton(btn => {
				downloadBtnEl = btn.buttonEl;
				btn.setButtonText('⬇️')
					.setTooltip(this.plugin.t('modalDownloadTooltip'))
					.onClick(async () => {
						const activeFile = this.app.workspace.getActiveFile();
						if (!activeFile) {
							new Notice(this.plugin.t('noticeNoActiveFile'));
							return;
						}

						const downloadPath = await this.plugin.downloadRemoteImage(
							this.cover,
							this.plugin.settings.imageDownloadFolder || null,
							activeFile
						);

						if (downloadPath !== this.cover) {
							this.cover = downloadPath;
							if (coverTextField) {
								coverTextField.value = downloadPath;
								coverTextField.dispatchEvent(new Event('input', { bubbles: true }));
							}
							new Notice(this.plugin.t('noticeImageDownloaded'));
						}
					});
				btn.buttonEl.style.display = /^https?:\/\//.test(this.cover) ? '' : 'none';
			});

		if (this.plugin.settings.steamGridDbApiKey) {
			coverSetting.addButton(btn => btn
				.setButtonText('🔍')
				.setTooltip(this.plugin.t('steamGridDbSearchTooltip'))
				.onClick(() => {
					new SteamGridDBSearchModal(this.app, this.plugin, this.name, (url) => {
						this.cover = url;
						if (coverTextField) {
							coverTextField.value = url;
							coverTextField.dispatchEvent(new Event('input', { bubbles: true }));
						}
						updateDownloadButtonVisibility();
					}).open();
				}));
		}

		// Rating
		const ratingBounds = this.plugin.getScoreBounds();
		const ratingSetting = new Setting(contentEl)
			.setName(this.plugin.t('modalRatingLabel'))
			.setDesc(this.plugin.t('modalRatingDesc'));

		if (this.plugin.settings.scoreType === 'numeric-10') {
			ratingSetting.addText(text => text
				.setPlaceholder('0')
				.setValue(String(this.plugin.normalizeRatingValue(this.rating)))
				.onChange(value => {
					const parsed = parseInt(value, 10);
					this.rating = Number.isFinite(parsed)
						? Math.max(ratingBounds.min, Math.min(ratingBounds.max, parsed))
						: ratingBounds.min;
				})
				.inputEl.type = 'number');

			const inputEl = ratingSetting.controlEl.querySelector('input');
			if (inputEl instanceof HTMLInputElement) {
				inputEl.min = String(ratingBounds.min);
				inputEl.max = String(ratingBounds.max);
				inputEl.step = '1';
			}
		} else if (this.plugin.settings.scoreType === 'stars-5' || this.plugin.settings.scoreType === 'stars-5-half') {
			const starCount = 5;
			const allowHalfStars = this.plugin.settings.scoreType === 'stars-5-half';
			let currentRating = Math.max(ratingBounds.min, Math.min(starCount, this.plugin.normalizeRatingValue(this.rating)));
			let hoverRating: number | null = null;
			const starContainer = ratingSetting.controlEl.createDiv({ cls: 'game-modal-star-picker' });

			const getStarClass = (starIndex: number, value: number): string => {
				if (value >= starIndex + 1) return 'star filled';
				if (value >= starIndex + 0.5) return 'star half';
				return 'star empty';
			};

			const renderStars = () => {
				starContainer.empty();
				const activeRating = hoverRating ?? currentRating;

				for (let i = 1; i <= starCount; i++) {
					const star = starContainer.createSpan({
						cls: `${getStarClass(i - 1, activeRating)} game-modal-star`,
						text: '★'
					});

					if (allowHalfStars) {
						const getHalfValue = (event: MouseEvent): number => {
							const rect = star.getBoundingClientRect();
							const relativeX = event.clientX - rect.left;
							const half = relativeX <= rect.width / 2 ? 0.5 : 1;
							return (i - 1) + half;
						};

						star.addEventListener('mousemove', (event: MouseEvent) => {
							hoverRating = getHalfValue(event);
							renderStars();
						});

						star.addEventListener('click', (event: MouseEvent) => {
							currentRating = getHalfValue(event);
							this.rating = currentRating;
							renderStars();
						});
					} else {
						star.addEventListener('mouseenter', () => {
							hoverRating = i;
							renderStars();
						});

						star.addEventListener('click', () => {
							currentRating = i;
							this.rating = i;
							renderStars();
						});
					}
				}
			};

			starContainer.addEventListener('mouseleave', () => {
				hoverRating = null;
				renderStars();
			});

			renderStars();
		} else {
			ratingSetting.addSlider(slider => slider
				.setLimits(ratingBounds.min, ratingBounds.max, this.plugin.settings.scoreType === 'stars-5-half' ? 0.5 : 1)
				.setValue(Math.max(ratingBounds.min, Math.min(ratingBounds.max, this.rating)))
				.setDynamicTooltip()
				.onChange(value => {
					this.rating = value;
				}));
		}
		
		// Fecha de completación
		new Setting(contentEl)
			.setName(this.plugin.t('modalCompletionDateLabel'))
			.setDesc(this.plugin.t('modalCompletionDateDesc'))
			.addText(text => text
				.setPlaceholder('Completion date')
				.setValue(this.completionDate)
				.onChange(value => {
					this.completionDate = value;
				})
				.inputEl.type = 'date');
		
		// Plataforma - Dropdown
		new Setting(contentEl)
			.setName(this.plugin.t('modalPlatformLabel'))
			.setDesc(this.plugin.t('modalPlatformDesc'))
			.addDropdown(dropdown => {
				const selectEl = dropdown.selectEl;

				PLATFORM_GROUPS.forEach((group, groupIndex) => {
					const groupHeader = document.createElement('option');
					groupHeader.textContent = `--- ${group.label} ---`;
					groupHeader.disabled = true;
					groupHeader.value = '';
					selectEl.appendChild(groupHeader);

					group.platforms.forEach((platform) => {
						dropdown.addOption(platform, platform);
					});

					// if (groupIndex < PLATFORM_GROUPS.length - 1) {
					// 	const separator = document.createElement('option');
					// 	separator.textContent = '──────────';
					// 	separator.disabled = true;
					// 	separator.value = '';
					// 	selectEl.appendChild(separator);
					// }
				});

				dropdown
					.setValue(this.platform)
					.onChange(value => {
						this.platform = value as GamePlatform;
					});
			});

		// Horas jugadas
		new Setting(contentEl)
			.setName(this.plugin.t('modalHoursLabel'))
			.setDesc(this.plugin.t('modalHoursDesc'))
			.addText(text => text
				.setPlaceholder('0')
				.setValue(String(this.hours))
				.onChange(value => {
					this.hours = parseFloat(value) || 0;
				})
				.inputEl.type = 'number');

		new Setting(contentEl)
			.setName(this.plugin.t('modalPlatinumLabel'))
			.setDesc(this.plugin.t('modalPlatinumDesc'))
			.addToggle(toggle => toggle
				.setValue(this.platinum)
				.onChange(value => {
					this.platinum = value;
				}));

		new Setting(contentEl)
			.setName(this.plugin.t('modalDlcLabel'))
			.setDesc(this.plugin.t('modalDlcDesc'))
			.addToggle(toggle => toggle
				.setValue(this.dlc)
				.onChange(value => {
					this.dlc = value;
				}));
		
		// Botones
		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText(this.isEditMode ? this.plugin.t('buttonSave') : this.plugin.t('buttonAdd'))
				.setCta()
				.onClick(() => {
					this.onSubmit({
						id: this.id || generateGameId(),
						name: this.name,
						cover: this.cover,
						rating: this.rating,
						completionDate: this.completionDate,
						platform: this.platform,
						hours: this.hours,
						platinum: this.platinum,
						dlc: this.dlc
					});
					this.close();
				}))
			.addButton(btn => btn
				.setButtonText(this.plugin.t('buttonCancel'))
				.onClick(() => {
					this.close();
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class GameViewModal extends Modal {
	game: GameEntry;
	onEdit: (editedGame: GameEntry) => void;
	onDelete: () => void;
	canEdit: boolean;
	plugin: GameBacklogPlugin;

	constructor(app: App, game: GameEntry, onEdit: (editedGame: GameEntry) => void, onDelete: () => void, canEdit: boolean = true, plugin?: GameBacklogPlugin) {
		super(app);
		this.game = game;
		this.onEdit = onEdit;
		this.onDelete = onDelete;
		this.canEdit = canEdit;
		this.plugin = plugin!;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: this.game.name || this.plugin.t('noName') });

		// Contenedor de información
		const infoContainer = contentEl.createDiv({ cls: 'game-view-info' });

		// Rating
		const ratingContainer = infoContainer.createDiv({ cls: 'game-view-item' });
		const ratingLabel = ratingContainer.createSpan({ cls: 'game-view-label' });
		ratingLabel.textContent = this.plugin.t('viewRatingLabel');
		const ratingValue = ratingContainer.createSpan({ cls: 'game-view-value' });
		this.plugin.renderDetailRating(ratingValue, this.game.rating || 0);

		// Plataforma
		if (this.game.platform) {
			const platformContainer = infoContainer.createDiv({ cls: 'game-view-item' });
			const platformLabel = platformContainer.createSpan({ cls: 'game-view-label' });
			platformLabel.textContent = this.plugin.t('viewPlatformLabel');
			const platformValue = platformContainer.createSpan({ cls: 'game-view-value' });
			platformValue.textContent = this.game.platform;
		}

		// Fecha de completación
		if (this.game.completionDate) {
			const dateContainer = infoContainer.createDiv({ cls: 'game-view-item' });
			const dateLabel = dateContainer.createSpan({ cls: 'game-view-label' });
			dateLabel.textContent = this.plugin.t('viewCompletedLabel');
			const dateValue = dateContainer.createSpan({ cls: 'game-view-value' });
			dateValue.textContent = this.plugin.formatCompletionDateWithYear(this.game.completionDate);
		}

		// Horas
		if (this.game.hours && this.game.hours > 0) {
			const hoursContainer = infoContainer.createDiv({ cls: 'game-view-item' });
			const hoursLabel = hoursContainer.createSpan({ cls: 'game-view-label' });
			hoursLabel.textContent = this.plugin.t('viewHoursLabel');
			const hoursValue = hoursContainer.createSpan({ cls: 'game-view-value' });
			hoursValue.textContent = `${this.game.hours} hs`;
		}

		// Platinado
		if (this.game.platinum) {
			const platinumContainer = infoContainer.createDiv({ cls: 'game-view-item' });
			const platinumLabel = platinumContainer.createSpan({ cls: 'game-view-label' });
			platinumLabel.textContent = this.plugin.t('viewStatusLabel');
			const platinumValue = platinumContainer.createSpan({ cls: 'game-view-value' });
			platinumValue.textContent = this.plugin.t('viewStatusPlatinum');
		}

		// Botón Editar (solo si está habilitada la edición)
		if (this.canEdit) {
			const buttonContainer = contentEl.createDiv({ cls: 'game-view-buttons' });
			const editButton = buttonContainer.createEl('button', { text: this.plugin.t('buttonEdit') });
			editButton.addEventListener('click', () => {
				this.close();
				new AddGameModal(this.app, (editedGame) => {
					this.onEdit(editedGame);
				}, this.plugin, this.game).open();
			});

			const deleteButton = buttonContainer.createEl('button', {
				cls: 'game-view-delete-button',
				text: this.plugin.t('buttonDelete')
			});
			deleteButton.addEventListener('click', () => {
				void (async () => {
					const confirmed = await ConfirmActionModal.confirm(
						this.app,
						this.plugin.t('confirmDeleteGame'),
						this.plugin.t('buttonDelete'),
						this.plugin.t('buttonCancel')
					);

					if (!confirmed) {
						return;
					}

					this.close();
					this.onDelete();
				})();
			});
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ConfirmActionModal extends Modal {
	private readonly message: string;
	private readonly confirmLabel: string;
	private readonly cancelLabel: string;
	private readonly onResolve: (value: boolean) => void;

	private constructor(
		app: App,
		message: string,
		confirmLabel: string,
		cancelLabel: string,
		onResolve: (value: boolean) => void
	) {
		super(app);
		this.message = message;
		this.confirmLabel = confirmLabel;
		this.cancelLabel = cancelLabel;
		this.onResolve = onResolve;
	}

	static confirm(app: App, message: string, confirmLabel: string, cancelLabel: string): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			new ConfirmActionModal(app, message, confirmLabel, cancelLabel, resolve).open();
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('p', { text: this.message });

		new Setting(contentEl)
			.addButton((button) => {
				button
					.setButtonText(this.confirmLabel)
					.setWarning()
					.onClick(() => {
						this.onResolve(true);
						this.close();
					});
			})
			.addButton((button) => {
				button
					.setButtonText(this.cancelLabel)
					.onClick(() => {
						this.onResolve(false);
						this.close();
					});
			});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SteamGridDBSearchModal extends Modal {
	private plugin: GameBacklogPlugin;
	private onSelect: (url: string) => void;
	private searchQuery: string;
	private games: SGDBGame[] = [];
	private grids: SGDBGrid[] = [];
	private selectedGame: SGDBGame | null = null;

	constructor(app: App, plugin: GameBacklogPlugin, initialQuery: string, onSelect: (url: string) => void) {
		super(app);
		this.plugin = plugin;
		this.searchQuery = initialQuery;
		this.onSelect = onSelect;
	}

	onOpen() {
		this.renderSearchView();
		if (this.searchQuery) {
			void this.executeSearch();
		}
	}

	private renderSearchView(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.plugin.t('steamGridDbModalTitle') });

		const searchRow = contentEl.createDiv({ cls: 'sgdb-search-row' });
		const input = searchRow.createEl('input', { cls: 'sgdb-search-input' });
		input.type = 'text';
		input.value = this.searchQuery;
		input.placeholder = this.plugin.t('steamGridDbSearchPlaceholder');
		const searchBtn = searchRow.createEl('button', {
			text: this.plugin.t('steamGridDbSearchAction'),
			cls: 'mod-cta sgdb-search-btn'
		});

		const resultsContainer = contentEl.createDiv({ cls: 'sgdb-results' });

		const runSearch = async () => {
			this.searchQuery = input.value.trim();
			if (!this.searchQuery) return;
			resultsContainer.empty();
			resultsContainer.createEl('p', { text: this.plugin.t('steamGridDbLoadingGames') });
			try {
				this.games = await this.plugin.searchSteamGridDB(this.searchQuery);
				this.renderGamesList(resultsContainer);
			} catch (error) {
				resultsContainer.empty();
				const errorMsg = error instanceof Error ? error.message : String(error);
				resultsContainer.createEl('p', { text: this.plugin.t('steamGridDbSearchError', { error: errorMsg }) });
			}
		};

		searchBtn.addEventListener('click', () => { void runSearch(); });
		input.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') { void runSearch(); }
		});

		if (this.games.length > 0) {
			this.renderGamesList(resultsContainer);
		}
	}

	private async executeSearch(): Promise<void> {
		const resultsContainer = this.contentEl.querySelector<HTMLElement>('.sgdb-results');
		if (!resultsContainer) return;
		resultsContainer.empty();
		resultsContainer.createEl('p', { text: this.plugin.t('steamGridDbLoadingGames') });
		try {
			this.games = await this.plugin.searchSteamGridDB(this.searchQuery);
			this.renderGamesList(resultsContainer);
		} catch (error) {
			resultsContainer.empty();
			const errorMsg = error instanceof Error ? error.message : String(error);
			resultsContainer.createEl('p', { text: this.plugin.t('steamGridDbSearchError', { error: errorMsg }) });
		}
	}

	private renderGamesList(container: HTMLElement): void {
		container.empty();
		if (this.games.length === 0) {
			container.createEl('p', { text: this.plugin.t('steamGridDbNoResults') });
			return;
		}
		const list = container.createEl('ul', { cls: 'sgdb-games-list' });
		this.games.forEach(game => {
			const item = list.createEl('li', { text: game.name, cls: 'sgdb-game-item' });
			item.addEventListener('click', () => {
				this.selectedGame = game;
				void this.loadGridsForGame(game);
			});
		});
	}

	private async loadGridsForGame(game: SGDBGame): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.plugin.t('steamGridDbModalTitle') });
		contentEl.createDiv({ cls: 'sgdb-subtitle', text: game.name });
		const loadingEl = contentEl.createEl('p', { text: this.plugin.t('steamGridDbLoadingGrids') });
		try {
			this.grids = await this.plugin.getSteamGridDBGrids(game.id);
			loadingEl.remove();
			this.renderGridView();
		} catch (error) {
			loadingEl.remove();
			const errorMsg = error instanceof Error ? error.message : String(error);
			contentEl.createEl('p', { text: this.plugin.t('steamGridDbSearchError', { error: errorMsg }) });
			const backBtn = contentEl.createEl('button', { text: this.plugin.t('steamGridDbBackButton'), cls: 'sgdb-back-btn' });
			backBtn.addEventListener('click', () => { this.renderSearchView(); });
		}
	}

	private renderGridView(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.plugin.t('steamGridDbModalTitle') });

		const backBtn = contentEl.createEl('button', {
			text: this.plugin.t('steamGridDbBackButton'),
			cls: 'sgdb-back-btn'
		});
		backBtn.addEventListener('click', () => { this.renderSearchView(); });

		if (this.selectedGame) {
			contentEl.createDiv({ cls: 'sgdb-subtitle', text: this.selectedGame.name });
		}

		if (this.grids.length === 0) {
			contentEl.createEl('p', { text: this.plugin.t('steamGridDbNoGrids') });
			return;
		}

		const grid = contentEl.createDiv({ cls: 'sgdb-grids-container' });
		this.grids.forEach(gridItem => {
			const wrapper = grid.createDiv({ cls: 'sgdb-grid-item' });
			const img = wrapper.createEl('img', { cls: 'sgdb-grid-thumb' });
			img.src = gridItem.thumb || gridItem.url;
			img.alt = '';
			img.addEventListener('click', () => {
				this.onSelect(gridItem.url);
				this.close();
			});
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

class GameBacklogSettingTab extends PluginSettingTab {
	plugin: GameBacklogPlugin;

	constructor(app: App, plugin: GameBacklogPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName(this.plugin.t('settingsTitle'))
			.setHeading();

		new Setting(containerEl)
			.setName(this.plugin.t('settingsLanguageName'))
			.setDesc(this.plugin.t('settingsLanguageDesc'))
			.addDropdown(dropdown => dropdown
				.addOption('es', this.plugin.t('languageSpanish'))
				.addOption('en', this.plugin.t('languageEnglish'))
				.setValue(this.plugin.settings.language)
				.onChange(async (value) => {
					this.plugin.settings.language = value as AppLanguage;
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl)
			.setName(this.plugin.t('settingsDefaultCoverName'))
			.setDesc(this.plugin.t('settingsDefaultCoverDesc'))
			.addText(text => text
				.setPlaceholder(this.plugin.t('settingsDefaultCoverPlaceholder'))
				.setValue(this.plugin.settings.defaultCoverImage)
				.onChange(async (value) => {
					this.plugin.settings.defaultCoverImage = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.t('settingsDefaultPlatformName'))
			.setDesc(this.plugin.t('settingsDefaultPlatformDesc'))
			.addDropdown(dropdown => {
				const selectEl = dropdown.selectEl;

				PLATFORM_GROUPS.forEach((group) => {
					const groupHeader = document.createElement('option');
					groupHeader.textContent = `--- ${group.label} ---`;
					groupHeader.disabled = true;
					groupHeader.value = '';
					selectEl.appendChild(groupHeader);

					group.platforms.forEach((platform) => {
						dropdown.addOption(platform, platform);
					});
				});

				dropdown
					.setValue(this.plugin.settings.defaultPlatform)
					.onChange(async (value) => {
						this.plugin.settings.defaultPlatform = value as GamePlatform;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName(this.plugin.t('settingsPlatformModeName'))
			.setDesc(this.plugin.t('settingsPlatformModeDesc'))
			.addDropdown(dropdown => dropdown
				.addOption('none', this.plugin.t('platformModeNone'))
				.addOption('label', this.plugin.t('platformModeLabel'))
				.setValue(this.plugin.settings.platformMode)
				.onChange(async (value) => {
					this.plugin.settings.platformMode = value as PlatformMode;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.t('settingsScoreTypeName'))
			.setDesc(this.plugin.t('settingsScoreTypeDesc'))
			.addDropdown(dropdown => dropdown
				.addOption('stars-5', this.plugin.t('scoreTypeStars5'))
				.addOption('stars-5-half', this.plugin.t('scoreTypeStars5Half'))
				.addOption('stars-10', this.plugin.t('scoreTypeStars10'))
				.addOption('numeric-10', this.plugin.t('scoreTypeNumeric10'))
				.setValue(this.plugin.settings.scoreType)
				.onChange(async (value) => {
					this.plugin.settings.scoreType = value as ScoreType;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.t('settingsDownloadFolderName'))
			.setDesc(this.plugin.t('settingsDownloadFolderDesc'))
			.addText(text => text
				.setPlaceholder(this.plugin.t('settingsDownloadFolderPlaceholder'))
				.setValue(this.plugin.settings.imageDownloadFolder)
				.onChange(async (value) => {
					this.plugin.settings.imageDownloadFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.t('settingsSteamGridDbName'))
			.setDesc(this.plugin.t('settingsSteamGridDbDesc'))
			.addText(text => text
				.setPlaceholder(this.plugin.t('settingsSteamGridDbPlaceholder'))
				.setValue(this.plugin.settings.steamGridDbApiKey)
				.onChange(async (value) => {
					this.plugin.settings.steamGridDbApiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.t('settingsCardColorName'))
			.setDesc(this.plugin.t('settingsCardColorDesc'))
			.addText(text => text
				.setPlaceholder(this.plugin.t('settingsCardColorPlaceholder'))
				.setValue(this.plugin.settings.cardColor)
				.onChange(async (value) => {
					this.plugin.settings.cardColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.t('settingsTextColorName'))
			.setDesc(this.plugin.t('settingsTextColorDesc'))
			.addText(text => text
				.setPlaceholder(this.plugin.t('settingsTextColorPlaceholder'))
				.setValue(this.plugin.settings.textColor)
				.onChange(async (value) => {
					this.plugin.settings.textColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.t('settingsNoImageBackgroundColorName'))
			.setDesc(this.plugin.t('settingsNoImageBackgroundColorDesc'))
			.addText(text => text
				.setPlaceholder(this.plugin.t('settingsNoImageBackgroundColorPlaceholder'))
				.setValue(this.plugin.settings.noImageBackgroundColor)
				.onChange(async (value) => {
					this.plugin.settings.noImageBackgroundColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.t('settingsNoImageTextColorName'))
			.setDesc(this.plugin.t('settingsNoImageTextColorDesc'))
			.addText(text => text
				.setPlaceholder(this.plugin.t('settingsNoImageTextColorPlaceholder'))
				.setValue(this.plugin.settings.noImageTextColor)
				.onChange(async (value) => {
					this.plugin.settings.noImageTextColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.t('settingsPluginAssetsName'))
			.setDesc(this.plugin.t('settingsPluginAssetsDesc'))
			.addButton((button) => {
				button
					.setButtonText(this.plugin.t('settingsPluginAssetsButton'))
					.onClick(async () => {
						button.setDisabled(true);
						button.setButtonText(this.plugin.t('settingsPluginAssetsRunning'));

						try {
							await this.plugin.downloadPluginAssetsFromRepo();
						} finally {
							button.setDisabled(false);
							button.setButtonText(this.plugin.t('settingsPluginAssetsButton'));
						}
					});
			});
	}
}

