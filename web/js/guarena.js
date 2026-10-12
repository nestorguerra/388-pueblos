// Guareña, pueblo 001: datos dedicados (centrados en la Plaza de España) y contenido verificado.
import { LANDMARKS, GUARENA_CHURCHES } from './world.js';
import { createTownPage, townError } from './town-page.js';

const FIRST = {
  torre: { t: 'La torre de Santa María', p: 'La iglesia de Santa María se empezó en 1557 y se terminó hacia 1700. Su torre de cuatro cuerpos mide 32 metros y el templo es Bien de Interés Cultural desde 1990.', s: 'Ayuntamiento de Guareña · BOE' },
  'espadaña': { t: 'La espadaña de San Gregorio', p: 'San Gregorio fue ermita y es parroquia desde 1896. Tiene una espadaña barroca y un atrio de triple arcada que descansa sobre capiteles visigodos.', s: 'Ayuntamiento de Guareña' },
};
const FACTS = [
  { t: 'Juan de Herrera pasó por aquí', p: 'En las trazas de Santa María intervinieron Sancho Cabrera, Rodrigo Gil de Hontañón y, desde 1580, Juan de Herrera, el arquitecto de El Escorial.', s: 'CHDE Trujillo' },
  { t: 'El miajón de los castúos', p: 'Luis Chamizo (Guareña, 1894 – Madrid, 1945) escribió El miajón de los castúos en 1921, la obra fundacional de la poesía en castúo. Por eso Guareña se llama a sí misma tierra de castúos.', s: 'Ayuntamiento de Guareña' },
  { t: 'Los primeros rostros de Tarteso', p: 'En Casas del Turuñuelo, junto al río Búrdalo, se excava un edificio tartésico del siglo V a. C. En 2023 aparecieron allí las primeras representaciones humanas de Tarteso.', s: 'CSIC, abril de 2023' },
  { t: 'Un filósofo guareñense', p: 'Eugenio Frutos Cortés (Guareña, 1903–1979) fue catedrático de Filosofía en Zaragoza. Hoy da nombre al instituto y a la biblioteca del pueblo.', s: 'Biblioteca Virtual Cervantes' },
  { t: 'El Cristo de las Aguas', p: 'Las fiestas patronales se celebran del 11 al 14 de septiembre. El día grande es el 14, la Exaltación de la Cruz, con triduo en Santa María y procesión.', s: 'Agenda municipal 2026' },
  { t: 'Un meteorito con nombre de pueblo', p: 'En 1892 cayó en el término municipal un meteorito, una condrita que se conoce como «Guareña».', s: 'Wikipedia' },
  { t: 'Vecinas con alas', p: 'Extremadura tiene unas 8.578 parejas de cigüeña blanca (censo de 2025), la segunda comunidad de España. Muchas anidan en torres de iglesias como esta.', s: 'SEO/BirdLife, censo 2025' },
];
const PLACES = [
  { name: 'Plaza de España', tag: 'Ayuntamiento', p: 'El corazón del pueblo. El Palacio Municipal tiene fachada de granito, pórtico toscano y reloj. Desde aquí empezará la beta jugable.', s: 'Ayuntamiento de Guareña', x: LANDMARKS.plaza.x, y: LANDMARKS.plaza.y, h: 10, d: 210 },
  { name: 'Iglesia de Santa María', tag: 'BIC · 1557', p: 'Renacentista con elementos góticos y platerescos, bóvedas de crucería y solería de mármol blanco y negro. Su torre de 32 metros se ve desde toda la vega.', s: 'Ayuntamiento de Guareña · BOE', x: -136, y: 92, h: 18, d: 170 },
  { name: 'Iglesia de San Gregorio', tag: 'Siglo XVIII', p: 'Antigua ermita convertida en parroquia en 1896, con espadaña barroca y atrio sobre capiteles visigodos, junto a la plaza de abastos.', s: 'Ayuntamiento de Guareña', x: LANDMARKS.sangregorio.x, y: LANDMARKS.sangregorio.y, h: 8, d: 160 },
  { name: 'Casa natal de Luis Chamizo', tag: 'Poeta del castúo', p: 'Casa privada con placa conmemorativa. En 2021, por el centenario de El miajón de los castúos, se levantó la escultura «Yo vi escribir La Nacencia».', s: 'Ayuntamiento de Guareña', x: LANDMARKS.chamizo.x, y: LANDMARKS.chamizo.y, h: 6, d: 170 },
];

(async () => {
  let data;
  try {
    data = await (await fetch('data/guarena.json')).json();
  } catch {
    townError('No se pudo cargar el modelo de Guareña.');
    return;
  }
  createTownPage({ data, churches: GUARENA_CHURCHES, ine: '06060', name: 'Guareña', places: PLACES, facts: FACTS, firstFacts: FIRST, radius: 1400 });
  document.querySelector('#tur')?.addEventListener('click', () => {
    document.querySelector('#card-k').textContent = 'Próximamente · modo arqueología';
    document.querySelector('#card-t').textContent = 'Casas del Turuñuelo';
    document.querySelector('#card-p').textContent = 'El yacimiento tartésico está fuera del casco urbano, junto a la desembocadura del Búrdalo. Es Bien de Interés Cultural desde 2021 y solo se ha excavado alrededor de un 30 %. En el juego se podrá excavar por capas.';
    document.querySelector('#card-s').textContent = 'Fuente: Ayuntamiento de Guareña · CSIC';
    document.querySelector('#card').hidden = false;
  });
})();
