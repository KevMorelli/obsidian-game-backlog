import { App, Plugin, PluginSettingTab, Setting, MarkdownPostProcessorContext, Modal, Notice, TFile } from 'obsidian';

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

interface GameBacklogSettings {
	defaultCoverImage: string;
	showPlatform: boolean;
}

const DEFAULT_SETTINGS: GameBacklogSettings = {
	defaultCoverImage: 'https://via.placeholder.com/300x400?text=No+Cover',
	showPlatform: true
}

export default class GameBacklogPlugin extends Plugin {
	settings: GameBacklogSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'insert-game-backlog-block',
			name: 'Insertar bloque game-backlog',
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
				el.createDiv({ text: 'Error renderizando game-backlog. Revisa la consola de desarrollador.' });
			}
		});

		// Agregar tab de configuración
		this.addSettingTab(new GameBacklogSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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

	getPluginAssetUrl(fileName: string): string {
		if (!fileName) return '';

		const assetPath = `${this.app.vault.configDir}/plugins/${this.manifest.id}/assets/${fileName}`;
		const adapter = this.app.vault.adapter as unknown as { getResourcePath?: (path: string) => string };

		if (typeof adapter.getResourcePath === 'function') {
			return adapter.getResourcePath(assetPath);
		}

		return assetPath;
	}

	resolveImageSource(rawPath: string): string {
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
			// Si no encuentra el archivo, retornar la ruta como está
			// (puede que no exista durante desarrollo)
			return rawPath;
		}

		// Intentar resolver como enlace o ruta de archivo del vault
		const linked = this.app.metadataCache.getFirstLinkpathDest(rawPath, '');
		if (linked instanceof TFile) {
			return this.app.vault.getResourcePath(linked);
		}

		const byPath = this.app.vault.getAbstractFileByPath(rawPath);
		if (byPath instanceof TFile) {
			return this.app.vault.getResourcePath(byPath);
		}

		return rawPath;
	}

	formatCompletionDate(rawDate: string): string {
		const parsed = new Date(rawDate);
		if (Number.isNaN(parsed.getTime())) return rawDate;

		const locale = navigator.language || 'es-ES';
		return new Intl.DateTimeFormat(locale, {
			day: 'numeric',
			month: 'long'
		}).format(parsed);
	}

	renderGameBacklog(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const games = this.parseGameEntries(source);
		
		// Contenedor principal
		const container = el.createDiv({ cls: 'game-backlog-container' });
		
		// Grilla de juegos
		const grid = container.createDiv({ cls: 'game-backlog-grid' });
		
		games.forEach(game => {
			const card = grid.createDiv({ cls: 'game-card' });
			if (game.platinum) {
				card.addClass('game-card-platinum');
			}
			
			// Imagen de portada
			const coverContainer = card.createDiv({ cls: 'game-cover-container' });
			const cover = coverContainer.createEl('img', { 
				cls: 'game-cover',
				attr: {
					src: this.resolveImageSource(game.cover || this.settings.defaultCoverImage),
					alt: game.name || 'Game cover'
				}
			});
			
			// Manejar errores de carga de imagen
			cover.onerror = () => {
				cover.src = this.resolveImageSource(this.settings.defaultCoverImage);
			};

			const nameOverlay = coverContainer.createDiv({ cls: 'game-name-overlay' });
			nameOverlay.textContent = game.name || 'Sin nombre';

			// Botón de editar
			const editButton = coverContainer.createDiv({ cls: 'game-edit-button' });
			editButton.innerHTML = '✏';
			editButton.addEventListener('click', (e) => {
				e.stopPropagation();
				new AddGameModal(this.app, (editedGame) => {
					this.editGameInFile(ctx, game, editedGame);
				}, game).open();
			});

			if (game.platinum) {
				const platinumBadge = coverContainer.createEl('img', {
					cls: 'game-platinum-badge',
					attr: {
						src: this.getPluginAssetUrl('Platinum.png'),
						alt: 'Platinum badge'
					}
				});

				platinumBadge.onerror = () => {
					platinumBadge.remove();
				};
			}

			// Brand logo overlay en borde inferior derecho
			const brandContainer = card.createDiv({ cls: 'game-brand-logo' });
			
			const brandImageSource = this.getPluginAssetUrl(this.getPlatformLogo(game.platform));
			if (brandImageSource) {
				const brandImage = brandContainer.createEl('img', {
					cls: 'game-brand-image',
					attr: {
						src: brandImageSource,
						alt: game.platform || 'Platform brand'
					}
				});

				brandImage.onerror = () => {
					brandImage.remove();
				};

				const platformLabel = brandContainer.createDiv({ cls: 'game-brand-platform-label' });
				platformLabel.textContent = game.platform || '';
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



			if (game.hours && game.hours > 0) {
				const hours = details.createDiv({ cls: 'game-hours' });
				hours.textContent = `⏱️ ${game.hours} hs`;
			}
			
		});
		
		// Botón para agregar nuevo juego
		const addButton = container.createDiv({ cls: 'game-add-button' });
		const button = addButton.createEl('button', { text: '+ Agregar Juego' });
		
		button.addEventListener('click', () => {
			new AddGameModal(this.app, (newGame) => {
				this.addGameToFile(ctx, newGame);
			}).open();
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
			new Notice('Juego agregado al backlog');
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
				new Notice('No se pudo encontrar la entrada a editar.');
				return;
			}

			const targetEntry = entries[entryIndex];
			const updatedBlock = originalBlock.replace(targetEntry, newEntry);
			const newContent = content.replace(codeBlockRegex, `\`\`\`game-backlog\n${updatedBlock}\`\`\``);
			
			await this.app.vault.modify(file, newContent);
			new Notice('Juego actualizado');
		}
	}
}

class AddGameModal extends Modal {
	onSubmit: (game: GameEntry) => void;
	isEditMode: boolean;
	
	id: string = '';
	name: string = '';
	cover: string = '';
	rating: number = 3;
	completionDate: string = '';
	platform: GamePlatform = GamePlatform.SWITCH;
	hours: number = 0;
	platinum: boolean = false;

	constructor(app: App, onSubmit: (game: GameEntry) => void, existingGame?: GameEntry) {
		super(app);
		this.onSubmit = onSubmit;
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
		
		contentEl.createEl('h2', { text: this.isEditMode ? 'Editar Juego' : 'Agregar Nuevo Juego' });
		
		// Nombre
		new Setting(contentEl)
			.setName('Nombre del juego')
			.setDesc('Título del videojuego')
			.addText(text => text
				.setPlaceholder('Ej: The Legend of Zelda')
				.setValue(this.name)
				.onChange(value => {
					this.name = value;
				}));
		
		// Portada (URL)
		new Setting(contentEl)
			.setName('URL de la portada')
			.setDesc('Link a la imagen de la portada')
			.addText(text => text
				.setPlaceholder('https://ejemplo.com/portada.jpg')
				.setValue(this.cover)
				.onChange(value => {
					this.cover = value;
				}));
		
		// Rating
		new Setting(contentEl)
			.setName('Puntuación')
			.setDesc('Del 1 al 5')
			.addSlider(slider => slider
				.setLimits(1, 5, 1)
				.setValue(this.rating)
				.setDynamicTooltip()
				.onChange(value => {
					this.rating = value;
				}));
		
		// Fecha de completación
		new Setting(contentEl)
			.setName('Fecha de completación')
			.setDesc('Fecha en que terminaste el juego')
			.addText(text => text
				.setPlaceholder('YYYY-MM-DD')
				.setValue(this.completionDate)
				.onChange(value => {
					this.completionDate = value;
				})
				.inputEl.type = 'date');
		
		// Plataforma - Dropdown
		new Setting(contentEl)
			.setName('Plataforma')
			.setDesc('Consola o plataforma donde lo jugaste')
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
			.setName('Horas jugadas')
			.setDesc('Cantidad de horas (acepta decimales, ej: 2.5)')
			.addText(text => text
				.setPlaceholder('0')
				.setValue(String(this.hours))
				.onChange(value => {
					this.hours = parseFloat(value) || 0;
				})
				.inputEl.type = 'number');

		new Setting(contentEl)
			.setName('Platinado')
			.setDesc('Logro de platino obtenido')
			.addToggle(toggle => toggle
				.setValue(this.platinum)
				.onChange(value => {
					this.platinum = value;
				}));
		
		// Botones
		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText(this.isEditMode ? 'Guardar' : 'Agregar')
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
				.setButtonText('Cancelar')
				.onClick(() => {
					this.close();
				}));
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

		containerEl.createEl('h2', { text: 'Configuración de Game Backlog' });

		new Setting(containerEl)
			.setName('Imagen de portada por defecto')
			.setDesc('URL de la imagen a mostrar cuando no se especifica portada')
			.addText(text => text
				.setPlaceholder('https://ejemplo.com/default.jpg')
				.setValue(this.plugin.settings.defaultCoverImage)
				.onChange(async (value) => {
					this.plugin.settings.defaultCoverImage = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Mostrar plataforma')
			.setDesc('Mostrar el nombre de la plataforma en cada tarjeta')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showPlatform)
				.onChange(async (value) => {
					this.plugin.settings.showPlatform = value;
					await this.plugin.saveSettings();
				}));
	}
}

