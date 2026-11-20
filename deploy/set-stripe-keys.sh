#!/usr/bin/env bash
# Guarda las claves de Stripe en el Secret "hackathon-env" SIN pasarlas por el chat ni por Git.
# Ejecutar EN server-home (usa el kubeconfig limitado al namespace hackathon):
#     bash ~/hackathon/set-stripe-keys.sh
# Todos los valores se piden en prompts ocultos. La clave secreta se comprueba contra Stripe antes de guardarla.
# Los demás valores del Secret no se tocan. Después: `k3s kubectl -n hackathon rollout restart deploy/web`.
set -euo pipefail
export KUBECONFIG=${KUBECONFIG:-$HOME/.kube/hackathon.kubeconfig}
K="k3s kubectl -n hackathon"

read -r -s -p "STRIPE_SECRET_KEY (sk_test_… o sk_live_…; no se muestra): " SK; echo
[[ "$SK" =~ ^(sk|rk)_(test|live)_ ]] || { echo "No parece una clave secreta de Stripe (sk_/rk_)." >&2; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' https://api.stripe.com/v1/balance -u "$SK:")
[ "$code" = 200 ] || { echo "Stripe rechazó la clave (HTTP $code)." >&2; exit 1; }

read -r -s -p "STRIPE_WEBHOOK_SECRET (whsec_…, del endpoint del webhook; no se muestra): " WH; echo
[[ "$WH" =~ ^whsec_ ]] || { echo "El secreto del webhook empieza por whsec_." >&2; exit 1; }
read -r -p "STRIPE_OWNER_EMAILS (opcional, correos separados por coma que cobran en tu cuenta; Enter = cualquier usuario): " OWNERS

patch="\"STRIPE_SECRET_KEY\":\"$(printf '%s' "$SK" | base64 | tr -d '\n')\",\"STRIPE_WEBHOOK_SECRET\":\"$(printf '%s' "$WH" | base64 | tr -d '\n')\""
[ -z "$OWNERS" ] || patch="$patch,\"STRIPE_OWNER_EMAILS\":\"$(printf '%s' "$OWNERS" | base64 | tr -d '\n')\""
$K patch secret hackathon-env --type merge -p "{\"data\":{$patch}}" >/dev/null
unset SK WH OWNERS patch
echo "Listo: claves de Stripe guardadas en hackathon-env. Reinicia web: $K rollout restart deploy/web"
