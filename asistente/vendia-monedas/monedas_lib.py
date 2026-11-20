"""Lógica compartida del asistente de conteo de monedas de VendIA (entrenamiento, evaluación e inferencia).

Regla de diseño: el modelo NUNCA calcula importes. El código calcula subtotales y total (`hechos`) y el modelo solo los
redacta. Cada respuesta se comprueba con `verificar` antes de mostrarse; si no pasa, la aplicación usa el resumen
determinista (`respuesta_auto`). La misma lógica está reflejada en TypeScript (src/lib/monedas-asistente.ts).
"""
import re

DENOMS = (10, 5, 2, 1)  # orden de presentación: de mayor a menor
VALIDAS = {1, 2, 5, 10}

SYSTEM = (
    "Eres el asistente de VendIA. Explicas en español el conteo de monedas mexicanas de 1, 2, 5 y 10 pesos obtenido de una "
    "fotografía. Usa solo los hechos verificados que recibes: no calcules importes, no inventes monedas ni denominaciones y "
    "no hables de nada que no sea este conteo. Responde en una o dos frases."
)

PALABRAS = {0: "cero", 1: "una", 2: "dos", 3: "tres", 4: "cuatro", 5: "cinco", 6: "seis", 7: "siete", 8: "ocho", 9: "nueve",
            10: "diez", 11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince", 16: "dieciséis", 17: "diecisiete",
            18: "dieciocho", 19: "diecinueve", 20: "veinte"}
NUM = {"cero": 0, "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8,
       "nueve": 9, "diez": 10, "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15, "dieciséis": 16,
       "dieciseis": 16, "diecisiete": 17, "dieciocho": 18, "diecinueve": 19, "veinte": 20}

ALCANCE = "Solo puedo explicar el conteo de monedas de esta foto: cuántas hay de cada denominación y cuánto suman."
LIMITE = ("No puedo saberlo con estos datos: solo conozco cuántas monedas de 1, 2, 5 y 10 pesos se detectaron en la foto.")


def palabra(n: int) -> str:
    return PALABRAS.get(n, str(n))


def pesos(n: int) -> str:
    return f"{n} peso" if n == 1 else f"{n} pesos"


def total_pesos(c: dict) -> int:
    return sum(d * c[d] for d in DENOMS)


def total_monedas(c: dict) -> int:
    return sum(c[d] for d in DENOMS)


def hechos(c: dict, corregido: bool = False) -> str:
    """Hechos verificados que recibe el modelo; los calcula el código, no el modelo."""
    lineas = ["Hechos verificados del conteo (calculados por la aplicación):"]
    for d in DENOMS:
        lineas.append(f"- Monedas de {pesos(d)}: {c[d]} (subtotal {pesos(d * c[d])})")
    lineas.append(f"- Total de monedas: {total_monedas(c)}")
    lineas.append(f"- Total: {pesos(total_pesos(c))}")
    if corregido:
        lineas.append("- El usuario corrigió el conteo manualmente: sí")
    return "\n".join(lineas)


def lista_monedas(c: dict) -> str:
    """«dos monedas de 10 pesos, una de 5, dos de 2 y una de 1»"""
    partes = []
    for d in DENOMS:
        if c[d] == 0:
            continue
        if not partes:
            partes.append(f"{palabra(c[d])} {'moneda' if c[d] == 1 else 'monedas'} de {pesos(d)}")
        else:
            partes.append(f"{palabra(c[d])} de {d}")
    if len(partes) <= 1:
        return "".join(partes)
    return ", ".join(partes[:-1]) + " y " + partes[-1]


def respuesta_auto(c: dict, corregido: bool = False) -> str:
    t = total_pesos(c)
    if total_monedas(c) == 0:
        return "No detecté monedas en la foto. El total es 0 pesos." if not corregido else "Con tu corrección no hay monedas. El total es 0 pesos."
    if corregido:
        return f"Con tu corrección, el total es de {pesos(t)}. Hay {lista_monedas(c)}."
    return f"Detecté {pesos(t)} en total. Encontré {lista_monedas(c)}."


# ---------------------------------------------------------------- verificación
_TOKEN = re.compile(r"\b(\d+|[a-záéíóúñ]+)\b", re.I)


def _a_numero(tok: str):
    t = tok.lower()
    if t.isdigit():
        return int(t)
    return NUM.get(t)


def numeros(texto: str) -> list:
    """Cifras (en dígitos o en palabras, 0-20) que aparecen en el texto."""
    out = []
    for tok in _TOKEN.findall(texto):
        n = _a_numero(tok)
        if n is not None:
            out.append(n)
    return out


def permitidos(c: dict) -> set:
    s = {0, 1, 2, 5, 10, total_pesos(c), total_monedas(c)}
    for d in DENOMS:
        s.add(c[d])
        s.add(d * c[d])
    return s


_RE_PRIMERA = re.compile(r"\b(\d+|[a-záéíóúñ]+)\s+monedas?\s+de\s+(\d+)\b", re.I)
_RE_CONT = re.compile(r"(?:,|\by)\s+(\d+|[a-záéíóúñ]+)\s+de\s+(\d+)\b", re.I)
_RE_TOTAL = re.compile(r"\btotal\s+(?:es\s+)?(?:de\s+)?(\d+)\s+pesos?\b|\bdetect[ée]\s+(\d+)\s+pesos?\b", re.I)
_RE_SUMAN = re.compile(r"monedas\s+de\s+(\d+)\s+pesos?\s+suman\s+(\d+)\s+pesos?", re.I)
_RE_HAY_TOTAL = re.compile(r"\bhay\s+(\d+|[a-záéíóúñ]+)\s+monedas?\s+en\s+total\b", re.I)
_RE_DENOM = re.compile(r"\bmonedas?\s+de\s+(\d+)\b", re.I)


def verificar(resp: str, c: dict, auto: bool = False):
    """Devuelve (ok, motivos). Comprueba que cada cifra y cada afirmación de la respuesta coincidan con los hechos."""
    motivos = []
    if not resp or len(resp) > 400:
        return False, ["respuesta vacía o demasiado larga"]
    es_alcance = resp.strip() in (ALCANCE, LIMITE) or resp.startswith("Solo puedo explicar") or resp.startswith("No puedo saberlo")
    if es_alcance:
        return True, []
    ok_nums = permitidos(c)
    for n in numeros(resp):
        if n not in ok_nums:
            motivos.append(f"cifra no respaldada: {n}")
    for d in list(map(int, _RE_DENOM.findall(resp))) + [int(m.group(2)) for m in _RE_CONT.finditer(resp)]:
        if d not in VALIDAS:
            motivos.append(f"denominación inexistente: {d}")
    for m in _RE_PRIMERA.finditer(resp):
        n, d = _a_numero(m.group(1)), int(m.group(2))
        if n is not None and d in VALIDAS and n != c[d]:  # «Las monedas de 5…» no es una cantidad
            motivos.append(f"cantidad incorrecta de monedas de {d}: {n}")
    for m in _RE_CONT.finditer(resp):
        n, d = _a_numero(m.group(1)), int(m.group(2))
        if n is not None and d in VALIDAS and n != c[d]:
            motivos.append(f"cantidad incorrecta de monedas de {d}: {n}")
    for m in _RE_TOTAL.finditer(resp):
        t = int(m.group(1) or m.group(2))
        if t != total_pesos(c):
            motivos.append(f"total incorrecto: {t}")
    for m in _RE_SUMAN.finditer(resp):
        d, s = int(m.group(1)), int(m.group(2))
        if d in VALIDAS and s != d * c[d]:
            motivos.append(f"subtotal incorrecto de {d}: {s}")
    for m in _RE_HAY_TOTAL.finditer(resp):
        n = _a_numero(m.group(1))
        if n != total_monedas(c):
            motivos.append(f"total de monedas incorrecto: {n}")
    if auto:  # la explicación automática debe mencionar el total y cada denominación presente
        if total_monedas(c) and str(total_pesos(c)) not in resp:
            motivos.append("falta el total")
        for d in DENOMS:
            if c[d] and not re.search(rf"\bde\s+{d}\b", resp):
                motivos.append(f"falta la denominación {d}")
    return (not motivos), motivos


def mensajes(c: dict, pregunta: str, corregido: bool = False) -> list:
    return [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": f"{hechos(c, corregido)}\nPregunta: {pregunta}"},
    ]
