function generateStepArray(maxVal) {
  const stepArr = [0];
  let interval = 25;
  // Ascending sweep
  for (let val = 25; val <= maxVal; val += interval) {
    stepArr.push(val);
    if (val === 100) {
      interval = 50;
    }
  }

  return stepArr;
}

function generateReverseStepArray(maxVal) {
  const stepArr = [maxVal];
  let interval = 50;
  if (maxVal === 100) {
    interval = 25;
  }
  for (let val = maxVal - interval; val >= 0; val -= interval) {
    stepArr.push(val);
    if (val === 100) {
      interval = 25;
    }
  }
  return stepArr;
}

export { generateStepArray, generateReverseStepArray };
