# Instalación Rápida

## Pasos para instalar el plugin en Obsidian:

### 1. Compilar el plugin

Abre una terminal en esta carpeta y ejecuta:

```bash
npm install
npm run build
```

Esto generará el archivo `main.js` necesario.

### 2. Copiar a tu vault de Obsidian

Copia toda esta carpeta a:
```
<TU_VAULT>/.obsidian/plugins/game-backlog/
```

Por ejemplo:
```
C:\Users\TuUsuario\Documents\MiVault\.obsidian\plugins\game-backlog\
```

### 3. Activar el plugin

1. Abre Obsidian
2. Ve a `Configuración` (⚙️)
3. Selecciona `Plugins de la comunidad`
4. Si es necesario, desactiva el modo seguro
5. Encuentra "Game Backlog" en la lista y actívalo

### 4. Usar el plugin

Crea una nueva nota y usa el siguiente formato:

````markdown
```game-backlog
---
name: The Legend of Zelda
cover: https://ejemplo.com/portada.jpg
rating: 5
date: 2024-03-10
platform: Nintendo Switch
```
````

¡Listo! Ahora verás una hermosa grilla de tarjetas.

## Solución de problemas

**Error: No puedo ver el plugin en la lista**
- Asegúrate de haber compilado el código primero (`npm run build`)
- Verifica que la carpeta esté en el lugar correcto
- Reinicia Obsidian

**Las imágenes no cargan**
- Verifica que las URLs sean válidas
- Configura una imagen por defecto en la configuración del plugin

**El botón "Agregar Juego" no funciona**
- Asegúrate de tener permisos de escritura en el archivo
- Verifica que el formato del bloque de código sea correcto
