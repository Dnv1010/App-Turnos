/**
 * Parsea el cuerpo de una Response como JSON sin lanzar si está vacío o no es JSON válido
 * (evita "Unexpected end of JSON input" en response.json()).
 */
export async function parseResponseJson<T = unknown>(res: Response): Promise<T | null> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}
