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

## 2. Desplegar

```bash
export TAG=sha-<commit completo publicado por el workflow>
export KUBECONFIG=~/.kube/hackathon.kubeconfig
envsubst '$TAG' < deploy/k8s/hackathon.yaml | k3s kubectl apply -f -
k3s kubectl -n hackathon rollout status deploy/vision deploy/web
```

Comprobar el modelo (desde cualquier pod del namespace):

```bash
k3s kubectl -n hackathon exec deploy/web -- node -e \
  "fetch('http://vision:8000/salud').then(r=>r.text()).then(console.log)"   # modelo_cargado: true
```

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
2. Repetir el paso 2 con el nuevo `TAG`. Next.js se actualiza sin corte (`maxUnavailable: 0`).

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
  el manifiesto con el `TAG` anterior.

## Versión inicial del modelo

`monedad-v1.onnx`, sha256 `e02d159924b1160e39420efbe8c456ffc3e1b8c484772d1b4a860d55f504fe91`.

## Pendiente (después de validar la demo)

- Vincular el despliegue a Fleet y automatizar el `kubectl apply` desde `main`.
