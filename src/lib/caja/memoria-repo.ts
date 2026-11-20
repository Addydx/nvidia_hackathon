import { userClient } from "../auth";
import type { MemoryItem } from "../asistente-memoria";

type Row = { id: string; question: string; answer: string; origin: "modelo" | "resumen"; amounts: string; created_at: string };
const toItem = (r: Row): MemoryItem => ({ id: r.id, question: r.question, answer: r.answer, origin: r.origin, amounts: r.amounts, createdAt: r.created_at });
const COLS = "id, question, answer, origin, amounts, created_at";

/**
 * Memoria del asistente de una CUENTA, en Supabase. Usa un cliente que actúa como el usuario (su access token):
 * las políticas RLS de assistant_messages (user_id = auth.uid()) se aplican en la base además del filtro del servidor.
 */
export async function listMemory(token: string, closingId: string): Promise<MemoryItem[]> {
  const { data, error } = await userClient(token)
    .from("assistant_messages")
    .select(COLS)
    .eq("closing_id", closingId)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => toItem(r as Row));
}

export async function addMemory(
  token: string,
  userId: string,
  closingId: string,
  item: { question: string; answer: string; origin: "modelo" | "resumen"; amounts: string },
): Promise<MemoryItem> {
  const { data, error } = await userClient(token)
    .from("assistant_messages")
    .insert({ user_id: userId, closing_id: closingId, ...item })
    .select(COLS)
    .single();
  if (error) throw error;
  return toItem(data as Row);
}
