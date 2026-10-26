// Catálogo Briggs — configuración pública. Nada de lo que hay aquí es secreto:
// este archivo lo descarga cualquier visitante. NO importar js/sheets-config.js
// (contiene el token interno de la app).
export const CONFIG = {
  // WhatsApp del asesor en formato internacional, sin "+" (04120298203 → 58412…).
  ADVISOR_WHATSAPP: '584120298203',
  STORE_NAME: 'BRIGGS',
  // URL /exec del Apps Script con las rutas públicas (?public=catalog, publicOrder).
  // Vacía mientras la tienda trabaja con datos de prueba (fase A).
  API_URL: '',
  // Validez de un pedido web, en días (igual que los presupuestos de la app).
  QUOTE_VALID_DAYS: 15,
  // Horario de las reuniones de Meet (fase A: simulado en el navegador).
  MEET: { days: 14, startHour: 9, endHour: 17, minutes: 30, skipWeekdays: [0] }
};
