import { App, Plugin, PluginSettingTab, Setting, MarkdownPostProcessorContext, Modal, Notice, TFile } from 'obsidian';

interface GameEntry {
	name: string;
	cover: string;
	brandImage: string;
	rating: number;
	completionDate: string;
	platform: string;
	platinum: boolean;
}

interface GameBacklogSettings {
	defaultCoverImage: string;
	defaultBrandImage: string;
	brandStripBackgroundColor: string;
	brandLogoScale: number;
	brandLogoPaddingLeft: number;
	brandLogoPaddingRight: number;
	brandLogoPaddingTop: number;
	brandLogoPaddingBottom: number;
}

const DEFAULT_SETTINGS: GameBacklogSettings = {
	defaultCoverImage: 'https://via.placeholder.com/300x400?text=No+Cover',
	defaultBrandImage: '',
	brandStripBackgroundColor: '#1f1f1f',
	brandLogoScale: 100,
	brandLogoPaddingLeft: 0,
	brandLogoPaddingRight: 0,
	brandLogoPaddingTop: 0,
	brandLogoPaddingBottom: 0
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
					'name: ',
					'cover: ',
					'brand: ',
					'rating: 3',
					'date: ',
					'platform: ',
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
					if (typeof currentGame.platinum !== 'boolean') {
						currentGame.platinum = false;
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
				case 'name':
				case 'nombre':
					currentGame.name = value;
					break;
				case 'cover':
				case 'portada':
					currentGame.cover = value;
					break;
				case 'brand':
				case 'brandimage':
				case 'marca':
					currentGame.brandImage = value;
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
					currentGame.platform = value;
					break;
				case 'platinum':
				case 'platinado':
					currentGame.platinum = ['true', '1', 'si', 'sí', 'yes'].includes(value.toLowerCase());
					break;
			}
		}
		
		// Agregar el último juego si existe
		if (currentGame.name) {
			if (typeof currentGame.platinum !== 'boolean') {
				currentGame.platinum = false;
			}
			entries.push(currentGame as GameEntry);
		}
		
		return entries;
	}

	resolveImageSource(rawPath: string): string {
		if (!rawPath) return '';

		if (/^(https?:\/\/|data:|app:|blob:)/i.test(rawPath)) {
			return rawPath;
		}

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
			
			const mediaRow = card.createDiv({ cls: 'game-media-row' });

			// Imagen de portada
			const coverContainer = mediaRow.createDiv({ cls: 'game-cover-container' });
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

			const brandContainer = mediaRow.createDiv({ cls: 'game-brand-strip' });
			brandContainer.style.backgroundColor = this.settings.brandStripBackgroundColor;
			brandContainer.style.padding = `${this.settings.brandLogoPaddingTop}px ${this.settings.brandLogoPaddingRight}px ${this.settings.brandLogoPaddingBottom}px ${this.settings.brandLogoPaddingLeft}px`;
			const brandImageSource = this.resolveImageSource(game.brandImage || this.settings.defaultBrandImage);
			if (brandImageSource) {
				const brandImage = brandContainer.createEl('img', {
					cls: 'game-brand-image',
					attr: {
						src: brandImageSource,
						alt: game.platform || 'Platform brand'
					}
				});
				brandImage.style.transform = `scale(${Math.max(0, Math.min(100, this.settings.brandLogoScale)) / 100})`;

				brandImage.onerror = () => {
					brandImage.remove();
				};
			}

			const nameOverlay = coverContainer.createDiv({ cls: 'game-name-overlay' });
			nameOverlay.textContent = game.name || 'Sin nombre';
			
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
			const newEntry = `\n---\nname: ${game.name}\ncover: ${game.cover}\nbrand: ${game.brandImage}\nrating: ${game.rating}\ndate: ${game.completionDate}\nplatform: ${game.platform}\nplatinum: ${game.platinum}\n`;
			const updatedBlock = match[1] + newEntry;
			const newContent = content.replace(codeBlockRegex, `\`\`\`game-backlog\n${updatedBlock}\`\`\``);
			
			await this.app.vault.modify(file, newContent);
			new Notice('Juego agregado al backlog');
		}
	}
}

class AddGameModal extends Modal {
	onSubmit: (game: GameEntry) => void;
	
	name: string = '';
	cover: string = '';
	brandImage: string = '';
	rating: number = 3;
	completionDate: string = '';
	platform: string = '';
	platinum: boolean = false;

	constructor(app: App, onSubmit: (game: GameEntry) => void) {
		super(app);
		this.onSubmit = onSubmit;
		
		// Fecha actual por defecto
		const today = new Date();
		this.completionDate = today.toISOString().split('T')[0];
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl('h2', { text: 'Agregar Nuevo Juego' });
		
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

		new Setting(contentEl)
			.setName('Imagen de marca lateral')
			.setDesc('Ruta local del vault o URL para la franja de la consola')
			.addText(text => text
				.setPlaceholder('Assets/brands/nintendo-3ds.png')
				.setValue(this.brandImage)
				.onChange(value => {
					this.brandImage = value;
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
		
		// Plataforma
		new Setting(contentEl)
			.setName('Plataforma')
			.setDesc('Consola o plataforma donde lo jugaste')
			.addText(text => text
				.setPlaceholder('Ej: Nintendo Switch')
				.setValue(this.platform)
				.onChange(value => {
					this.platform = value;
				}));

		new Setting(contentEl)
			.setName('Platinado')
			.setDesc('Etiqueta de platinado (todavía no se usa en el render)')
			.addToggle(toggle => toggle
				.setValue(this.platinum)
				.onChange(value => {
					this.platinum = value;
				}));
		
		// Botones
		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Agregar')
				.setCta()
				.onClick(() => {
					this.onSubmit({
						name: this.name,
						cover: this.cover,
						brandImage: this.brandImage,
						rating: this.rating,
						completionDate: this.completionDate,
						platform: this.platform,
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
			.setName('Imagen lateral por defecto')
			.setDesc('Ruta local del vault o URL para la franja lateral')
			.addText(text => text
				.setPlaceholder('Assets/brands/default-brand.png')
				.setValue(this.plugin.settings.defaultBrandImage)
				.onChange(async (value) => {
					this.plugin.settings.defaultBrandImage = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Color de fondo franja lateral')
			.setDesc('Color de fondo detrás de la imagen transparente de marca')
			.addText(text => {
				text.setPlaceholder('#1f1f1f')
					.setValue(this.plugin.settings.brandStripBackgroundColor)
					.onChange(async (value) => {
						this.plugin.settings.brandStripBackgroundColor = value || '#1f1f1f';
						await this.plugin.saveSettings();
					});
				text.inputEl.type = 'color';
				return text;
			});

		new Setting(containerEl)
			.setName('Escala del logo lateral')
			.setDesc('Tamaño del logo dentro de la franja (0% a 100%)')
			.addSlider(slider => slider
				.setLimits(0, 100, 1)
				.setValue(this.plugin.settings.brandLogoScale)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.brandLogoScale = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Padding izquierdo del logo')
			.setDesc('Padding en px para la imagen de marca lateral')
			.addSlider(slider => slider
				.setLimits(0, 20, 1)
				.setValue(this.plugin.settings.brandLogoPaddingLeft)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.brandLogoPaddingLeft = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Padding derecho del logo')
			.setDesc('Padding en px para la imagen de marca lateral')
			.addSlider(slider => slider
				.setLimits(0, 20, 1)
				.setValue(this.plugin.settings.brandLogoPaddingRight)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.brandLogoPaddingRight = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Padding superior del logo')
			.setDesc('Padding en px para la imagen de marca lateral')
			.addSlider(slider => slider
				.setLimits(0, 20, 1)
				.setValue(this.plugin.settings.brandLogoPaddingTop)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.brandLogoPaddingTop = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Padding inferior del logo')
			.setDesc('Padding en px para la imagen de marca lateral')
			.addSlider(slider => slider
				.setLimits(0, 20, 1)
				.setValue(this.plugin.settings.brandLogoPaddingBottom)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.brandLogoPaddingBottom = value;
					await this.plugin.saveSettings();
				}));
	}
}
