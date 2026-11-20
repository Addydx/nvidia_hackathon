import { errorResponse, getDeps } from "@/lib/cobros";
import { handleWebhookEvent, type WebhookEvent } from "@/lib/cobros/service";
import { verifyWebhook } from "@/lib/cobros/stripe";

/**
 * Webhook de Stripe. Sin sesión de usuario: la autenticidad la da la FIRMA, verificada con el cuerpo crudo.
 * Responde 2xx solo si el evento quedó procesado (o ya lo estaba); si falla, Stripe reintenta.
 */
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    const event = verifyWebhook(raw, request.headers.get("stripe-signature"));
    const result = await handleWebhookEvent(getDeps(request), event as unknown as WebhookEvent);
    return Response.json({ received: true, result });
  } catch (e) {
    return errorResponse(e);
  }
}
