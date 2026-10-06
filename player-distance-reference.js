(function (root) {
  const fields = ['player_code', 'sex', 'height_cm', 'weight_kg', 'age_band', 'level', 'club', 'distance_type', 'conditions', 'distance_m', 'source'];
  function validateRows(rows) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 10000) throw new Error('Reference data must contain 1–10000 rows.');
    return rows.map((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Row ${index + 1}: invalid record`);
      const clean = {};
      for (const field of fields) {
        const value = row[field];
        if (value == null || String(value).trim() === '' || String(value).length > 200 || /[<>]/.test(String(value))) throw new Error(`Row ${index + 1}: invalid ${field}`);
        clean[field] = String(value).trim();
      }
      for (const [field, min, max] of [['height_cm', 50, 250], ['weight_kg', 10, 250], ['distance_m', 1, 600]]) {
        clean[field] = Number(clean[field]);
        if (!Number.isFinite(clean[field]) || clean[field] < min || clean[field] > max) throw new Error(`Row ${index + 1}: invalid ${field}`);
      }
      if (!['male', 'female'].includes(clean.sex) || !['carry', 'total'].includes(clean.distance_type)) throw new Error(`Row ${index + 1}: invalid sex or distance_type`);
      return clean;
    });
  }
  function validateSettings(settings) {
    if (!settings || typeof settings !== 'object') throw new Error('Invalid comparison settings.');
    for (const field of ['sex', 'age_band', 'level', 'club', 'conditions']) {
      if (typeof settings[field] !== 'string' || settings[field].length > 200 || /[<>]/.test(settings[field])) throw new Error(`Invalid ${field}`);
    }
    if (!['', 'male', 'female'].includes(settings.sex)) throw new Error('Invalid sex.');
    for (const [field, min, max] of [['heightTolerance', 0, 50], ['weightTolerance', 0, 100], ['minimumPlayers', 2, 1000]]) {
      if (!Number.isFinite(settings[field]) || settings[field] < min || settings[field] > max) throw new Error(`Invalid ${field}`);
    }
    if (!Number.isInteger(settings.minimumPlayers)) throw new Error('Minimum players must be an integer.');
    return settings;
  }
  function compare(rows, settings, athlete) {
    validateSettings(settings);
    const incomplete = ['sex', 'age_band', 'level', 'club', 'conditions'].filter(field => !settings[field].trim());
    if (incomplete.length || !Number.isFinite(athlete.height) || athlete.height <= 0 || !Number.isFinite(athlete.weight) || athlete.weight <= 0) {
      return { status: 'inputs', players: 0 };
    }
    const groups = new Map();
    let records = 0;
    for (const row of rows) {
      if (row.player_code === athlete.code || row.distance_type !== 'total'
        || ['sex', 'age_band', 'level', 'club', 'conditions'].some(field => row[field] !== settings[field].trim())
        || Math.abs(row.height_cm - athlete.height) > settings.heightTolerance
        || Math.abs(row.weight_kg - athlete.weight) > settings.weightTolerance) continue;
      if (!groups.has(row.player_code)) groups.set(row.player_code, []);
      groups.get(row.player_code).push(row.distance_m);
      records++;
    }
    const means = [...groups.values()].map(values => values.reduce((a, b) => a + b, 0) / values.length).sort((a, b) => a - b);
    if (means.length < settings.minimumPlayers) return { status: 'insufficient', players: means.length, records };
    const quantile = p => {
      const index = (means.length - 1) * p;
      const lower = Math.floor(index);
      return means[lower] + (means[Math.ceil(index)] - means[lower]) * (index - lower);
    };
    const mean = means.reduce((a, b) => a + b, 0) / means.length;
    const sd = Math.sqrt(means.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (means.length - 1));
    return {
      status: 'ready', players: means.length, records, mean, sd,
      q1: quantile(0.25), median: quantile(0.5), q3: quantile(0.75),
      realization: Number.isFinite(athlete.distance) && athlete.distance > 0 ? athlete.distance / mean * 100 : null,
    };
  }
  root.PlayerDistanceReference = { fields, validateRows, validateSettings, compare };
})(window);
