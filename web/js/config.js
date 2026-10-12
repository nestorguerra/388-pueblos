// Ajustes de despliegue de 388 Pueblos (lo único que hay que tocar al publicar).

// URL de la app web de Google Apps Script que guarda la lista de espera y los votos en una hoja de cálculo
// (el código está en tools/sheets/Codigo.gs y los pasos, en el README). Vacía: se usa el servidor propio.
export const SHEETS_URL = '';

// Correo de contacto para privacidad y para ejercer derechos sobre los datos (se muestra en privacidad.html).
export const CONTACTO = '';

// Invitación al servidor de Discord de la comunidad (https://discord.gg/…). Vacía: el botón dice «muy pronto».
export const DISCORD_URL = '';

// Perfiles de 388 Pueblos en redes sociales (iconos del pie de la web, junto al de Discord). Vacíos: «muy pronto».
export const TIKTOK_URL = ''; // https://www.tiktok.com/@…
export const INSTAGRAM_URL = ''; // https://www.instagram.com/…/

// Vecinos apuntados que hacen falta para que un pueblo «despierte» (se modele al detalle y se abra al juego).
export const META_DESPERTAR = 100;

// Quien presta el servicio a los ayuntamientos (aparece en el dossier y en la página de ayuntamientos).
// Vacío: se muestra «pendiente».
export const PROVEEDOR = { nombre: '', nif: '', domicilio: '', email: '', telefono: '' };

// Servicios para ayuntamientos (importes sin IVA). Bandas de «Modela mi pueblo» por habitantes.
export const SERVICIOS = {
  bandas: [
    { hasta: 1000, precio: 500 },
    { hasta: 5000, precio: 900 },
    { hasta: 20000, precio: 1400 },
    { hasta: Infinity, precio: 2000 },
  ],
  modificacion: 300,
  panelMes: 25,
  panelAnio: 300,
  iva: 0.21,
};

// Repositorio público del proyecto.
export const REPO = 'https://github.com/nestorguerra/388-pueblos';
