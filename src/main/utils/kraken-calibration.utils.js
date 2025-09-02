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

export { generateStepArray };
