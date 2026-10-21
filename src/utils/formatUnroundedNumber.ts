/** Display decimal digits without rounding or changing the calculated value. */
export function formatUnroundedNumber(value: number, digits = 2): string {
  if (!Number.isInteger(digits) || digits < 0 || digits > 100) throw new RangeError('Invalid decimal precision.');
  if (!Number.isFinite(value)) return digits ? `0.${'0'.repeat(digits)}` : '0';

  // Truncate the decimal representation instead of multiplying by 100:
  // binary floating point can otherwise turn 1.15 into 1.14.
  const [mantissa, exponentText] = Math.abs(value).toString().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const decimalPosition = whole.length + Number(exponentText ?? 0);
  const significant = whole + fraction;
  const integer = decimalPosition <= 0 ? '0' : significant.padEnd(decimalPosition, '0').slice(0, decimalPosition);
  const decimal = (decimalPosition < 0 ? '0'.repeat(-decimalPosition) + significant : significant.slice(decimalPosition)).padEnd(digits, '0').slice(0, digits);
  const sign = value < 0 && /[1-9]/.test(integer + decimal) ? '-' : '';
  return `${sign}${integer}${digits ? `.${decimal}` : ''}`;
}
