# Traductor de subtítulos

Traduce archivos de subtítulos **.srt** y **.vtt** con inteligencia artificial: Claude, Gemini, GPT, DeepSeek, Qwen o un modelo local en LM Studio. Funciona entero en el navegador. No hay que instalar nada ni compilar nada, y no tiene servidor propio.

## Cómo se usa

1. Abre la página: la [versión web](https://davidarribas.github.io/traductor-de-subtitulos/), o en local `index.html` o `Iniciar.command`.
2. Pulsa **🔑 Claves de API** y pega la clave del proveedor que vayas a usar.
3. Arrastra el archivo de subtítulos. La app detecta el idioma y propone el destino: si está en inglés, lo traduce al español; si está en otro idioma, al inglés. Para el chino simplificado hay un botón directo.
4. Opcional, pero mejora mucho el resultado: describe el vídeo en **Sobre el vídeo** y rellena el **Glosario** (hay uno de ejemplo para wargames).
5. Pulsa **Traducir**. Revisa y corrige en la tabla lo que haga falta, y descarga el `.srt`.

Para corregir siglas o términos repetidos, usa **Buscar y reemplazar** encima de la tabla. Si no te convence el resultado, **Borrar traducción** deja el archivo cargado para probar con otro modelo.

El trabajo se guarda solo en el navegador. Si cierras la pestaña, al volver te ofrece recuperarlo. Con **Guardar proyecto** te llevas un `.json` para seguir en otro ordenador.

## Motores y modelos recomendados

| Motor | Modelos que propone | Clave |
|---|---|---|
| **Claude** (directo) | Sonnet 5.5 (recomendado), Haiku 5.5 (baratísimo), Opus 5.5 (máxima calidad) | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **OpenRouter** | Lo último de cada familia: Gemini Flash, Gemini, Claude, GPT, DeepSeek y Qwen. La lista se actualiza sola | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **OpenAI** | Los tres GPT más recientes de tu cuenta | [platform.openai.com](https://platform.openai.com/api-keys) |
| **LM Studio** | Los modelos que tengas descargados (destaca Qwen y Gemma) | No hace falta |

Con **Ver todos los modelos** aparecen todos los demás.

**Sobre la temperatura (fidelidad):** viene en 0,5 por defecto. Los modelos de Claude (desde Opus 4.7) y los GPT‑6 ya no dejan cambiarla: en ellos el control se desactiva y la fidelidad depende de las instrucciones, que piden ceñirse al original.

## Cómo traduce (y por qué es mejor que la versión 1)

- **Lotes de verdad:** envía 40 subtítulos por petición (se puede cambiar) y hace hasta 3 peticiones a la vez. Una película de 1.500 líneas son unas 40 peticiones, no 1.500.
- **El guion completo como contexto:** el modelo ve todo el vídeo y no solo un trozo. Así mantiene los nombres, el tono y el sentido de las frases que pasan de un subtítulo a otro. Esa parte se guarda en la caché del proveedor, así que solo se paga entera la primera vez. Cada lote lleva además las últimas líneas ya traducidas, para que todo sea coherente.
- **Respuesta en JSON con un número por subtítulo:** no se descoloca ni se pierde ninguna línea. Si faltan algunas, se piden otra vez solo esas. Si aun así fallan, quedan marcadas en rojo y no se dan por hechas.
- **Se conservan los saltos de línea** y el modelo respeta unos 42 caracteres por línea (16 en chino, japonés y coreano).
- **Etiquetas de hablante:** si el archivo trae `Speaker 1:`, `[Hablante 2]`, `>>`, una línea con el nombre o `<v Nombre>` (VTT), la app las detecta y las quita antes de traducir. También puedes descargar el **original limpio**.
- **Errores visibles:** si el proveedor limita las peticiones (error 429), espera y reintenta solo, con un aviso en pantalla y sin ventanas que bloqueen la página.

## LM Studio (modelos locales, gratis)

1. En LM Studio, abre la pestaña **Developer**, carga un modelo y arranca el servidor.
2. En los ajustes del servidor, activa **Enable CORS**.
3. En la app, elige el motor **LM Studio** y pulsa ↻.

Para traducir, los modelos Qwen (por ejemplo, Qwen 3.5 27B si tu equipo lo mueve) y Gemma suelen dar buenos resultados. Con modelos pequeños, mejor lotes de 20.

## Usarla en local en el Mac

Haz doble clic en `Iniciar.command`. Arranca un pequeño servidor en `http://localhost:8765` y abre el navegador. La primera vez macOS puede pedirte permiso: clic derecho → Abrir.

También funciona abriendo `index.html` directamente.

## Versión web

La app está publicada con GitHub Pages en **https://davidarribas.github.io/traductor-de-subtitulos/** y se actualiza sola cada vez que se suben cambios a la rama `master`. Cada persona usa su propia clave, que se guarda en su navegador; las claves y los subtítulos van directamente del navegador al proveedor elegido.

## Privacidad

- Las claves se guardan en el `localStorage` del navegador. Si desmarcas «Recordar», duran solo hasta cerrar la pestaña.
- No hay analítica ni servidor intermedio.

## Créditos

Basado en [Subtitle Translator for LM Studio](https://github.com/TTomas65/Subtitle-Translator-for-LM-Studio) de TTomas65 (licencia MIT). La versión original está en la carpeta `v1-antigua/`.

## Versiones

### 2.0 (noviembre de 2026)
- Reescrita desde cero: unas 1.500 líneas en lugar de unas 4.900, interfaz en español.
- Nuevo motor común a todos los proveedores: lotes en JSON, reintento de las líneas que falten, contexto completo con caché y peticiones en paralelo.
- Claude directo (Haiku, Sonnet y Opus 5.5) y listas de modelos recomendados que se actualizan solas.
- Detecta el idioma, propone el destino y trae la temperatura en 0,5.
- Quita las etiquetas de hablante. Conserva los saltos de línea. Lee y exporta .vtt, y exporta un .srt bilingüe.
- Autoguardado, avisos en pantalla y coste estimado antes y durante la traducción.
- Bienvenida para la primera visita, ayuda integrada, buscar y reemplazar (con deshacer), botones para borrar la traducción o empezar de cero.
- Diseño adaptado a móvil, modo oscuro automático, contraste AA y uso con teclado.
- Lee los archivos `.wrk` de la versión 1.
