function generateStepArray(maxVal, isReverse = true) {
  const stepArr = [];
  let interval = 25;
  // Ascending sweep
  for (let val = 25; val <= maxVal; val += interval) {
    stepArr.push(val.toString());
    if (val === 100) {
      interval = 50;
    }
  }
  if (isReverse) {
    interval = maxVal <= 100 ? 25 : 50;
    // Descending sweep
    for (let val = maxVal - interval; val >= 0; val -= interval) {
      stepArr.push(`-${val.toString()}`);
      if (val === 100) {
        interval = 25;
      }
    }
  }

  return stepArr;
}

export { generateStepArray };
