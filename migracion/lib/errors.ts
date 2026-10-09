/** Supabase rechazó los datos de una cuenta (por ejemplo, un correo con formato inválido). No es un fallo de conexión. */
export class AccountRejected extends Error {
  constructor(detail: string) {
    super(`Cuenta rechazada ${detail}`);
    this.name = "AccountRejected";
  }
}
