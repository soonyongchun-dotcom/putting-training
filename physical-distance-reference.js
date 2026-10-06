(function (root) {
  const tables = {
    male: {
      height: [168, 171, 176, 181, 184],
      weight: [65, 69, 76, 83, 87],
      muscle: [30, 32, 35, 38, 40],
      totalYards: [280, 293, 308, 320, 335],
    },
    female: {
      height: [158, 161, 166, 171, 174],
      weight: [52, 55, 60.5, 66.5, 70],
      muscle: [21.5, 22.75, 25, 27.5, 29],
      totalYards: [228, 242, 258, 270, 285],
    },
  };
  const percentiles = [10, 30, 50, 70, 90];
  function crossCorrection(lambda) {
    return lambda == null || (lambda >= 0.85 && lambda <= 1.15) ? 1
      : lambda > 1.15 ? Math.max(0.96, 1 - 0.015 * (lambda - 1.15))
        : Math.min(1.05, 1 + 0.020 * (0.85 - lambda));
  }
  function validateSensitivity(settings) {
    if (!settings || !['heightGain', 'weightGain'].every(key =>
      Number.isFinite(settings[key]) && settings[key] >= 1 && settings[key] <= 3)) {
      throw new Error('Height and weight sensitivity must be between 1 and 3.');
    }
    return settings;
  }
  function interpolate(value, anchors, values) {
    if (value <= anchors[0]) return values[0];
    for (let i = 1; i < anchors.length; i++) {
      if (value <= anchors[i]) {
        const fraction = (value - anchors[i - 1]) / (anchors[i] - anchors[i - 1]);
        return values[i - 1] + fraction * (values[i] - values[i - 1]);
      }
    }
    return values[values.length - 1];
  }
  function compute(input) {
    const sensitivity = validateSensitivity(input.sensitivity ?? { heightGain: 1, weightGain: 1 });
    const table = ['male', 'female'].includes(input.sex) ? tables[input.sex] : null;
    const missing = [];
    if (!table) missing.push('sex');
    if (!Number.isFinite(input.height) || input.height < 150 || input.height > 200) missing.push('height');
    if (!Number.isFinite(input.weight) || input.weight < 30 || input.weight > 200) missing.push('weight');
    const muscleIncluded = input.muscle != null;
    if (muscleIncluded && (!Number.isFinite(input.muscle) || input.muscle < 20 || input.muscle > 150 || input.muscle > input.weight)) missing.push('muscle');
    if (!Number.isFinite(input.distance) || input.distance <= 0 || input.distance > 600) missing.push('distance');
    if (missing.length) return { status: 'inputs', missing };
    const heightPercentile = interpolate(input.height, table.height, percentiles);
    const weightPercentile = interpolate(input.weight, table.weight, percentiles);
    const musclePercentile = muscleIncluded ? interpolate(input.muscle, table.muscle, percentiles) : null;
    const composite = muscleIncluded
      ? heightPercentile * 0.35 + weightPercentile * 0.15 + musclePercentile * 0.50
      : heightPercentile * 0.60 + weightPercentile * 0.40;
    const lambda = muscleIncluded ? heightPercentile / musclePercentile : null;
    const correction = crossCorrection(lambda);
    const totalYards = interpolate(composite, percentiles, table.totalYards);
    const originalBaselineMeters = totalYards * 0.9144 * correction;
    const centralBaseline = (height, weight) => {
      const composite = muscleIncluded
        ? height * 0.35 + weight * 0.15 + musclePercentile * 0.50 : height * 0.60 + weight * 0.40;
      const lambda = muscleIncluded ? height / musclePercentile : null;
      const correction = crossCorrection(lambda);
      return interpolate(composite, percentiles, table.totalYards) * 0.9144 * correction;
    };
    let sensitivityFactor = 1;
    if (sensitivity.heightGain !== 1) {
      sensitivityFactor *= (originalBaselineMeters / centralBaseline(50, weightPercentile)) ** (sensitivity.heightGain - 1);
    }
    if (sensitivity.weightGain !== 1) {
      sensitivityFactor *= (originalBaselineMeters / centralBaseline(heightPercentile, 50)) ** (sensitivity.weightGain - 1);
    }
    const baselineMeters = originalBaselineMeters * sensitivityFactor;
    const outside = ['height', 'weight', ...(muscleIncluded ? ['muscle'] : [])]
      .filter(key => input[key] < table[key][0] || input[key] > table[key][4]);
    return {
      status: 'ready', heightPercentile, weightPercentile, musclePercentile, composite,
      lambda, correction, totalYards, baselineMeters, outside, muscleIncluded,
      originalBaselineMeters, originalEfficiency: input.distance / originalBaselineMeters * 100,
      sensitivityFactor, sensitivity: { ...sensitivity },
      efficiency: input.distance / baselineMeters * 100,
    };
  }
  root.PhysicalDistanceReference = { compute, validateSensitivity };
})(window);
