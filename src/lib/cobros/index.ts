import { appUrl } from "../auth";
import { HttpError } from "../caja/service";
import { createSupabaseCobrosRepo } from "./supabase-repo";
import { connectEnabled, getStripeApi, type StripeApi } from "./stripe";
import { parseOwnerEmails, type Deps } from "./service";

export { errorResponse } from "../caja";

/** El cliente de Stripe se crea al usarse: listar cobros o ver el estado no exige tener la clave configurada. */
const lazyStripe = (): StripeApi => ({
  createSession: (p, o) => getStripeApi().createSession(p, o),
  retrieveSession: (id, a) => getStripeApi().retrieveSession(id, a),
  createAccount: (u) => getStripeApi().createAccount(u),
  retrieveAccount: (id) => getStripeApi().retrieveAccount(id),
  createAccountLink: (a, u) => getStripeApi().createAccountLink(a, u),
});

export function getDeps(request: Request): Deps {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, "Supabase no está configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  return {
    repo: createSupabaseCobrosRepo(url, key),
    stripe: lazyStripe(),
    baseUrl: appUrl(request),
    connectEnabled: connectEnabled(),
    ownerEmails: parseOwnerEmails(process.env.STRIPE_OWNER_EMAILS),
  };
}
