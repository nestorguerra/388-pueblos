// Precios de los servicios para ayuntamientos (los importes viven en config.js). Los usan ayuntamientos.html y el dossier.
import { SERVICIOS, PROVEEDOR } from './config.js';

// (con punto de millar también en cifras de cuatro dígitos: «1.400 €», como en el resto de la propuesta)
const fmt0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' });
const fmt2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
export const euros = (n) => `${Number.isInteger(n) ? fmt0.format(n) : fmt2.format(n)} €`;
export const conIva = (n) => Math.round(n * (1 + SERVICIOS.iva) * 100) / 100;
export const habitantes = (n) => fmt0.format(n);

// tramo de «Modela mi pueblo» según habitantes
export function banda(pop) {
  return SERVICIOS.bandas.find((b) => (pop || 0) <= b.hasta) || SERVICIOS.bandas[SERVICIOS.bandas.length - 1];
}
export function bandaTexto(i) {
  const b = SERVICIOS.bandas, desde = i ? b[i - 1].hasta + 1 : 0;
  if (b[i].hasta === Infinity) return `Más de ${fmt0.format(b[i - 1].hasta)}`;
  return i ? `De ${fmt0.format(desde)} a ${fmt0.format(b[i].hasta)}` : `Hasta ${fmt0.format(b[i].hasta)}`;
}

// presupuesto de un municipio {p: habitantes}
export function presupuesto(m) {
  const modela = banda(m.p).precio;
  return {
    modela,
    panelAnio: SERVICIOS.panelAnio,
    panelMes: SERVICIOS.panelMes,
    modificacion: SERVICIOS.modificacion,
    primerAnio: modela + SERVICIOS.panelAnio,
  };
}

export function proveedorTexto() {
  const p = PROVEEDOR;
  if (!p.nombre) return 'Datos del proveedor: pendientes de completar';
  return [p.nombre, p.nif && `NIF ${p.nif}`, p.domicilio, p.email, p.telefono].filter(Boolean).join(' · ');
}
