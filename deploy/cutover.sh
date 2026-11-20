#!/usr/bin/env bash
# Ventana de cambio: aplica la migración de cuentas y actualiza Next.js en el MISMO paso.
# Uso (desde el Mac, en la raíz del repo):
#     deploy/cutover.sh sha-<commit> [archivo-sql-ya-aplicado]
#
# Orden pensado para minimizar el corte (la migración reemplaza funciones que usa la versión anterior):
#   1. Comprobaciones previas: Secret con SUPABASE_ANON_KEY, imagen nueva ya en el nodo.
#   2. (fuera de este script) aplicar 20261122000000_cuentas.sql  <- empieza la ventana
#   3. Este script: actualiza la imagen y espera el rollout     <- termina la ventana (~20 s con la imagen en caché)
#   4. Pruebas de humo contra el dominio.
# Si algo falla: deploy/rollback.sh (ver README).
set -euo pipefail
WEB_TAG=${1:?uso: deploy/cutover.sh sha-<commit>}
K='KUBECONFIG=~/.kube/hackathon.kubeconfig k3s kubectl -n hackathon'
HOST=${HOST:-https://nvidia.addydx.com}

echo "[1/4] Comprobaciones previas"
ssh server-home "$K get secret hackathon-env -o jsonpath='{.data.SUPABASE_ANON_KEY}'" 2>/dev/null | grep -q . \
  || { echo "Falta SUPABASE_ANON_KEY en el Secret (bash ~/hackathon/set-anon-key.sh en server-home)." >&2; exit 1; }
prev=$(ssh server-home "$K get deploy web -o jsonpath='{.spec.template.spec.containers[0].image}'" 2>/dev/null)
echo "      imagen actual: $prev  ->  nueva: ghcr.io/addydx/nvidia-hackathon-web:$WEB_TAG"
echo "$prev" > .cutover-previous-image

echo "[3/4] Actualizando Next.js (la migración debe estar aplicada ya)"
ssh server-home "$K set image deploy/web web=ghcr.io/addydx/nvidia-hackathon-web:$WEB_TAG && $K set env deploy/web APP_URL=$HOST" 2>&1 | grep -v level=warning
ssh server-home "$K rollout status deploy/web --timeout=180s" 2>&1 | grep -v level=warning

echo "[4/4] Pruebas de humo"
for p in /acceso /registro /recuperar; do curl -s -m25 -o /dev/null -w "      $p -> %{http_code}\n" "$HOST$p"; done
curl -s -m25 -w "      GET /api/caja sin sesión -> %{http_code}\n" -o /dev/null "$HOST/api/caja"
echo "Listo. Imagen anterior guardada en .cutover-previous-image (para rollback)."
