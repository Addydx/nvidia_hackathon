import { connection } from "next/server";
import { getUser } from "@/lib/auth";
import { errorResponse } from "@/lib/caja";

export async function GET() {
  await connection();
  try {
    const user = await getUser();
    return Response.json({ user: user ? { email: user.email } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
