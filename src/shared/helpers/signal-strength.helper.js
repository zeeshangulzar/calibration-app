export function getSignalStrengthInfo(rssi) {
  const thresholds = [
    { min: -40, strength: 'Good', barWidth: 100, colorClass: 'bg-green-500' },
    { min: -70, strength: 'Weak', barWidth: 60, colorClass: 'bg-yellow-500' },
    { min: -85, strength: 'Poor', barWidth: 40, colorClass: 'bg-orange-500' },
    { min: -Infinity, strength: 'Poor', barWidth: 20, colorClass: 'bg-red-500' },
  ];

  return thresholds.find(({ min }) => rssi >= min);
}
