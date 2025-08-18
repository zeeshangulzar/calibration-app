function addDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { addDelay };
