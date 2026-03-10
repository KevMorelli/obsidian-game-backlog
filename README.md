# Game Backlog Plugin para Obsidian

Plugin para renderizar tu backlog de videojuegos completados en una hermosa grilla visual de tarjetas dentro de Obsidian.

## 🎮 Características

- **Grilla visual** de tarjetas con imágenes y detalles
- **Sistema de puntuación** con estrellas (1-5)
- **Información completa**: nombre, portada, fecha, plataforma
- **Modal integrado** para agregar juegos fácilmente
- **Responsive**: se adapta a diferentes tamaños de pantalla
- **Temas**: compatible con tema claro y oscuro

## 📦 Instalación

### Instalación Manual

1. Clona este repositorio o descarga los archivos
2. Copia la carpeta completa a `.obsidian/plugins/` en tu vault de Obsidian
3. Abre Obsidian y ve a Configuración → Plugins de la comunidad
4. Activa "Game Backlog"

### Desarrollo

```bash
# Instalar dependencias
npm install

# Compilar en modo desarrollo (con watch)
npm run dev

# Compilar para producción
npm run build
```

## 🚀 Uso

### Formato Básico

En cualquier nota de Obsidian, crea un bloque de código con el lenguaje `game-backlog`:

````markdown
```game-backlog
---
name: The Legend of Zelda: Breath of the Wild
cover: https://assets.nintendo.com/image/upload/ar_16:9,b_auto:border,c_lpad/b_white/f_auto/q_auto/dpr_2.0/c_scale,w_300/ncom/en_US/games/switch/t/the-legend-of-zelda-breath-of-the-wild-switch/hero
rating: 5
date: 2023-06-15
platform: Nintendo Switch

---
name: Elden Ring
cover: https://image.api.playstation.com/vulcan/ap/rnd/202110/2000/aGhopp3MHppi7kooGE2Dtt8C.png
rating: 5
date: 2023-08-20
platform: PlayStation 5

---
name: Hollow Knight
cover: https://upload.wikimedia.org/wikipedia/en/0/04/Hollow_Knight_first_cover_art.webp
rating: 4
date: 2023-09-10
platform: PC
```
````

### Campos Disponibles

Cada entrada de juego se separa con `---` y puede incluir:

- **name** (o nombre): Título del videojuego
- **cover** (o portada): URL de la imagen de portada
- **rating** (o puntuación): Número del 1 al 5
- **date** (o fecha): Fecha de completación (formato libre)
- **platform** (o plataforma): Consola o sistema donde lo jugaste

> Los campos en español e inglés son intercambiables.

### Agregar Juegos

Puedes agregar juegos de dos formas:

1. **Manualmente**: Edita el bloque de código y agrega una nueva entrada con el formato mostrado arriba

2. **Con el botón**: Haz clic en el botón "+ Agregar Juego" al final de la grilla y completa el formulario

## ⚙️ Configuración

Ve a `Configuración → Game Backlog` para personalizar:

- **Imagen de portada por defecto**: URL de la imagen a mostrar cuando no se especifica una portada

## 📝 Ejemplo Completo

Mira el archivo [ejemplo-backlog.md](ejemplo-backlog.md) para ver un ejemplo funcional.

## 🎨 Personalización CSS

Puedes personalizar los estilos del plugin agregando CSS snippets en Obsidian. Algunas clases útiles:

```css
/* Cambiar el espaciado de la grilla */
.game-backlog-grid {
    gap: 30px;
}

/* Cambiar el tamaño de las tarjetas */
.game-backlog-grid {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
}

/* Personalizar el color de las estrellas */
.star.filled {
    color: #FF6B6B;
}
```

## 🐛 Problemas Conocidos

- Si una imagen no carga, se mostrará la imagen por defecto
- Las fechas aceptan cualquier formato, pero se recomienda YYYY-MM-DD

## 📄 Licencia

MIT

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Siéntete libre de abrir issues o pull requests.

## 💡 Créditos

Creado para gestionar backlog de videojuegos en Obsidian.
