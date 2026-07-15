const MAX_TIDAL_INPUT_LENGTH = 2000;

export function getInputs() {
  return {
    startLat: parseFloat(document.getElementById('start-lat').value),
    startLon: parseFloat(document.getElementById('start-lon').value),
    endLat: parseFloat(document.getElementById('end-lat').value),
    endLon: parseFloat(document.getElementById('end-lon').value),
    departureDate: document.getElementById('departure-date').value,
    departureTime: document.getElementById('departure-time').value,
    timeMode: document.querySelector('input[name="time-mode"]:checked').value,
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
  } else {
    if (inputs.startLat < -90 || inputs.startLat > 90) {
      errors.push('Start latitude must be between -90 and 90');
    }
    if (inputs.startLon < -180 || inputs.startLon > 180) {
      errors.push('Start longitude must be between -180 and 180');
    }
  }

  if (isNaN(inputs.endLat) || isNaN(inputs.endLon)) {
    errors.push('End coordinates are required');
  } else {
    if (inputs.endLat < -90 || inputs.endLat > 90) {
      errors.push('End latitude must be between -90 and 90');
    }
    if (inputs.endLon < -180 || inputs.endLon > 180) {
      errors.push('End longitude must be between -180 and 180');
    }
  }

  if (!inputs.departureDate || !inputs.departureTime) {
    errors.push('Target date and time are required');
  }

  if (inputs.timeStep < 5 || inputs.timeStep > 60) {
    errors.push('Time step must be between 5 and 60 minutes');
  }

  if (isNaN(inputs.headingThreshold) || inputs.headingThreshold < 5 || inputs.headingThreshold > 45) {
    errors.push('Heading threshold must be between 5 and 45 degrees');
  }

  return errors;
}

export function setupTimeModeToggle() {
  const radios = document.querySelectorAll('input[name="time-mode"]');
  const hint = document.getElementById('time-hint');

  const update = () => {
    const mode = document.querySelector('input[name="time-mode"]:checked').value;
    hint.textContent = mode === 'departure'
      ? 'When you plan to leave'
      : 'When you want to arrive — departure time will be computed';
  };

  radios.forEach(r => r.addEventListener('change', update));
  update();
}

export function parseTidalData(text) {
  if (!text.trim()) return null;

  const truncated = text.slice(0, MAX_TIDAL_INPUT_LENGTH);
  const lines = truncated.trim().split('\n');
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
