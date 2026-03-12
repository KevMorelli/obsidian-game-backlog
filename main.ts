import { App, Plugin, PluginSettingTab, Setting, MarkdownPostProcessorContext, Modal, Notice, TFile, requestUrl } from 'obsidian';
import { AppLanguage, I18nKey, translate } from './i18n';

enum GamePlatform {
	SWITCH = 'Switch',
	PC = 'PC',
	STEAM_DECK = 'Steam Deck',
	PS_VITA = 'PS Vita',
	PS2 = 'PS2',
	PS1 = 'PS1',
	NINTENDO_3DS = '3DS',
	NINTENDO_DS = 'DS',
	GBA = 'GBA'
}

interface GameEntry {
	id: string;
	name: string;
	cover: string;
	rating: number;
	completionDate: string;
	platform: GamePlatform;
	platinum: boolean;
	hours: number;
}

function generateGameId(): string {
	return `game-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface BlockConfig {
	isLocked: boolean;
	topGame1: string;
	topGame2: string;
	topGame3: string;
}

type PlatformMode = 'none' | 'image' | 'label';

interface GameBacklogSettings {
	language: AppLanguage;
	defaultCoverImage: string;
	platformMode: PlatformMode;
	imageDownloadFolder: string;
}

const DEFAULT_SETTINGS: GameBacklogSettings = {
	language: 'es',
	defaultCoverImage: 'https://via.placeholder.com/300x400?text=No+Cover',
	platformMode: 'image',
	imageDownloadFolder: ''
}

export default class GameBacklogPlugin extends Plugin {
	settings: GameBacklogSettings;

	t(key: I18nKey, vars?: Record<string, string | number>): string {
		return translate(this.settings.language, key, vars);
	}

	getDateLocale(): string {
		return this.settings.language === 'en' ? 'en-US' : 'es-ES';
	}

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'insert-game-backlog-block',
			name: this.t('commandInsertBlock'),
			editorCallback: (editor) => {
				const defaultBlock = [
					'```game-backlog',
					'---',
					'id: ',
					'name: ',
					'cover: ',
					'rating: 3',
					'date: ',
					'platform: Switch',
					'hours: 0',
					'platinum: false',
					'```'
				].join('\n');

				editor.replaceSelection(defaultBlock);
			}
		});

		// Registrar el procesador para bloques de código con lenguaje "game-backlog"
		this.registerMarkdownCodeBlockProcessor('game-backlog', (source, el, ctx) => {
			try {
				this.renderGameBacklog(source, el, ctx);
			} catch (error) {
				console.error('[game-backlog] Render error:', error);
				el.createDiv({ text: this.t('renderError') });
			}
		});

		// Agregar tab de configuración
		this.addSettingTab(new GameBacklogSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		const rawData = (await this.loadData()) as Partial<GameBacklogSettings> & { showPlatform?: boolean };
		const { showPlatform, ...rest } = rawData;

		const migratedPlatformMode: PlatformMode = rawData.platformMode
			?? (typeof showPlatform === 'boolean' ? (showPlatform ? 'image' : 'none') : DEFAULT_SETTINGS.platformMode);

		this.settings = Object.assign({}, DEFAULT_SETTINGS, rest, { platformMode: migratedPlatformMode });

		if (!rawData.platformMode && typeof showPlatform === 'boolean') {
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
					if (typeof currentGame.platinum !== 'boolean') {
						currentGame.platinum = false;
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
				case 'nombre':
					currentGame.name = value;
					break;
				case 'cover':
				case 'portada':
					currentGame.cover = value;
					break;
				case 'rating':
				case 'puntuacion':
				case 'puntuación':
					currentGame.rating = parseInt(value) || 0;
					break;
				case 'date':
				case 'fecha':
					currentGame.completionDate = value;
					break;
				case 'platform':
				case 'plataforma':
					currentGame.platform = this.parsePlatform(value);
					break;
				case 'hours':
				case 'horas':
					currentGame.hours = parseFloat(value) || 0;
					break;
				case 'platinum':
				case 'platinado':
					currentGame.platinum = ['true', '1', 'si', 'sí', 'yes'].includes(value.toLowerCase());
					break;
			}
		}
		
		// Agregar el último juego si existe
		if (currentGame.name) {
			if (!currentGame.id) {
				currentGame.id = generateGameId();
			}
			if (typeof currentGame.platinum !== 'boolean') {
				currentGame.platinum = false;
			}
			if (typeof currentGame.hours !== 'number') {
				currentGame.hours = 0;
			}
			entries.push(currentGame as GameEntry);
		}
		
		return entries;
	}

	parsePlatform(value: string): GamePlatform {
		const normalized = value.toLowerCase().trim();
		const platformMap: { [key: string]: GamePlatform } = {
			'switch': GamePlatform.SWITCH,
			'nintendo switch': GamePlatform.SWITCH,
			'pc': GamePlatform.PC,
			'windows': GamePlatform.PC,
			'steam deck': GamePlatform.STEAM_DECK,
			'steamdeck': GamePlatform.STEAM_DECK,
			'ps vita': GamePlatform.PS_VITA,
			'vita': GamePlatform.PS_VITA,
			'ps2': GamePlatform.PS2,
			'playstation 2': GamePlatform.PS2,
			'playstation2': GamePlatform.PS2,
			'ps1': GamePlatform.PS1,
			'playstation 1': GamePlatform.PS1,
			'playstation1': GamePlatform.PS1,
			'3ds': GamePlatform.NINTENDO_3DS,
			'nintendo 3ds': GamePlatform.NINTENDO_3DS,
			'ds': GamePlatform.NINTENDO_DS,
			'nintendo ds': GamePlatform.NINTENDO_DS,
			'gba': GamePlatform.GBA,
			'game boy advance': GamePlatform.GBA
		};
		return platformMap[normalized] || GamePlatform.SWITCH;
	}

	getPlatformLogo(platform: GamePlatform): string {
		const logoMap: { [key in GamePlatform]: string } = {
			[GamePlatform.SWITCH]: 'Switch.png',
			[GamePlatform.PC]: 'PC.png',
			[GamePlatform.STEAM_DECK]: 'Steam Deck.png',
			[GamePlatform.PS_VITA]: 'PS Vita.png',
			[GamePlatform.PS2]: 'PS2.png',
			[GamePlatform.PS1]: 'PS1.png',
			[GamePlatform.NINTENDO_3DS]: '3DS.png',
			[GamePlatform.NINTENDO_DS]: 'DS.png',
			[GamePlatform.GBA]: 'GBA.png'
		};
		return logoMap[platform] || '';
	}

	getPlatformLabelIcon(platform: GamePlatform): string {
		const iconMap: { [key in GamePlatform]: string } = {
			[GamePlatform.SWITCH]: '🎮',
			[GamePlatform.PC]: '🖥️',
			[GamePlatform.STEAM_DECK]: '🕹️',
			[GamePlatform.PS_VITA]: '🎮',
			[GamePlatform.PS2]: '🎮',
			[GamePlatform.PS1]: '🎮',
			[GamePlatform.NINTENDO_3DS]: '🎮',
			[GamePlatform.NINTENDO_DS]: '🎮',
			[GamePlatform.GBA]: '🎮'
		};

		return iconMap[platform] || '🎮';
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
			} catch (e) {
				console.warn('[game-backlog] requestUrl failed, trying fetch...');
			}

			// Estrategia 2: Fetch con User-Agent (simula navegador real)
			try {
				if (!arrayBuffer) {
					const response = await fetch(url, {
						headers: {
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
						}
					});
					if (response.ok) {
						arrayBuffer = await response.arrayBuffer();
					}
				}
			} catch (e) {
				console.warn('[game-backlog] Fetch with User-Agent failed, trying alternative method...');
			}

			// Estrategia 3: Intentar con Node.js nativo si está disponible (Electron)
			if (!arrayBuffer) {
				try {
					const https = await import('https');
					const http = await import('http');

					arrayBuffer = await new Promise((resolve, reject) => {
						const protocolModule = url.startsWith('https') ? https : http;
						(protocolModule as any).get(url, {
							headers: {
								'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
							}
						}, (res: any) => {
							const chunks: Buffer[] = [];
							res.on('data', (chunk: any) => chunks.push(Buffer.from(chunk)));
							res.on('end', () => {
								const merged = Buffer.concat(chunks);
								const exact = merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength);
								resolve(exact);
							});
							res.on('error', reject);
						}).on('error', reject);
					});
				} catch (e) {
					console.warn('[game-backlog] Node.js method not available or failed');
				}
			}

			if (!arrayBuffer) {
				throw new Error(this.t('downloadErrorUnavailable'));
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
			console.error('[game-backlog] Download error:', error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(this.t('downloadErrorPrefix', { error: errorMsg }));
			return url;
		}
	}

	getPluginAssetUrl(fileName: string): string {
		if (!fileName) return '';

		const assetPath = `${this.app.vault.configDir}/plugins/${this.manifest.id}/assets/${fileName}`;
		const adapter = this.app.vault.adapter as unknown as { getResourcePath?: (path: string) => string };

		if (typeof adapter.getResourcePath === 'function') {
			return adapter.getResourcePath(assetPath);
		}

		return assetPath;
	}

	resolveImageSource(rawPath: string, sourcePath: string = ''): string {
		if (!rawPath) return '';

		// Si es una URL o data URI, retornar directamente
		if (/^(https?:\/\/|data:|app:|blob:)/i.test(rawPath)) {
			return rawPath;
		}

		// Si comienza con .obsidian/, es relativo al vault root
		if (rawPath.startsWith('.obsidian/')) {
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

	formatCompletionDate(rawDate: string): string {
		const parsed = new Date(rawDate);
		if (Number.isNaN(parsed.getTime())) return rawDate;

		const locale = this.getDateLocale();
		return new Intl.DateTimeFormat(locale, {
			day: 'numeric',
			month: 'long'
		}).format(parsed);
	}

	parseBlockConfig(source: string): BlockConfig {
		const config: BlockConfig = { isLocked: false, topGame1: '', topGame2: '', topGame3: '' };
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

		const configSection = `isLocked: ${config.isLocked}\ntopGame1: ${config.topGame1}\ntopGame2: ${config.topGame2}\ntopGame3: ${config.topGame3}\n`;
		const newBlock = configSection + entriesPart;
		const newContent = content.replace(codeBlockRegex, '\`\`\`game-backlog\n' + newBlock + '\`\`\`');
		await this.app.vault.modify(file, newContent);
	}

	renderGameBacklog(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const games = this.parseGameEntries(source);
		const blockConfig = this.parseBlockConfig(source);
		
		// Contenedor principal
		const container = el.createDiv({ cls: 'game-backlog-container' });
		
		// Estado de vista (tarjetas o tabla)
		let isTableView = false;
		
		// Contenedor de controles
		const controlsContainer = container.createDiv({ cls: 'game-backlog-controls' });
		
		// Botón de toggle vista
		const toggleButton = controlsContainer.createEl('button', { cls: 'game-view-toggle', text: '📊' });
		toggleButton.title = this.t('toggleViewTitle');

		// Botón de candado
		const lockButton = controlsContainer.createEl('button', { cls: 'game-lock-toggle' });
		lockButton.textContent = blockConfig.isLocked ? '🔒' : '🔓';
		lockButton.title = blockConfig.isLocked ? this.t('lockTitleLocked') : this.t('lockTitleUnlocked');
		lockButton.addEventListener('click', async () => {
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
		});
		
		// Contenedor para vista de tarjetas
		const cardsContainer = container.createDiv({ cls: 'game-backlog-cards-view' });
		
		// Contenedor para vista de tabla
		const tableContainer = container.createDiv({ cls: 'game-backlog-table-view' });
		tableContainer.style.display = 'none';
		
		// Sección de estadísticas
		const statsContainer = container.createDiv({ cls: 'game-stats-container' });
		
		// Función para renderizar tarjetas
		const renderCards = () => {
			cardsContainer.empty();
			const grid = cardsContainer.createDiv({ cls: 'game-backlog-grid' });
		
		games.forEach(game => {
			const card = grid.createDiv({ cls: 'game-card' });
			if (game.platinum) {
				card.addClass('game-card-platinum');
			}
			
			// Imagen de portada
			const coverContainer = card.createDiv({ cls: 'game-cover-container' });
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
				const platinumBadge = coverContainer.createEl('img', {
					cls: 'game-platinum-badge',
					attr: {
						src: this.getPluginAssetUrl('Platinum.png'),
						alt: this.t('platinumBadgeAlt')
					}
				});

				platinumBadge.onerror = () => {
					platinumBadge.remove();
				};
			}

			// Visualización de plataforma por modo global
			if (this.settings.platformMode === 'image') {
				const brandContainer = card.createDiv({ cls: 'game-brand-logo' });
				const brandImageSource = this.getPluginAssetUrl(this.getPlatformLogo(game.platform));
				if (brandImageSource) {
					const brandImage = brandContainer.createEl('img', {
						cls: 'game-brand-image',
						attr: {
							src: brandImageSource,
							alt: game.platform || this.t('platformBrandAlt')
						}
					});

					brandImage.onerror = () => {
						brandImage.remove();
					};

					const platformLabel = brandContainer.createDiv({ cls: 'game-brand-platform-label' });
					platformLabel.textContent = game.platform || '';
				}
			}
			
			// Información del juego
			const info = card.createDiv({ cls: 'game-info' });
			
			// Rating (estrellas)
			const ratingContainer = info.createDiv({ cls: 'game-rating' });
			for (let i = 1; i <= 5; i++) {
				const star = ratingContainer.createSpan({ 
					cls: i <= (game.rating || 0) ? 'star filled' : 'star empty'
				});
				star.textContent = '★';
			}
			
			// Fecha y plataforma
			const details = info.createDiv({ cls: 'game-details' });
			
			if (game.completionDate) {
				const date = details.createDiv({ cls: 'game-date' });
				date.textContent = `📅 ${this.formatCompletionDate(game.completionDate)}`;
			}

			if (this.settings.platformMode === 'label' && game.platform) {
				const platform = details.createDiv({ cls: 'game-platform' });
				platform.textContent = `${this.getPlatformLabelIcon(game.platform)} ${game.platform}`;
			}



			if (game.hours && game.hours > 0) {
				const hours = details.createDiv({ cls: 'game-hours' });
				hours.textContent = `⏱️ ${game.hours} hs`;
			}

			// Click handler para abrir modal de lectura (siempre disponible)
			card.addEventListener('click', (e) => {
				e.stopPropagation();
				new GameViewModal(this.app, game, (editedGame) => {
					this.editGameInFile(ctx, game, editedGame);
				}, !blockConfig.isLocked, this).open();
			});
			card.style.cursor = 'pointer';
			
		});

			// Tarjeta de agregar (solo si desbloqueado)
			if (!blockConfig.isLocked) {
				const addCard = grid.createDiv({ cls: 'game-card game-card-add' });
				addCard.createSpan({ cls: 'game-card-add-icon', text: '+' });
				addCard.addEventListener('click', () => {
					new AddGameModal(this.app, (newGame) => {
						this.addGameToFile(ctx, newGame);
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
				row.style.cursor = 'pointer';
				
				// Juego
				const nameCell = row.createEl('td');
				nameCell.textContent = game.name || this.t('noName');
				
				// Plataforma
				const platformCell = row.createEl('td');
				platformCell.textContent = game.platform || this.t('emptyValue');
				
				// Fecha
				const dateCell = row.createEl('td');
				if (game.completionDate) {
					const parsed = new Date(game.completionDate);
					if (!Number.isNaN(parsed.getTime())) {
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
				if (game.rating) {
					scoreCell.textContent = `${game.rating} ⭐`;
				} else {
					scoreCell.textContent = this.t('emptyValue');
				}
				
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
						this.editGameInFile(ctx, game, editedGame);
					}, !blockConfig.isLocked, this).open();
				});
				row.style.cursor = 'pointer';
			});
			
			// Fila de agregar (solo si desbloqueado)
			if (!blockConfig.isLocked) {
				const addRow = tbody.createEl('tr', { cls: 'game-table-add-row' });
				const addCell = addRow.createEl('td', { attr: { colspan: '5' } });
				addCell.textContent = '+';
				addRow.addEventListener('click', () => {
					new AddGameModal(this.app, (newGame) => {
						this.addGameToFile(ctx, newGame);
					}, this).open();
				});
			}
		};
		
		// Función para actualizar estadísticas
		const renderStats = () => {
			const totalGames = games.length;
			const totalHours = games.reduce((sum, game) => sum + (game.hours || 0), 0);
			
			// Labels de estadísticas
			const statsLabels = statsContainer.createDiv({ cls: 'game-stats-labels' });
			
			const gamesLabel = statsLabels.createDiv({ cls: 'game-stat-item' });
			gamesLabel.textContent = this.t('statsCompleted', { count: totalGames });
			
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
					
					select.addEventListener('change', async (e: Event) => {
						const newValue = (e.target as HTMLSelectElement).value;
						blockConfig[settingKey] = newValue;
						await this.saveBlockConfig(ctx, blockConfig);
					});
				}
			});
		};
		
		// Renderizar inicial con tarjetas
		renderCards();
		
		// Sección de estadísticas
		statsContainer.empty();
		renderStats();
		
		// Event listener para toggle de vista
		toggleButton.addEventListener('click', () => {
			isTableView = !isTableView;
			if (isTableView) {
				cardsContainer.style.display = 'none';
				tableContainer.style.display = 'block';
				toggleButton.textContent = '🃏';
				renderTable();
			} else {
				cardsContainer.style.display = 'block';
				tableContainer.style.display = 'none';
				toggleButton.textContent = '📊';
			}
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
			const newEntry = `\n---\nid: ${gameId}\nname: ${game.name}\ncover: ${game.cover}\nrating: ${game.rating}\ndate: ${game.completionDate}\nplatform: ${game.platform}\nhours: ${game.hours}\nplatinum: ${game.platinum}\n`;
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

			const newEntry = `---\nid: ${stableId}\nname: ${newGame.name}\ncover: ${newGame.cover}\nrating: ${newGame.rating}\ndate: ${newGame.completionDate}\nplatform: ${newGame.platform}\nhours: ${newGame.hours}\nplatinum: ${newGame.platinum}\n`;

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
	platform: GamePlatform = GamePlatform.SWITCH;
	hours: number = 0;
	platinum: boolean = false;

	constructor(app: App, onSubmit: (game: GameEntry) => void, plugin: GameBacklogPlugin, existingGame?: GameEntry) {
		super(app);
		this.onSubmit = onSubmit;
		this.plugin = plugin;
		this.isEditMode = !!existingGame;
		
		if (existingGame) {
			this.id = existingGame.id || '';
			this.name = existingGame.name || '';
			this.cover = existingGame.cover || '';
			this.rating = existingGame.rating || 3;
			this.completionDate = existingGame.completionDate || '';
			this.platform = existingGame.platform || GamePlatform.SWITCH;
			this.hours = existingGame.hours || 0;
			this.platinum = existingGame.platinum || false;
		} else {
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
					});
			});

		// Botón de descarga de imagen remota
		if (this.cover && /^https?:\/\//.test(this.cover)) {
			coverSetting.addButton(btn => btn
				.setButtonText('⬇️')
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
				}));
		}
		
		// Rating
		new Setting(contentEl)
			.setName(this.plugin.t('modalRatingLabel'))
			.setDesc(this.plugin.t('modalRatingDesc'))
			.addSlider(slider => slider
				.setLimits(1, 5, 1)
				.setValue(this.rating)
				.setDynamicTooltip()
				.onChange(value => {
					this.rating = value;
				}));
		
		// Fecha de completación
		new Setting(contentEl)
			.setName(this.plugin.t('modalCompletionDateLabel'))
			.setDesc(this.plugin.t('modalCompletionDateDesc'))
			.addText(text => text
				.setPlaceholder('YYYY-MM-DD')
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
				Object.values(GamePlatform).forEach(platform => {
					dropdown.addOption(platform, platform);
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
						platinum: this.platinum
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
	canEdit: boolean;
	plugin: GameBacklogPlugin;

	constructor(app: App, game: GameEntry, onEdit: (editedGame: GameEntry) => void, canEdit: boolean = true, plugin?: GameBacklogPlugin) {
		super(app);
		this.game = game;
		this.onEdit = onEdit;
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
		for (let i = 1; i <= 5; i++) {
			ratingValue.createSpan({
				cls: i <= (this.game.rating || 0) ? 'star filled' : 'star empty',
				text: '★'
			});
		}

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
			const parsed = new Date(this.game.completionDate);
			if (!Number.isNaN(parsed.getTime())) {
				const locale = this.plugin.getDateLocale();
				dateValue.textContent = new Intl.DateTimeFormat(locale, {
					day: 'numeric',
					month: 'long',
					year: 'numeric'
				}).format(parsed);
			} else {
				dateValue.textContent = this.game.completionDate;
			}
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
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
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

		containerEl.createEl('h2', { text: this.plugin.t('settingsTitle') });

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
			.setName(this.plugin.t('settingsPlatformModeName'))
			.setDesc(this.plugin.t('settingsPlatformModeDesc'))
			.addDropdown(dropdown => dropdown
				.addOption('none', this.plugin.t('platformModeNone'))
				.addOption('image', this.plugin.t('platformModeImage'))
				.addOption('label', this.plugin.t('platformModeLabel'))
				.setValue(this.plugin.settings.platformMode)
				.onChange(async (value) => {
					this.plugin.settings.platformMode = value as PlatformMode;
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
	}
}

