#!/usr/bin/env bash
# Vuelve a la versión anterior de Next.js Y del esquema de la base (ver supabase/rollback/).
# Uso (desde el Mac):  deploy/rollback.sh [imagen-anterior]    (por defecto, .cutover-previous-image)
#   1. Ejecuta primero supabase/rollback/20261122000000_cuentas_down.sql en el SQL Editor de Supabase
#      (o pídeselo a Codex): restaura las funciones y el índice de la versión anterior.
#   2. Luego este script devuelve la imagen. Hacerlo en este orden evita que la versión vieja
#      arranque contra funciones que no existen.
set -euo pipefail
IMG=${1:-$(cat "$(dirname "$0")/../.cutover-previous-image")}
K='KUBECONFIG=~/.kube/hackathon.kubeconfig k3s kubectl -n hackathon'
echo "Volviendo a $IMG"
ssh server-home "$K set image deploy/web web=$IMG" 2>&1 | grep -v level=warning
ssh server-home "$K rollout status deploy/web --timeout=180s" 2>&1 | grep -v level=warning
curl -s -m25 -o /dev/null -w "/ -> %{http_code}\n" "${HOST:-https://nvidia.addydx.com}/"
