#!/usr/bin/env bash
# Uso (desde el Mac):  deploy/prepull.sh sha-<commit>
# Descarga la imagen web en server-home y confirma que el pod termina bien. No cambia el despliegue.
set -euo pipefail
WEB_TAG=${1:?uso: deploy/prepull.sh sha-<commit>}; export WEB_TAG
K='KUBECONFIG=~/.kube/hackathon.kubeconfig k3s kubectl -n hackathon'
ssh server-home "$K delete pod prepull-web --ignore-not-found" 2>/dev/null | grep -v level=warning || true
envsubst '$WEB_TAG' < "$(dirname "$0")/k8s/prepull.yaml" | ssh server-home "KUBECONFIG=~/.kube/hackathon.kubeconfig k3s kubectl apply -f -" 2>&1 | grep -v level=warning
for _ in $(seq 1 60); do
  phase=$(ssh server-home "$K get pod prepull-web -o jsonpath='{.status.phase}'" 2>/dev/null || true)
  [ "$phase" = Succeeded ] && break
  [ "$phase" = Failed ] && { ssh server-home "$K describe pod prepull-web" 2>&1 | tail -15; exit 1; }
  sleep 3
done
echo "imagen $WEB_TAG en el nodo: fase $phase"
ssh server-home "$K delete pod prepull-web --ignore-not-found" 2>&1 | grep -v level=warning || true
[ "$phase" = Succeeded ]
