import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse, getDeps } from "@/lib/cobros";
import { canCharge, createCharge, getConnectStatus, listCharges } from "@/lib/cobros/service";
import { stripeConfigured, stripeMode } from "@/lib/cobros/stripe";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireUser();
    const d = getDeps(request);
    const [payments, connect, can] = await Promise.all([listCharges(d, user.id), getConnectStatus(d, user.id), canCharge(d, user)]);
    return Response.json(
      { payments, config: { configured: stripeConfigured(), mode: stripeMode(), connect, authorized: can.allowed, reason: can.reason } },
      { headers: NO_STORE },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const { payment, duplicate } = await createCharge(getDeps(request), user, body ?? {});
    return Response.json({ payment, duplicate }, { status: duplicate ? 200 : 201, headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
