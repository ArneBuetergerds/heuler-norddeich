/**
 * An- und Abreisetag gelten als Übergabetag: ein Zeitraum, der am Abreisetag des
 * anderen beginnt, überschneidet sich nicht (Half-Open-Intervall [start, end)).
 */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}
