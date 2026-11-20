#!/usr/bin/env bash
# Habilita el namespace "hackathon" en K3s con permisos mínimos para el despliegue.
# Ejecutar UNA VEZ en server-home, con un usuario que pueda hacer sudo:
#     sudo bash ~/hackathon/admin-setup.sh
#
# Hace solo esto (no toca "alepay", "addydx" ni ningún otro namespace):
#   1. Crea el namespace "hackathon".
#   2. Crea el ServiceAccount "deployer" con un Role LIMITADO a ese namespace
#      (deployments, services, ingresses, networkpolicies, pods, secrets, configmaps).
#   3. Escribe /home/addyx/.kube/hackathon.kubeconfig (modo 600, dueño addyx) con el token
#      de ese ServiceAccount: solo sirve dentro del namespace "hackathon".
#   4. Pide por teclado (sin eco) un token de GitHub con permiso read:packages y crea
#      el Secret "ghcr-pull" para descargar las imágenes privadas. Enter vacío = omitir.
set -euo pipefail

NS=hackathon
OWNER=addyx
OWNER_HOME=$(getent passwd "$OWNER" | cut -d: -f6)
K="k3s kubectl"

$K create namespace "$NS" --dry-run=client -o yaml | $K apply -f -

$K apply -f - <<YAML
apiVersion: v1
kind: ServiceAccount
metadata: { name: deployer, namespace: $NS }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { name: deployer, namespace: $NS }
rules:
  - apiGroups: [""]
    resources: [services, pods, pods/log, pods/exec, secrets, configmaps, events]
    verbs: [get, list, watch, create, update, patch, delete]
  - apiGroups: [apps]
    resources: [deployments, replicasets]
    verbs: [get, list, watch, create, update, patch, delete]
  - apiGroups: [networking.k8s.io]
    resources: [ingresses, networkpolicies]
    verbs: [get, list, watch, create, update, patch, delete]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: deployer, namespace: $NS }
subjects: [{ kind: ServiceAccount, name: deployer, namespace: $NS }]
roleRef: { apiGroup: rbac.authorization.k8s.io, kind: Role, name: deployer }
---
apiVersion: v1
kind: Secret
metadata:
  name: deployer-token
  namespace: $NS
  annotations: { kubernetes.io/service-account.name: deployer }
type: kubernetes.io/service-account-token
YAML

# Espera a que K3s rellene el token.
for _ in $(seq 1 30); do
  TOKEN=$($K -n "$NS" get secret deployer-token -o jsonpath='{.data.token}' 2>/dev/null | base64 -d || true)
  [ -n "${TOKEN:-}" ] && break
  sleep 1
done
[ -n "${TOKEN:-}" ] || { echo "No se generó el token del ServiceAccount" >&2; exit 1; }
CA=$($K -n "$NS" get secret deployer-token -o jsonpath='{.data.ca\.crt}')

install -d -m 700 -o "$OWNER" -g "$OWNER" "$OWNER_HOME/.kube"
OUT="$OWNER_HOME/.kube/hackathon.kubeconfig"
umask 077
cat > "$OUT" <<KUBE
apiVersion: v1
kind: Config
clusters:
  - name: k3s
    cluster:
      server: https://127.0.0.1:6443
      certificate-authority-data: $CA
users:
  - name: hackathon-deployer
    user:
      token: $TOKEN
contexts:
  - name: hackathon
    context: { cluster: k3s, user: hackathon-deployer, namespace: $NS }
current-context: hackathon
KUBE
chown "$OWNER:$OWNER" "$OUT"
chmod 600 "$OUT"
echo "kubeconfig limitado a '$NS': $OUT"

read -r -s -p "Token de GitHub con read:packages para GHCR (Enter para omitir): " GH_TOKEN; echo
if [ -n "$GH_TOKEN" ]; then
  read -r -p "Usuario de GitHub [Addydx]: " GH_USER; GH_USER=${GH_USER:-Addydx}
  $K -n "$NS" create secret docker-registry ghcr-pull \
    --docker-server=ghcr.io --docker-username="$GH_USER" --docker-password="$GH_TOKEN" \
    --dry-run=client -o yaml | $K apply -f -
  unset GH_TOKEN
fi
echo "Listo."
