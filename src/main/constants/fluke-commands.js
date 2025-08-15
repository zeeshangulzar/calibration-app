/**
 * Fluke device command constants
 * Standard SCPI commands for Fluke calibration devices
 */

// Device identification and connection
export const FLUKE_COMMANDS = {
  // Connection and identification
  IDENTIFICATION: "*IDN?",
  RESET: "*RST",
  CLEAR_STATUS: "*CLS",
  OPERATION_COMPLETE: "*OPC?",
  
  // Output control
  OUTPUT_STATE_QUERY: "OUTPut:STATe?",
  OUTPUT_STATE_ON: "OUTPut:STATe ON",
  OUTPUT_STATE_OFF: "OUTPut:STATe OFF",
  
  // Pressure mode control
  PRESSURE_MODE_QUERY: "OUTPut:PRESsure:MODE?",
  PRESSURE_MODE_CONTROL: "OUTPut:PRESsure:MODE CONTrol",
  PRESSURE_MODE_VENT: "OUTPut:PRESsure:MODE VENT",
  PRESSURE_MODE_MEASURE: "OUTPut:PRESsure:MODE MEASure",
  
  // Source pressure control
  STATIC_MODE_QUERY: "SOURce:PRESsure:STATic?",
  STATIC_MODE_SET: "SOURce:PRESsure:STATic 0",
  TOLERANCE_QUERY: "SOURce:PRESsure:TOLerance?",
  TOLERANCE_SET: "SOURce:PRESsure:TOLerance 0.1",
  PRESSURE_SET: "SOURce:PRESsure:LEVel:IMMediate:AMPLitude",
  
  // Measurement
  PRESSURE_MEASURE: "MEASure:PRESsure?",
  PRESSURE_FETCH: "FETCh:PRESsure?",
  
  // Status and error handling
  STATUS_OPERATION: "STATus:OPERation:CONDition?",
  STATUS_QUESTIONABLE: "STATus:QUEStionable:CONDition?",
  SYSTEM_ERROR: "SYSTem:ERRor?",
  
  // Units and ranges
  UNIT_QUERY: "UNIT:PRESsure?",
  UNIT_SET_PSI: "UNIT:PRESsure PSI",
  UNIT_SET_PASCAL: "UNIT:PRESsure PA",
  UNIT_SET_BAR: "UNIT:PRESsure BAR",
  
  // Calibration specific
  RANGE_AUTO: "SOURce:PRESsure:RANGe:AUTO ON",
  RANGE_QUERY: "SOURce:PRESsure:RANGe?",
  STABILITY_QUERY: "SOURce:PRESsure:STABility?",
};

// Command categories for UI organization
export const COMMAND_CATEGORIES = {
  CONNECTION: {
    name: "Connection & Status",
    commands: [
      { cmd: FLUKE_COMMANDS.IDENTIFICATION, desc: "Device identification" },
      { cmd: FLUKE_COMMANDS.RESET, desc: "Reset device" },
      { cmd: FLUKE_COMMANDS.CLEAR_STATUS, desc: "Clear status" },
      { cmd: FLUKE_COMMANDS.OPERATION_COMPLETE, desc: "Operation complete query" }
    ]
  },
  
  OUTPUT_CONTROL: {
    name: "Output Control",
    commands: [
      { cmd: FLUKE_COMMANDS.OUTPUT_STATE_QUERY, desc: "Query output state" },
      { cmd: FLUKE_COMMANDS.OUTPUT_STATE_ON, desc: "Turn output ON" },
      { cmd: FLUKE_COMMANDS.OUTPUT_STATE_OFF, desc: "Turn output OFF" }
    ]
  },
  
  PRESSURE_MODE: {
    name: "Pressure Mode",
    commands: [
      { cmd: FLUKE_COMMANDS.PRESSURE_MODE_QUERY, desc: "Query pressure mode" },
      { cmd: FLUKE_COMMANDS.PRESSURE_MODE_CONTROL, desc: "Set control mode" },
      { cmd: FLUKE_COMMANDS.PRESSURE_MODE_VENT, desc: "Set vent mode" },
      { cmd: FLUKE_COMMANDS.PRESSURE_MODE_MEASURE, desc: "Set measure mode" }
    ]
  },
  
  PRESSURE_CONTROL: {
    name: "Pressure Control",
    commands: [
      { cmd: FLUKE_COMMANDS.STATIC_MODE_QUERY, desc: "Query static mode" },
      { cmd: FLUKE_COMMANDS.TOLERANCE_QUERY, desc: "Query tolerance" },
      { cmd: FLUKE_COMMANDS.PRESSURE_MEASURE, desc: "Measure pressure" },
      { cmd: FLUKE_COMMANDS.PRESSURE_SET + " <value>", desc: "Set pressure (replace <value>)" }
    ]
  },
  
  STATUS: {
    name: "Status & Errors",
    commands: [
      { cmd: FLUKE_COMMANDS.STATUS_OPERATION, desc: "Operation status" },
      { cmd: FLUKE_COMMANDS.STATUS_QUESTIONABLE, desc: "Questionable status" },
      { cmd: FLUKE_COMMANDS.SYSTEM_ERROR, desc: "System errors" }
    ]
  },
  
  UNITS: {
    name: "Units & Ranges",
    commands: [
      { cmd: FLUKE_COMMANDS.UNIT_QUERY, desc: "Query current unit" },
      { cmd: FLUKE_COMMANDS.UNIT_SET_PSI, desc: "Set unit to PSI" },
      { cmd: FLUKE_COMMANDS.UNIT_SET_BAR, desc: "Set unit to BAR" },
      { cmd: FLUKE_COMMANDS.RANGE_QUERY, desc: "Query pressure range" }
    ]
  }
};

// Common command sequences for calibration
export const COMMAND_SEQUENCES = {
  INITIALIZE_DEVICE: [
    FLUKE_COMMANDS.CLEAR_STATUS,
    FLUKE_COMMANDS.RESET,
    FLUKE_COMMANDS.IDENTIFICATION
  ],
  
  SETUP_FOR_CALIBRATION: [
    FLUKE_COMMANDS.OUTPUT_STATE_ON,
    FLUKE_COMMANDS.PRESSURE_MODE_CONTROL,
    FLUKE_COMMANDS.STATIC_MODE_SET,
    FLUKE_COMMANDS.TOLERANCE_SET
  ],
  
  SHUTDOWN_SEQUENCE: [
    FLUKE_COMMANDS.PRESSURE_MODE_VENT,
    FLUKE_COMMANDS.OUTPUT_STATE_OFF
  ]
};

// Helper functions for command formatting
export const COMMAND_HELPERS = {
  /**
   * Format pressure set command with value
   * @param {number} pressure - Pressure value
   * @returns {string} Formatted command
   */
  setPressure: (pressure) => `${FLUKE_COMMANDS.PRESSURE_SET} ${pressure}`,
  
  /**
   * Format tolerance set command with value
   * @param {number} tolerance - Tolerance value
   * @returns {string} Formatted command
   */
  setTolerance: (tolerance) => `SOURce:PRESsure:TOLerance ${tolerance}`,
  
  /**
   * Check if command expects a response
   * @param {string} command - Command string
   * @returns {boolean} True if command expects response
   */
  expectsResponse: (command) => command.includes('?'),
  
  /**
   * Get command description
   * @param {string} command - Command string
   * @returns {string} Command description
   */
  getDescription: (command) => {
    for (const category of Object.values(COMMAND_CATEGORIES)) {
      const found = category.commands.find(c => 
        c.cmd === command || c.cmd.startsWith(command.split(' ')[0])
      );
      if (found) return found.desc;
    }
    return "Custom command";
  }
};
