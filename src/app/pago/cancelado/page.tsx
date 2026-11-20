export const metadata = { title: "Pago cancelado" };

export default function Cancelado() {
  return (
    <main className="screen">
      <h1>Pago cancelado</h1>
      <p className="muted">No se hizo ningún cargo. Para pagar, vuelve a escanear el código QR del vendedor.</p>
    </main>
  );
}
