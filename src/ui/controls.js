export function getInputs() {
  return {
    startLat: parseFloat(document.getElementById('start-lat').value),
    startLon: parseFloat(document.getElementById('start-lon').value),
    endLat: parseFloat(document.getElementById('end-lat').value),
    endLon: parseFloat(document.getElementById('end-lon').value),
    departure: document.getElementById('departure').value,
    timeStep: parseInt(document.getElementById('time-step').value, 10),
    headingThreshold: parseInt(document.getElementById('heading-threshold').value, 10),
    tidalEnabled: document.getElementById('enable-tides').checked,
    tidalData: document.getElementById('tide-data').value
  };
}

export function setCoordinates(field, lat, lon) {
  if (field === 'start') {
    document.getElementById('start-lat').value = lat.toFixed(4);
    document.getElementById('start-lon').value = lon.toFixed(4);
  } else {
    document.getElementById('end-lat').value = lat.toFixed(4);
    document.getElementById('end-lon').value = lon.toFixed(4);
  }
}

export function validateInputs(inputs) {
  const errors = [];

  if (isNaN(inputs.startLat) || isNaN(inputs.startLon)) {
    errors.push('Start coordinates are required');
  }
  if (isNaN(inputs.endLat) || isNaN(inputs.endLon)) {
    errors.push('End coordinates are required');
  }
  if (!inputs.departure) {
    errors.push('Departure time is required');
  }
  if (inputs.timeStep < 5 || inputs.timeStep > 60) {
    errors.push('Time step must be between 5 and 60 minutes');
  }

  return errors;
}

export function parseTidalData(text) {
  if (!text.trim()) return null;

  const lines = text.trim().split('\n');
  const currents = [];

  for (const line of lines) {
    const parts = line.split(',').map(s => s.trim());
    if (parts.length < 3) continue;

    const dir = parseFloat(parts[1]);
    const speed = parseFloat(parts[2]);

    if (isNaN(dir) || isNaN(speed)) continue;

    currents.push({
      direction: dir,
      speed: speed
    });
  }

  return currents.length > 0 ? currents : null;
}

export function setupTideToggle() {
  const checkbox = document.getElementById('enable-tides');
  const tideInput = document.getElementById('tide-input');

  checkbox.addEventListener('change', () => {
    tideInput.classList.toggle('hidden', !checkbox.checked);
  });
}
