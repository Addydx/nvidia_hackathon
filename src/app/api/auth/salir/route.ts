import { cookies } from "next/headers";
import { adminClient, clearSessionCookies } from "@/lib/auth";
import { errorResponse } from "@/lib/caja";

export async function POST() {
  try {
    const access = (await cookies()).get("cc-at")?.value;
    // Revoca el refresh token en Auth (cierra la sesión también en el servidor); si falla, igual se borran las cookies.
    if (access) await adminClient().auth.admin.signOut(access, "local").catch(() => undefined);
    await clearSessionCookies();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
