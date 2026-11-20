/**
 * Recuperación de contraseña por correo. Desactivada mientras no haya SMTP configurado en Supabase Auth:
 * sin él los correos no llegan y el flujo solo confundiría. Para reactivarla: poner `true` aquí (oculta/muestra
 * el enlace del login y la ruta /recuperar) y configurar SMTP y las URL de retorno (ver deploy/README.md).
 */
export const RECOVERY_ENABLED = false;
