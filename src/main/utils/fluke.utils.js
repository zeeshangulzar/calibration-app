const ConnectionCommand = '*IDN?';

const flukeCheckOutputStateCommand = 'Output:state?';

const flukeSetOutputStateCommand = 'OUTPut:STATe ON';
const flukeSetOutputStateZeroCommand = 'OUTPut:STATe OFF';

const flukeCheckOutputPressureModeCommand = 'OUTPut:PRESsure:MODE?';
const flukeSetOutputPressureModeControlCommand = 'OUTPut:PRESsure:MODE CONTrol';
const flukeSetOutputPressureModeVentCommand = 'OUTPut:PRESsure:MODE VENT';

const flukeCheckStaticModeCommand = 'SOURce:PRESsure:STATic?';
const flukeSetStaticModeCommand = 'SOURce:PRESsure:STATic 0';

const flukeCheckToleranceCommand = 'SOURce:PRESsure:TOLerance?';
const flukeTolerance = 0.1;
const flukeSetToleranceCommand = `SOURce:PRESsure:TOLerance ${flukeTolerance}`;

const flukeGetPressureCommand = 'MEASure:PRESsure?';

const flukeStatusOperationCommand = 'STATus:OPERation:CONDition?';

const flukeSetPressureCommand = 'SOURce:PRESsure:LEVel:IMMediate:AMPLitude';

const flukeCheckSystemErrorCommand = 'SYSTem:ERRor?';

export {
  ConnectionCommand,
  flukeCheckOutputStateCommand,
  flukeSetOutputStateCommand,
  flukeSetOutputStateZeroCommand,
  flukeCheckOutputPressureModeCommand,
  flukeSetOutputPressureModeControlCommand,
  flukeSetOutputPressureModeVentCommand,
  flukeCheckStaticModeCommand,
  flukeSetStaticModeCommand,
  flukeCheckToleranceCommand,
  flukeSetToleranceCommand,
  flukeGetPressureCommand,
  flukeStatusOperationCommand,
  flukeSetPressureCommand,
  flukeCheckSystemErrorCommand,
  flukeTolerance,
};
