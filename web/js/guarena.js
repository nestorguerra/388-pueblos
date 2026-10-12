// Guareña, pueblo 001: datos dedicados (centrados en la Plaza de España) y contenido verificado.
import { LANDMARKS, GUARENA_CHURCHES } from './world.js';
import { createTownPage, townError } from './town-page.js';
import { getJSON } from './red.js';
import { lang } from './i18n.js';

const FIRST_ES = {
  torre: { t: 'La torre de Santa María', p: 'La iglesia de Santa María se empezó en 1557 y se terminó hacia 1700. Su torre de cuatro cuerpos mide 32 metros y el templo es Bien de Interés Cultural desde 1990.', s: 'Ayuntamiento de Guareña · BOE' },
  'espadaña': { t: 'La espadaña de San Gregorio', p: 'San Gregorio fue ermita y es parroquia desde 1896. Tiene una espadaña barroca y un atrio de triple arcada que descansa sobre capiteles visigodos.', s: 'Ayuntamiento de Guareña' },
};
const FACTS_ES = [
  { t: 'Juan de Herrera pasó por aquí', p: 'En las trazas de Santa María intervinieron Sancho Cabrera, Rodrigo Gil de Hontañón y, desde 1580, Juan de Herrera, el arquitecto de El Escorial.', s: 'CHDE Trujillo' },
  { t: 'El miajón de los castúos', p: 'Luis Chamizo (Guareña, 1894 – Madrid, 1945) escribió El miajón de los castúos en 1921, la obra fundacional de la poesía en castúo. Por eso Guareña se llama a sí misma tierra de castúos.', s: 'Ayuntamiento de Guareña' },
  { t: 'Los primeros rostros de Tarteso', p: 'En Casas del Turuñuelo, junto al río Búrdalo, se excava un edificio tartésico del siglo V a. C. En 2023 aparecieron allí las primeras representaciones humanas de Tarteso.', s: 'CSIC, abril de 2023' },
  { t: 'Un filósofo guareñense', p: 'Eugenio Frutos Cortés (Guareña, 1903–1979) fue catedrático de Filosofía en Zaragoza. Hoy da nombre al instituto y a la biblioteca del pueblo.', s: 'Biblioteca Virtual Cervantes' },
  { t: 'El Cristo de las Aguas', p: 'Las fiestas patronales se celebran del 11 al 14 de septiembre. El día grande es el 14, la Exaltación de la Cruz, con triduo en Santa María y procesión.', s: 'Agenda municipal 2026' },
  { t: 'Un meteorito con nombre de pueblo', p: 'En 1892 cayó en el término municipal un meteorito, una condrita que se conoce como «Guareña».', s: 'Wikipedia' },
  { t: 'Vecinas con alas', p: 'Extremadura tiene unas 8.578 parejas de cigüeña blanca (censo de 2025), la segunda comunidad de España. Muchas anidan en torres de iglesias como esta.', s: 'SEO/BirdLife, censo 2025' },
];
const PLACES_ES = [
  { name: 'Plaza de España', tag: 'Ayuntamiento', p: 'El corazón del pueblo. El Palacio Municipal tiene fachada de granito, pórtico toscano y reloj. Desde aquí empezará la beta jugable.', s: 'Ayuntamiento de Guareña', x: LANDMARKS.plaza.x, y: LANDMARKS.plaza.y, h: 10, d: 210 },
  { name: 'Iglesia de Santa María', tag: 'BIC · 1557', p: 'Renacentista con elementos góticos y platerescos, bóvedas de crucería y solería de mármol blanco y negro. Su torre de 32 metros se ve desde toda la vega.', s: 'Ayuntamiento de Guareña · BOE', x: -136, y: 92, h: 18, d: 170 },
  { name: 'Iglesia de San Gregorio', tag: 'Siglo XVIII', p: 'Antigua ermita convertida en parroquia en 1896, con espadaña barroca y atrio sobre capiteles visigodos, junto a la plaza de abastos.', s: 'Ayuntamiento de Guareña', x: LANDMARKS.sangregorio.x, y: LANDMARKS.sangregorio.y, h: 8, d: 160 },
  { name: 'Casa natal de Luis Chamizo', tag: 'Poeta del castúo', p: 'Casa privada con placa conmemorativa. En 2021, por el centenario de El miajón de los castúos, se levantó la escultura «Yo vi escribir La Nacencia».', s: 'Ayuntamiento de Guareña', x: LANDMARKS.chamizo.x, y: LANDMARKS.chamizo.y, h: 6, d: 170 },
];

// el mismo contenido en inglés (las fuentes no se traducen: son los nombres de quien lo publica)
const FIRST_EN = {
  torre: { t: 'The tower of Santa María', p: 'Work on the church of Santa María began in 1557 and finished around 1700. Its four-tier tower is 32 metres tall and the church has been a listed monument (Bien de Interés Cultural) since 1990.', s: FIRST_ES.torre.s },
  'espadaña': { t: 'The bell gable of San Gregorio', p: 'San Gregorio was a hermitage and has been a parish church since 1896. It has a baroque bell gable and a triple-arched porch resting on Visigothic capitals.', s: FIRST_ES['espadaña'].s },
};
const FACTS_EN = [
  { t: 'Juan de Herrera was here', p: 'Sancho Cabrera, Rodrigo Gil de Hontañón and, from 1580, Juan de Herrera, the architect of El Escorial, all worked on the plans of Santa María.' },
  { t: 'El miajón de los castúos', p: 'Luis Chamizo (Guareña, 1894 – Madrid, 1945) wrote El miajón de los castúos in 1921, the founding work of poetry in castúo, the local dialect. That is why Guareña calls itself the land of the castúos.' },
  { t: 'The first faces of Tartessos', p: 'At Casas del Turuñuelo, by the river Búrdalo, archaeologists are excavating a Tartessian building from the 5th century BC. In 2023 the first human depictions of Tartessos were found there.' },
  { t: 'A philosopher from Guareña', p: 'Eugenio Frutos Cortés (Guareña, 1903–1979) was professor of Philosophy in Zaragoza. Today the town\'s secondary school and library bear his name.' },
  { t: 'El Cristo de las Aguas', p: 'The patron saint festivities run from 11 to 14 September. The big day is the 14th, the Exaltation of the Cross, with a triduum in Santa María and a procession.' },
  { t: 'A meteorite named after a town', p: 'In 1892 a meteorite fell within the municipality: a chondrite known as «Guareña».' },
  { t: 'Neighbours with wings', p: 'Extremadura has some 8,578 pairs of white storks (2025 census), the second-largest population in Spain. Many nest on church towers like this one.' },
].map((f, i) => ({ ...f, s: FACTS_ES[i].s }));
const PLACES_EN = [
  { name: 'Plaza de España', tag: 'Town hall', p: 'The heart of the town. The town hall has a granite façade, a Tuscan portico and a clock. The playable beta will start here.' },
  { name: 'Church of Santa María', tag: 'Listed · 1557', p: 'Renaissance with Gothic and Plateresque touches, rib vaults and a black-and-white marble floor. Its 32-metre tower can be seen from all over the plain.' },
  { name: 'Church of San Gregorio', tag: '18th century', p: 'A former hermitage that became a parish church in 1896, with a baroque bell gable and a porch on Visigothic capitals, next to the market square.' },
  { name: 'Birthplace of Luis Chamizo', tag: 'Poet of castúo', p: 'A private house with a commemorative plaque. In 2021, for the centenary of El miajón de los castúos, the sculpture «Yo vi escribir La Nacencia» was put up.' },
].map((pl, i) => ({ ...PLACES_ES[i], ...pl }));
const EN = lang === 'en';
const [FIRST, FACTS, PLACES] = EN ? [FIRST_EN, FACTS_EN, PLACES_EN] : [FIRST_ES, FACTS_ES, PLACES_ES];
const TXT = EN
  ? { err: 'We could not load the model of Guareña. Check your connection.', k: 'Coming soon · archaeology mode', p: 'The Tartessian site lies outside the town centre, where the Búrdalo meets the Guadiana. It has been a listed site since 2021 and only about 30 % has been excavated. In the game you will be able to dig it layer by layer.', s: 'Source: Ayuntamiento de Guareña · CSIC' }
  : { err: 'No se pudo cargar el modelo de Guareña. Revisa la conexión.', k: 'Próximamente · modo arqueología', p: 'El yacimiento tartésico está fuera del casco urbano, junto a la desembocadura del Búrdalo. Es Bien de Interés Cultural desde 2021 y solo se ha excavado alrededor de un 30 %. En el juego se podrá excavar por capas.', s: 'Fuente: Ayuntamiento de Guareña · CSIC' };

(async () => {
  let data;
  try {
    data = await getJSON('data/guarena.json');
  } catch {
    townError(TXT.err, { retry: true });
    return;
  }
  createTownPage({ data, churches: GUARENA_CHURCHES, ine: '06060', name: 'Guareña', places: PLACES, facts: FACTS, firstFacts: FIRST, radius: 1400, playable: true });
  document.querySelector('#tur')?.addEventListener('click', () => {
    document.querySelector('#card-k').textContent = TXT.k;
    document.querySelector('#card-t').textContent = 'Casas del Turuñuelo';
    document.querySelector('#card-p').textContent = TXT.p;
    document.querySelector('#card-s').textContent = TXT.s;
    document.querySelector('#card').hidden = false;
  });
})();
