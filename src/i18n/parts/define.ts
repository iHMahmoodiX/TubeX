/** A feature's own message catalog. Persian must provide every English key (checked by the type and a test). */
export function definePart<const E extends Record<string, string>>(en: E, fa: { [K in keyof E]: string }) {
  return { en, fa };
}
