// The sky takes pastel colours from the real weather in Geneva, right now.
// Open-Meteo is free, needs no key, and only gets Geneva's position, nothing about you.
const PLACE = { name: 'geneva', latitude: 46.2044, longitude: 6.1432 };
const EVERY_MS = 15 * 60_000;
const GOLDEN_HOUR_MS = 45 * 60_000; // around sunrise and sunset

// [top of the sky, bottom of the sky]
const SKIES = {
  clear: ['#a9d6ff', '#fdf3ff'],
  cloudy: ['#bcd9f2', '#f6f0fa'],
  overcast: ['#d9d6e8', '#f3eff2'],
  fog: ['#e6e3dc', '#f7f4ee'],
  rain: ['#b8c7e0', '#e6e9f3'],
  snow: ['#e4eefa', '#ffffff'],
  storm: ['#c4b5e3', '#eadff2'],
  sunrise: ['#ffc9b5', '#ffe9d6'],
  sunset: ['#f7b8d2', '#ffe2c6'],
  night: ['#9d9bd6', '#d8d2f0'],
  cloudyNight: ['#b2adc9', '#dcd8e6'],
};

// WMO weather codes, as Open-Meteo gives them.
function describe(code) {
  if (code === 0) return ['clear', 'clear sky'];
  if (code <= 2) return ['cloudy', 'a few clouds'];
  if (code === 3) return ['overcast', 'overcast'];
  if (code <= 48) return ['fog', 'fog'];
  if (code <= 67 || (code >= 80 && code <= 82)) return ['rain', 'rain'];
  if (code <= 77 || code === 85 || code === 86) return ['snow', 'snow'];
  return ['storm', 'thunderstorm'];
}

function pickSky(current, daily) {
  const [kind, words] = describe(current.weather_code);
  const now = new Date(current.time);
  const near = (time) => Math.abs(now - new Date(time)) < GOLDEN_HOUR_MS;
  const wet = ['rain', 'snow', 'storm'].includes(kind);
  if (!wet && near(daily.sunrise[0])) return { sky: SKIES.sunrise, words: `${words}, sunrise` };
  if (!wet && near(daily.sunset[0])) return { sky: SKIES.sunset, words: `${words}, sunset` };
  if (!current.is_day) return { sky: kind === 'clear' ? SKIES.night : SKIES.cloudyNight, words: `${words}, night` };
  return { sky: SKIES[kind], words };
}

async function updateSky() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${PLACE.latitude}&longitude=${PLACE.longitude}`
      + '&current=weather_code,is_day,temperature_2m&daily=sunrise,sunset&timezone=auto&forecast_days=1';
    const data = await (await fetch(url)).json();
    const { sky, words } = pickSky(data.current, data.daily);
    const root = document.documentElement.style;
    root.setProperty('--sky-top', sky[0]);
    root.setProperty('--sky-bottom', sky[1]);
    const label = document.getElementById('weather');
    label.textContent = `${PLACE.name}: ${words}, ${Math.round(data.current.temperature_2m)}°C`;
    label.hidden = false;
  } catch {
    // No weather: the sky keeps its default pastel blue.
  }
}

export function followTheWeather() {
  updateSky();
  setInterval(updateSky, EVERY_MS);
}

// For trying the colours: ?sky=sunset, ?sky=rain, ?sky=night...
export function forceSky(name) {
  const sky = SKIES[name];
  if (!sky) return false;
  document.documentElement.style.setProperty('--sky-top', sky[0]);
  document.documentElement.style.setProperty('--sky-bottom', sky[1]);
  return true;
}
