# SmallTV cover server

VersiÃ³n mÃ­nima de [YouTubeMusicLiveSVG](https://github.com/edgarburgues/YouTubeMusicLiveSVG), con su historial y licencia GPL-3.0 conservados. Solo obtiene la carÃ¡tula de la Ãºltima entrada del historial de YouTube Music y la entrega al [firmware ESP8266](https://github.com/edgarburgues/smalltv-mod/tree/cover-only).

## Arranque

Instala Bun y ejecuta `bun install --frozen-lockfile`. Crea un archivo local `.env`:

```dotenv
BROWSER_JSON='{"cookie":"TU_COOKIE_DE_YOUTUBE_MUSIC"}'
PORT=3000
```

Utiliza el mismo BROWSER_JSON que ya funciona en la app original. Debe contener la cookie __Secure-3PAPISID. No lo subas a GitHub. Bun carga .env automÃ¡ticamente.

Ejecuta `bun start` o `docker compose up -d --build`. El servidor debe permanecer encendido y accesible desde el Wi-Fi del SmallTV. Configura en el dispositivo:

```text
http://IP_DEL_SERVIDOR:3000/api/cover.rgb565
```

Permite TCP 3000 en el cortafuegos de tu red local si es necesario. localhost en el dispositivo no apunta al ordenador.

## Contrato de imagen

- GET /api/cover.rgb565: 240 Ã— 240, RGB565 little-endian, filas de arriba a abajo, sin cabecera binaria, exactamente 115200 bytes.
- Content-Type: application/octet-stream; Content-Length: 115200.
- X-Cover-Format: rgb565le-240x240-v1.
- ETag identifica el contenido. If-None-Match devuelve 304 sin cuerpo si no cambia.
- La imagen se recorta centrada para llenar el cuadrado, sin deformarla.
- Consulta del historial como mÃ¡ximo cada 10 segundos, compartida entre peticiones concurrentes.
- Fallos temporales conservan la Ãºltima carÃ¡tula; X-Cover-Stale indica true. Sin una imagen vÃ¡lida devuelve 503.
- GET /health informa ready/stale. No solicita datos de YouTube.

La consulta usa el historial: no detecta pausa, progreso ni garantiza reproducciÃ³n en tiempo real. Las credenciales permanecen en el servidor. Este servicio HTTP estÃ¡ pensado para una LAN de confianza.

## Pruebas

`bun run typecheck` y `bun test`.

Para probar el circuito sin credenciales: establece COVER_FILE con la ruta de un PNG/JPEG local y ejecuta bun start. El archivo se vuelve a leer en cada actualizaciÃ³n, Ãºtil para probar cambios de carÃ¡tula.
