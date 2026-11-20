# Despliegue en server-home (K3s)

Namespace exclusivo: `hackathon`. No toca `alepay` ni `addydx`.

```
Cloudflare Access ──► Cloudflare Tunnel ──► Traefik ──► web (Next.js :3000) ──► vision (FastAPI :8000)
                                                              └──► Supabase del hackathon
```

Solo `web` tiene Ingress. `vision` es un Service interno y una NetworkPolicy solo deja entrar a los pods `web`.

- Imágenes (GHCR, `linux/amd64`): `ghcr.io/addydx/nvidia-hackathon-web` y `ghcr.io/addydx/nvidia-hackathon-vision`, etiquetadas `sha-<commit completo>`.
  Las publica `.github/workflows/images.yml` en cada push a `main` (o a mano con *Run workflow*).
- Pesos del modelo: **no** van en Git ni en la imagen. Viven en `server-home:~/hackathon/models/` y se montan en solo lectura en `/models` del pod `vision`.
- Claves: Secret `hackathon-env` (Supabase) y Secret `ghcr-pull`. Nunca en Git.

## 1. Preparación (una vez, requiere admin de K3s)

```bash
# en server-home, con un usuario que haga sudo
sudo bash ~/hackathon/admin-setup.sh
```

Crea el namespace, un ServiceAccount con un Role limitado a `hackathon`, `~/.kube/hackathon.kubeconfig`
(solo vale en ese namespace) y, si pegas un token clásico de GitHub con **solo `read:packages`**, el Secret
`ghcr-pull`. El token se escribe en el prompt oculto del servidor; no pasa por el chat ni por Git.

Con ese kubeconfig se opera sin sudo: `KUBECONFIG=~/.kube/hackathon.kubeconfig k3s kubectl -n hackathon get pods`.

El Secret `hackathon-env` (Supabase) se crea con `deploy/create-secrets.sh` o directamente desde el Mac por SSH
leyendo `.env.local`, sin imprimir los valores.

## 1b. Cuentas por correo (Supabase Auth) — antes de desplegar esta versión

La app exige sesión. Hay que preparar el proyecto de Supabase del hackathon **antes** de actualizar el despliegue; si no,
la versión nueva no puede leer las cajas ni iniciar sesión.

1. **Migraciones**, en orden (SQL Editor de Supabase, o `supabase db push`), si aún no están aplicadas:
   `20261119000000_caja.sql`, `20261120000000_cierre.sql`, `20261121000000_eliminar_caja.sql` y **`20261122000000_cuentas.sql`**
   (añade `cash_sessions.user_id`, una caja abierta por usuario y funciones que reciben el usuario) y, a continuación, **`20261123000000_perfiles_y_memoria.sql`**
   (tabla `assistant_messages` con la memoria del asistente por cuenta y políticas RLS: cada cuenta solo ve y escribe lo suyo) y, por último,
   **`20261124000000_conteos.sql`** (guardar un conteo sin abrir caja: efectivo esperado opcional y las funciones `save_count` y
   `set_count_expected`; conserva todos los registros existentes). Sin esta migración los invitados funcionan igual, pero guardar en
   una cuenta responde «falta una migración en la base».
   Las cajas anteriores quedan sin dueño (`user_id` nulo) y ningún usuario las ve; el SQL para asignarlas está al final de la migración.
2. **Clave pública:** Project Settings → API → *anon / publishable key*. Se añade al Secret como `SUPABASE_ANON_KEY`
   (`deploy/create-secrets.sh` la pide en un prompt oculto). No es la service role.
3. **Auth → URL Configuration:** *Site URL* `https://nvidia.addydx.com` y en *Redirect URLs* `https://nvidia.addydx.com/**`.
   Sin esto los enlaces de los correos no redirigen a la app.
4. **Auth → Providers → Email** activo. Recomendado: *Confirm email* activado (la app lo soporta y muestra el aviso).
5. **Correo saliente:** el SMTP integrado de Supabase solo envía a miembros del equipo y con un límite muy bajo. Para que lleguen
   correos a cualquier persona, configura un SMTP propio en Auth → SMTP Settings (Resend, Postmark, etc.).
6. Solo entonces, desplegar (paso 2). `APP_URL` ya viene en el manifiesto.

### Perfiles: invitado y cuenta

- **Invitado** (sin sesión): Caja, Cierre y el asistente funcionan en el navegador; sus datos y la memoria del asistente viven en
  `sessionStorage` de la pestaña (sobreviven a una recarga; no se comparten con otras pestañas, navegadores ni dispositivos). El
  servidor no guarda nada de invitados. Solo el análisis de fotos y las preguntas del asistente pasan por el servidor, con límite por IP.
- **Cuenta**: cajas, ventas, cierres y memoria del asistente se guardan en Supabase, ligados a su `user_id`. Al iniciar o cerrar
  sesión se recarga y solo se muestran los datos del perfil activo; nunca se importan ni se mezclan.

## 2. Desplegar

```bash
export WEB_TAG=sha-<commit completo publicado por el workflow>
export VISION_TAG=sha-<commit completo>      # solo cambia si cambió vision/
export KUBECONFIG=~/.kube/hackathon.kubeconfig
envsubst '$WEB_TAG $VISION_TAG' < deploy/k8s/hackathon.yaml | k3s kubectl apply -f -
k3s kubectl -n hackathon rollout status deploy/vision deploy/web
```

Comprobar el modelo (desde cualquier pod del namespace):

```bash
k3s kubectl -n hackathon exec deploy/web -- node -e \
  "fetch('http://vision:8000/salud').then(r=>r.text()).then(console.log)"   # modelo_cargado: true
```

### Ventana de cambio con migración (versiones que reemplazan funciones SQL)

`20261122000000_cuentas.sql` reemplaza funciones que usa la versión anterior de la app, así que migración y despliegue
se hacen juntos. Con la imagen ya en el nodo, la ventana dura unos 20 segundos.

```bash
# 0. Con antelación (no cambia nada en producción):
deploy/prepull.sh sha-<commit>                  # descarga la imagen en el nodo
ssh server-home 'bash ~/hackathon/set-anon-key.sh'   # clave anon en el Secret (prompt oculto)
# 1. Ventana: aplicar la migración (SQL Editor de Supabase / Codex)  ->  inmediatamente:
deploy/cutover.sh sha-<commit>                  # actualiza Next.js, espera el rollout, pruebas de humo
```

**Recuperación** (compatible con el esquema nuevo; no borra datos): ejecutar
`supabase/rollback/20261122000000_cuentas_down.sql` (restaura las funciones y el índice anteriores; exige una sola caja
abierta en toda la base) y después `deploy/rollback.sh`, que devuelve la imagen guardada en `.cutover-previous-image`.
Orden: primero el SQL, luego la imagen, para que la versión vieja no arranque contra funciones inexistentes.
Se puede volver a migrar después sin pérdida.

## 3. Publicar por HTTPS con Cloudflare (orden importante)

1. **Primero Cloudflare Access.** Zero Trust → Access → Applications → *Self-hosted*: dominio `nvidia.addydx.com`,
   política **Allow** con los correos del equipo y de los evaluadores autorizados (lista cerrada; sin "everyone").
2. **Después el túnel.** Zero Trust → Networks → Tunnels → *Public hostname*: `nvidia.addydx.com` → servicio HTTP
   hacia Traefik (`http://traefik.kube-system.svc.cluster.local:80` si `cloudflared` corre en el clúster,
   o `http://localhost:80` si corre en el host). Traefik enruta por `Host`, el Ingress ya usa ese host.
3. Verificar: sin sesión, `https://nvidia.addydx.com/cierre` redirige al login de Access; con un correo
   autorizado abre Cierre.

> No publiques el hostname antes de que exista la aplicación de Access: la demo no tiene login propio.

## Actualizar el código

1. `git push origin main` → el workflow publica `sha-<commit>`.
2. Repetir el paso 2 con el nuevo `WEB_TAG`. Next.js se actualiza sin corte (`maxUnavailable: 0`).

## Cambiar la versión del ONNX

El pod lee `/models/monedad.onnx`, que en el servidor es un enlace simbólico a un archivo versionado.

```bash
scp vision/models/monedad.onnx server-home:hackathon/models/monedad-v2.onnx
ssh server-home 'cd ~/hackathon/models && sha256sum monedad-v2.onnx && ln -sfn monedad-v2.onnx monedad.onnx'
k3s kubectl -n hackathon rollout restart deploy/vision
# verificar: /salud debe devolver modelo_cargado: true (si no, el motivo está en "error")
```

El modelo debe detectar exactamente las clases `peso1`, `peso2`, `peso5` y `peso10`.

## Volver a la versión anterior

- **ONNX:** `ln -sfn monedad-v1.onnx monedad.onnx` (en `~/hackathon/models`) y `rollout restart deploy/vision`.
- **Código:** `k3s kubectl -n hackathon rollout undo deploy/web` (o `deploy/vision`), o aplicar de nuevo
  el manifiesto con el `WEB_TAG` anterior.

## Versión inicial del modelo

`monedad-v1.onnx`, sha256 `e02d159924b1160e39420efbe8c456ffc3e1b8c484772d1b4a860d55f504fe91`.

## Pendiente (después de validar la demo)

- Vincular el despliegue a Fleet y automatizar el `kubectl apply` desde `main`.
