export const metadata = { title: "Gracias · Pago recibido" };

/** Pública: la ve el cliente tras pagar en Stripe. No confirma nada; la confirmación llega al vendedor por el servidor. */
export default function Gracias() {
  return (
    <main className="screen">
      <h1>Gracias</h1>
      <p className="muted">Stripe recibió tu pago. El vendedor verá la confirmación en su pantalla en unos segundos.</p>
    </main>
  );
}
