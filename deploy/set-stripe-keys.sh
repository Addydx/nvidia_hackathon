#!/usr/bin/env bash
# Guarda las claves de Stripe en el Secret "hackathon-env" SIN pasarlas por el chat ni por Git.
# Ejecutar EN server-home (usa el kubeconfig limitado al namespace hackathon):
#     bash ~/hackathon/set-stripe-keys.sh
# Todo se pide en prompts ocultos. La clave se comprueba contra Stripe antes de guardarla y NUNCA se imprime.
# Opcionalmente crea el webhook en tu cuenta de Stripe y guarda su secreto directamente en el Secret
# (Stripe solo muestra ese secreto al crearlo). Los demás valores del Secret no se tocan.
#
# Clave restringida (rk_live_…) recomendada, con estos permisos: Checkout Sessions = Write.
#   Solo si dejas que el script cree el webhook: Webhook Endpoints = Write (puedes quitarlo después).
# Para probar con claves de prueba: STRIPE_ALLOW_TEST=1 bash set-stripe-keys.sh
set -euo pipefail
export KUBECONFIG=${KUBECONFIG:-$HOME/.kube/hackathon.kubeconfig}
K="k3s kubectl -n hackathon"
HOOK_URL=${HOOK_URL:-https://nvidia.addydx.com/api/stripe/webhook}
EVENTS=(checkout.session.completed checkout.session.async_payment_succeeded checkout.session.async_payment_failed checkout.session.expired)

read -r -s -p "Clave de Stripe (sk_live_… o rk_live_…; no se muestra): " SK; echo
[[ "$SK" =~ ^(sk|rk)_(test|live)_ ]] || { echo "No parece una clave secreta/restringida de Stripe." >&2; exit 1; }
if [[ "$SK" == *_test_* && "${STRIPE_ALLOW_TEST:-}" != 1 ]]; then
  echo "Es una clave de PRUEBA. Para producción usa sk_live_/rk_live_ (o STRIPE_ALLOW_TEST=1 para forzarla)." >&2; exit 1
fi
code=$(curl -s -o /dev/null -w '%{http_code}' 'https://api.stripe.com/v1/checkout/sessions?limit=1' -u "$SK:")
[ "$code" = 200 ] || { echo "Stripe rechazó la clave o le falta el permiso Checkout Sessions (HTTP $code)." >&2; exit 1; }
echo "Clave válida ($([[ "$SK" == *_live_* ]] && echo LIVE || echo prueba))."

read -r -p "Correo(s) autorizados a cobrar en tu cuenta, separados por coma (OBLIGATORIO): " OWNERS
[[ "$OWNERS" =~ ^[^[:space:],@]+@[^[:space:],@]+(,[^[:space:],@]+@[^[:space:],@]+)*$ ]] || { echo "Correo(s) no válidos." >&2; exit 1; }
OWNERS=$(printf '%s' "$OWNERS" | tr 'A-Z' 'a-z')

read -r -p "¿Crear el webhook $HOOK_URL en Stripe automáticamente? [S/n] " AUTO
if [[ "${AUTO:-S}" =~ ^[Nn] ]]; then
  read -r -s -p "STRIPE_WEBHOOK_SECRET (whsec_…; no se muestra): " WH; echo
else
  existing=$(curl -s 'https://api.stripe.com/v1/webhook_endpoints?limit=100' -u "$SK:" | python3 -c "import sys,json;d=json.load(sys.stdin);print(sum(1 for e in d.get('data',[]) if e.get('url')=='$HOOK_URL'), d.get('error',{}).get('message',''))")
  [ "${existing%% *}" = 0 ] || { echo "No se puede crear: ya existe un endpoint con esa URL o falta el permiso (${existing}). Bórralo en el Dashboard o responde n y pega su secreto." >&2; exit 1; }
  args=(-d "url=$HOOK_URL" -d "description=VendIA cobros")
  for e in "${EVENTS[@]}"; do args+=(-d "enabled_events[]=$e"); done
  WH=$(curl -s https://api.stripe.com/v1/webhook_endpoints -u "$SK:" "${args[@]}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('secret',''))")
  [ -n "$WH" ] || { echo "Stripe no devolvió el secreto del webhook (¿falta el permiso Webhook Endpoints = Write?)." >&2; exit 1; }
  echo "Webhook creado en Stripe."
fi
[[ "$WH" =~ ^whsec_ ]] || { echo "El secreto del webhook debe empezar por whsec_." >&2; exit 1; }

b64() { printf '%s' "$1" | base64 | tr -d '\n'; }
$K patch secret hackathon-env --type merge \
  -p "{\"data\":{\"STRIPE_SECRET_KEY\":\"$(b64 "$SK")\",\"STRIPE_WEBHOOK_SECRET\":\"$(b64 "$WH")\",\"STRIPE_OWNER_EMAILS\":\"$(b64 "$OWNERS")\"}}" >/dev/null
unset SK WH OWNERS
echo "Listo: claves guardadas en hackathon-env. Aplica con: $K rollout restart deploy/web"
