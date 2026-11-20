#!/usr/bin/env bash
# Crea los Secrets del namespace "hackathon" pidiendo los valores por teclado (sin eco),
# para que las claves no queden en Git ni en el historial del shell.
# Ejecutar EN server-home con acceso a K3s:  sudo bash deploy/create-secrets.sh
set -euo pipefail
K="k3s kubectl -n hackathon"
k3s kubectl get ns hackathon >/dev/null 2>&1 || k3s kubectl create namespace hackathon

read -r -p "SUPABASE_URL del hackathon: " SUPABASE_URL
read -r -s -p "SUPABASE_SERVICE_ROLE_KEY (no se muestra): " SUPABASE_SERVICE_ROLE_KEY; echo
read -r -s -p "SUPABASE_ANON_KEY / publishable key (no se muestra): " SUPABASE_ANON_KEY; echo
$K create secret generic hackathon-env \
  --from-literal=SUPABASE_URL="$SUPABASE_URL" \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  --from-literal=SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  --dry-run=client -o yaml | $K apply -f -

read -r -p "Usuario de GitHub para GHCR [Addydx]: " GH_USER; GH_USER=${GH_USER:-Addydx}
read -r -s -p "Token de GitHub con read:packages (no se muestra): " GH_TOKEN; echo
$K create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io --docker-username="$GH_USER" --docker-password="$GH_TOKEN" \
  --dry-run=client -o yaml | $K apply -f -
echo "Listo: secrets hackathon-env y ghcr-pull en el namespace hackathon."
