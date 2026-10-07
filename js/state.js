'use strict';

// Shared DOM references, presets, render state, and initial camera settings.
const $ = (id) => document.getElementById(id),
  canvas = $('canvas');
let gl;
try {
  gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: true });
} catch (e) {
  gl = null;
}
const presets = {
  ripple: {
    name: 'Fala radialna',
    mode: 'explicit',
    eq: 'sin(sqrt(x^2 + y^2))',
    d: 6,
    description:
      'Wysokość zależy tylko od odległości od środka. Sinus zamienia tę odległość w naprzemienne pierścienie szczytów i dolin.',
    experiment: 'Wstaw 2 * sqrt(x^2 + y^2) do sinusa i zobacz, jak pierścienie się zagęszczają.',
  },
  saddle: {
    name: 'Siodło',
    mode: 'explicit',
    eq: '(x^2 - y^2) / 4',
    d: 5,
    description:
      'Wzdłuż osi x powierzchnia wygina się w górę, a wzdłuż osi y w dół. Środek jest punktem siodłowym: nie jest ani szczytem, ani doliną.',
    experiment: 'Zamień minus na plus i porównaj siodło z misą.',
  },
  waves: {
    name: 'Interferencja',
    mode: 'explicit',
    eq: 'sin(x) * cos(y)',
    d: 6,
    description:
      'Iloczyn dwóch fal tworzy regularny układ szczytów i dolin. Powierzchnia przecina poziom z = 0 wszędzie tam, gdzie jedna z fal jest równa zero.',
    experiment: 'Zmień sin(x) na sin(2x), aby zagęścić wzór tylko w jednym kierunku.',
  },
  gauss: {
    name: 'Rozkład Gaussa',
    mode: 'explicit',
    eq: '3 * exp(-(x^2 + y^2) / 4)',
    d: 6,
    description:
      'Dzwon Gaussa ma najwyższy punkt w środku i łagodnie opada ku zeru. Liczba 3 ustala wysokość, a dzielnik 4 wpływa na szerokość.',
    experiment: 'Zwiększ dzielnik 4 do 8 i zobacz, jak dzwon się rozszerza.',
  },
  sphere: {
    name: 'Sfera',
    mode: 'implicit',
    eq: 'x^2 + y^2 + z^2 = 9',
    d: 4,
    description:
      'Każdy punkt tej powierzchni leży w odległości 3 od środka. Tryb F pozwala pokazać całą sferę, również jej dolną połowę.',
    experiment: 'Zmień 9 na 4: promień zmniejszy się z 3 do 2.',
  },
  torus: {
    name: 'Torus',
    mode: 'implicit',
    eq: '(sqrt(x^2 + y^2) - 2)^2 + z^2 = 1',
    d: 4,
    description:
      'Torus to pierścień z otworem. Środek jego rurki biegnie po okręgu o promieniu 2, a sama rurka ma promień 1.',
    experiment:
      'Zmień 2 na 3, aby powiększyć pierścień. Zwiększ też zakres osi, jeśli powierzchnia jest ucięta.',
  },
  paraboloid: {
    name: 'Paraboloida',
    mode: 'explicit',
    eq: '(x^2 + y^2) / 4',
    d: 4,
    description:
      'To obrotowa misa: przekroje pionowe są parabolami, a poziome są okręgami. Wysokość rośnie z kwadratem odległości od środka.',
    experiment: 'Dodaj minus przed całym wyrażeniem, aby odwrócić misę.',
  },
  cone: {
    name: 'Stożek',
    mode: 'explicit',
    eq: 'sqrt(x^2 + y^2)',
    d: 4,
    description:
      'Wysokość jest równa odległości od środka, więc rośnie liniowo. W przeciwieństwie do paraboloidy stożek ma proste boki i ostry wierzchołek.',
    experiment: 'Pomnóż funkcję przez 0.5, aby spłaszczyć stożek.',
  },
  'monkey-saddle': {
    name: 'Małpie siodło',
    mode: 'explicit',
    eq: '(x^3 - 3*x*y^2) / 9',
    d: 3,
    description:
      'Wokół środka naprzemiennie układają się trzy grzbiety i trzy doliny. To bardziej złożony punkt siodłowy niż w zwykłym siodle.',
    experiment: 'Zamień dzielnik 9 na 18, aby zmniejszyć wysokość grzbietów i głębokość dolin.',
  },
  ellipsoid: {
    name: 'Elipsoida',
    mode: 'implicit',
    eq: 'x^2/9 + y^2/4 + z^2 = 1',
    d: 4,
    description:
      'To sfera rozciągnięta w różnych kierunkach. Jej półosie mają długości 3 wzdłuż x, 2 wzdłuż y i 1 wzdłuż z.',
    experiment: 'Zmień dzielniki 9 i 4 na 1, aby otrzymać sferę o promieniu 1.',
  },
  hyperboloid: {
    name: 'Hiperboloida',
    mode: 'implicit',
    eq: 'x^2 + y^2 - z^2 = 1',
    d: 3,
    description:
      'Ta jednopowłokowa hiperboloida przypomina klepsydrę. Przekrój na wysokości z jest okręgiem o promieniu sqrt(1 + z^2), więc talia jest najwęższa przy z = 0.',
    experiment: 'Zmień prawą stronę na -1: powierzchnia rozdzieli się na dwie części.',
  },
  'rounded-cube': {
    name: 'Zaokrąglony sześcian',
    mode: 'implicit',
    eq: 'x^4 + y^4 + z^4 = 16',
    d: 3,
    description:
      'Czwarte potęgi tworzą superelipsoidę przypominającą sześcian z zaokrąglonymi krawędziami. Powierzchnia przecina każdą oś przy -2 i 2.',
    experiment:
      'Zmień potęgi na 2 i prawą stronę na 4, aby porównać ten kształt ze sferą o promieniu 2.',
  },
};
const equationColors = ['#b7f579', '#79b8ff', '#ff929d', '#d6a2ff', '#ffc979', '#79e0ce'];
const equations = [];
const pinnedPoints = [];
const crossSection = {
  enabled: false,
  axis: 'z',
  value: 0,
  showPlane: true,
  results: [],
};
let sectionPlaneBuffer, sectionLineBuffer, sectionPointBuffer, sectionAreaBuffer;
let selectedPoint = null,
  nextPointId = 1,
  pointGesture = null,
  pointBuffer;
let nextEquationId = 1,
  activeEquationId = null,
  currentDomain = 6,
  auto = false,
  needsDraw = true,
  building = false,
  buildVersion = 0,
  rendererUnavailable = false,
  gridBuffer,
  axisBuffer,
  gridCount = 0,
  program;
const camera = { theta: 0.78, phi: 0.94, zoom: 1, panX: 0, panY: 0 };
