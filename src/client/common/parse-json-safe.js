/**
 * safe parse json
 */
export default str => {
  // 2026-07-05 coder(lq): Empty localStorage values are valid absence, not malformed user data.
  if (str === undefined || str === null || str === '') {
    return str
  }
  try {
    return JSON.parse(str)
  } catch (e) {
    console.error('JSON.parse fails', e.stack)
    return str
  }
}
