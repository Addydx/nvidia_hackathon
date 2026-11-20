#!/usr/bin/env bash
# Añade SUPABASE_ANON_KEY al Secret "hackathon-env" SIN pasar la clave por el chat ni por Git.
# Ejecutar EN server-home (usa el kubeconfig limitado al namespace hackathon):
#     bash ~/hackathon/set-anon-key.sh
# Pide la clave en un prompt oculto, comprueba que pertenece al proyecto de SUPABASE_URL y solo
# entonces la guarda. Los demás valores del Secret (URL y service role) no se tocan.
set -euo pipefail
export KUBECONFIG=${KUBECONFIG:-$HOME/.kube/hackathon.kubeconfig}
K="k3s kubectl -n hackathon"
URL=$($K get secret hackathon-env -o jsonpath='{.data.SUPABASE_URL}' | base64 -d)
echo "Proyecto: ${URL}"
read -r -s -p "SUPABASE_ANON_KEY / publishable key (no se muestra): " KEY; echo
[ -n "$KEY" ] || { echo "Clave vacía." >&2; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/auth/v1/settings" -H "apikey: $KEY")
[ "$code" = 200 ] || { echo "Supabase rechazó la clave (HTTP $code). ¿Es la anon/publishable key de ESTE proyecto?" >&2; exit 1; }
B64=$(printf '%s' "$KEY" | base64 | tr -d '\n')
$K patch secret hackathon-env --type merge -p "{\"data\":{\"SUPABASE_ANON_KEY\":\"$B64\"}}" >/dev/null
unset KEY B64
echo "Listo: SUPABASE_ANON_KEY guardada en hackathon-env (comprobada contra el proyecto)."
